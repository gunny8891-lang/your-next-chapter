import { addDays, type DayName } from "@/lib/opportunities/schedule";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";
import { isUnknownDetail } from "@/lib/itinerary/format";
import { worthSharing } from "@/lib/act/share";

/**
 * Turns one planned item into a calendar event. Pure: no network, no database.
 *
 * Times are London wall-clock (the app is UK-only), sent to Google with the zone named
 * rather than as a fixed offset, so a plan made in March for an outing in April lands at
 * the right hour on both sides of the clocks changing.
 *
 * A plan says "Saturday afternoon" far more often than "Saturday at 2.15", so unless the
 * activity is a one-off event with a real start time, the event gets a sensible default
 * hour for that part of the day and says in its description that the time is approximate.
 */

export const CALENDAR_TIME_ZONE = "Europe/London";

/** Where a part of the day starts in a calendar, when the activity gives no time of its own. */
export const SLOT_START: Record<"morning" | "afternoon" | "evening", string> = {
  morning: "10:00",
  afternoon: "14:00",
  evening: "18:30",
};

const DEFAULT_DURATION_MINUTES = 90;
const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 8 * 60;

export type ItemForCalendar = {
  weekStart: string; // YYYY-MM-DD, the Monday
  day: string; // "Mon".."Sun"
  slot: string; // "morning" | "afternoon" | "evening"
  title: string;
  address: string | null;
  /** The activity's own date_time, read as UTC wall-clock (see schedule.ts). Null for places and ongoing things. */
  dateTime: string | null;
  /** Set for a run or series, which is not a single event with its own start. */
  expiresAt: string | null;
  durationMinutes: number | null;
  bookingUrl: string | null;
  why: string | null;
};

export type CalendarEventBody = {
  summary: string;
  location?: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  // Our own reminder rather than whatever the calendar defaults to, so a plan for a quiet
  // morning does not buzz at an odd hour.
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Adds minutes to a local "YYYY-MM-DD" + "HH:MM", returning the same local format. Day-rollover safe. */
export function addLocalMinutes(date: string, clock: string, minutes: number): { date: string; clock: string } {
  const [h, m] = clock.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / 1440);
  const within = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, dayShift), clock: `${pad(Math.floor(within / 60))}:${pad(within % 60)}` };
}

export function dateOfDay(weekStart: string, day: string): string | null {
  const index = (DAYS_OF_WEEK as readonly string[]).indexOf(day as DayName);
  return index === -1 ? null : addDays(weekStart, index);
}

/** The event for an item, or null when the item cannot be placed on a date. */
export function buildCalendarEvent(item: ItemForCalendar): CalendarEventBody | null {
  const oneOff = item.dateTime && !item.expiresAt ? new Date(item.dateTime) : null;
  const hasOwnTime = oneOff !== null && !Number.isNaN(oneOff.getTime());

  let date: string;
  let clock: string;
  if (hasOwnTime) {
    // The hour stored is the hour shown (see schedule.ts), so read the UTC parts.
    date = oneOff!.toISOString().slice(0, 10);
    clock = `${pad(oneOff!.getUTCHours())}:${pad(oneOff!.getUTCMinutes())}`;
  } else {
    const planned = dateOfDay(item.weekStart, item.day);
    const start = SLOT_START[item.slot as keyof typeof SLOT_START];
    if (!planned || !start) return null;
    date = planned;
    clock = start;
  }

  const minutes = Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, item.durationMinutes ?? DEFAULT_DURATION_MINUTES));
  const end = addLocalMinutes(date, clock, minutes);

  const lines: string[] = [];
  if (item.why) lines.push(item.why);
  const more = worthSharing(item.bookingUrl);
  if (more) lines.push(`More information or booking: ${more}`);
  if (!hasOwnTime) lines.push(`Planned for ${item.day} ${item.slot}. The time here is a suggestion: adjust it to suit you.`);
  lines.push("Added from Lark Hour.");

  const location = item.address && !isUnknownDetail(item.address) ? item.address : undefined;
  return {
    summary: item.title,
    ...(location ? { location } : {}),
    description: lines.join("\n\n"),
    start: { dateTime: `${date}T${clock}:00`, timeZone: CALENDAR_TIME_ZONE },
    end: { dateTime: `${end.date}T${end.clock}:00`, timeZone: CALENDAR_TIME_ZONE },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
  };
}
