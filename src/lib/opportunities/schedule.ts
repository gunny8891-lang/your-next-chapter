import { DAYS_OF_WEEK, SLOTS, type GeneratedItem } from "@/lib/itinerary/schema";

/**
 * Date logic shared by every surface that places something in time (the weekly
 * planner, Surprise Me, Open Time). Plain code, no I/O.
 *
 * One convention matters: an activity's date_time is read as UTC wall-clock,
 * i.e. the hour stored is the hour shown. Event pages give local UK times with
 * no zone and Postgres stores them as if UTC; formatTime renders them back in
 * the server's zone (UTC on Vercel), so the member sees the time the venue
 * published. Reading UTC parts here keeps planning consistent with that.
 * (Ticketmaster supplies true UTC instants, which can look an hour off in BST —
 * an existing quirk this does not change.)
 */

export type DayName = (typeof DAYS_OF_WEEK)[number];
export type SlotName = (typeof SLOTS)[number];

type Dated = { date_time: string | null; expires_at: string | null };

/** Monday of the week containing `isoDate` (YYYY-MM-DD), matching itineraries.week_start_date. */
export function weekStartFor(isoDate: string): string {
  const diffToMonday = (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(isoDate, -diffToMonday);
}

/** Monday of the current week as YYYY-MM-DD (UTC), matching itineraries.week_start_date. */
export function getCurrentWeekStart(now: Date = new Date()): string {
  return weekStartFor(now.toISOString().slice(0, 10));
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(isoDate: string): DayName {
  return DAYS_OF_WEEK[(new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7];
}

/** Mon..Sun → YYYY-MM-DD for the week starting `weekStart`. */
export function weekDates(weekStart: string): Record<DayName, string> {
  return Object.fromEntries(DAYS_OF_WEEK.map((day, i) => [day, addDays(weekStart, i)])) as Record<DayName, string>;
}

/** The member's calendar date. The app is UK-only, so "today" is London's, not the server's. */
export function londonToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The Monday that starts the week containing today's London date. */
export function londonWeekStart(now: Date = new Date()): string {
  return weekStartFor(londonToday(now));
}

/** The Monday after the current (London) week: the week the Sunday-evening plan is for. */
export function nextLondonWeekStart(now: Date = new Date()): string {
  return addDays(londonWeekStart(now), 7);
}

/**
 * Which week the member's plan screens (My Week, and anything that rebuilds the plan) are
 * about. Normally this week. On a Sunday (London), once next week's plan exists, it is next
 * week: the Sunday-evening job makes it, and from then on that is the week to look at. Today
 * is unaffected and always uses the week it is in. `available` is the week starts the
 * member has a plan for.
 */
export function weekToShow(available: readonly string[], now: Date = new Date()): string {
  const today = londonToday(now);
  const current = weekStartFor(today);
  const next = addDays(current, 7);
  return weekdayOf(today) === "Sun" && available.includes(next) ? next : current;
}

export function slotForHour(hour: number): SlotName {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** A single event at one date and time (as opposed to a run, a series or a standing venue). */
export function isOneOff(a: Dated): boolean {
  return Boolean(a.date_time) && !a.expires_at;
}

export function eventDate(a: Dated): { date: string; hour: number } | null {
  if (!isOneOff(a)) return null;
  const d = new Date(a.date_time!);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

/** Last day an ongoing item is available, or null if it has no stated end. */
export function availableUntilDate(a: Dated): string | null {
  return a.expires_at ? a.expires_at.slice(0, 10) : null;
}

/**
 * Whether something can happen on at least one of `dates` (YYYY-MM-DD, ascending):
 * a one-off must fall on one of them, a run must not have ended before the first,
 * and standing items always fit.
 */
export function fitsDates(a: Dated, dates: string[]): boolean {
  if (isOneOff(a)) {
    const event = eventDate(a);
    return event !== null && dates.includes(event.date);
  }
  const until = availableUntilDate(a);
  if (until && dates.length > 0) return until >= dates[0];
  return true;
}

/** "Thu 5 Nov, 10:30" for a one-off, "available until 1 Nov" for a run, null for standing items. */
export function describeWhen(a: Dated): string | null {
  const event = eventDate(a);
  if (event) {
    const d = new Date(a.date_time!);
    const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    return `${day}, ${time}`;
  }
  const until = availableUntilDate(a);
  if (until) {
    const day = new Date(`${until}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return `available until ${day}`;
  }
  return null;
}

/**
 * Makes a generated week agree with the calendar. The model is told each event's
 * date, but a plan must never depend on it obeying: a one-off event is moved to
 * its real day and part of the day, and a run is never placed after it ends.
 * Other items keep their place unless it is taken, in which case they move to the
 * nearest free one — Today shows a single item per slot, so two in one slot would
 * hide one of them. An item that can't be placed anywhere is dropped.
 */
export function alignToEvents(
  items: GeneratedItem[],
  activities: ({ id: string } & Dated)[],
  weekStart: string
): GeneratedItem[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const dates = weekDates(weekStart);
  const taken = new Set<string>();
  const slotKey = (day: string, slot: string) => `${day}|${slot}`;
  const placed: GeneratedItem[] = [];

  const pinned: GeneratedItem[] = [];
  const loose: GeneratedItem[] = [];
  for (const item of items) {
    const activity = byId.get(item.activity_id);
    const event = activity ? eventDate(activity) : null;
    if (!event) {
      loose.push(item);
      continue;
    }
    const day = DAYS_OF_WEEK.find((d) => dates[d] === event.date);
    // An event outside the plan's week should have been filtered out before the
    // model ever saw it; if one slips through, leaving it out beats misplacing it.
    if (day) pinned.push({ ...item, day, slot: slotForHour(event.hour) });
  }

  for (const item of pinned) {
    let slot: SlotName | undefined = item.slot;
    if (taken.has(slotKey(item.day, slot))) slot = SLOTS.find((s) => !taken.has(slotKey(item.day, s)));
    // Two events in the same slot with no free slot left that day: keep both.
    const final = slot ?? item.slot;
    taken.add(slotKey(item.day, final));
    placed.push({ ...item, slot: final });
  }

  for (const item of loose) {
    const activity = byId.get(item.activity_id);
    const until = activity ? availableUntilDate(activity) : null;
    const dayOk = (day: DayName) => !until || dates[day] <= until;

    const preferred: { day: DayName; slot: SlotName }[] = [
      { day: item.day, slot: item.slot },
      ...SLOTS.map((slot) => ({ day: item.day, slot })),
      ...DAYS_OF_WEEK.flatMap((day) => SLOTS.map((slot) => ({ day, slot }))),
    ];
    const spot = preferred.find((p) => dayOk(p.day) && !taken.has(slotKey(p.day, p.slot)));
    if (!spot) continue;
    taken.add(slotKey(spot.day, spot.slot));
    placed.push({ ...item, day: spot.day, slot: spot.slot });
  }

  // Back into week order so the result reads like a plan.
  const order = (i: GeneratedItem) => DAYS_OF_WEEK.indexOf(i.day) * 3 + SLOTS.indexOf(i.slot);
  return placed.sort((a, b) => order(a) - order(b));
}
