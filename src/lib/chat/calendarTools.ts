import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, eventDate, londonToday, weekdayOf, weekStartFor, slotForHour, type DayName, type SlotName } from "@/lib/opportunities/schedule";
import { placeOpenTimeChoice } from "@/lib/surprise/placeInSlot";
import { intervalsOnDate } from "@/lib/someTime/openingHours";
import { slotsOverlapping } from "@/lib/someTime/meets";
import { isSessionRule } from "@/lib/someTime/score";
import { loadDailyState } from "@/lib/experience/dailyStateStore";
import { buildContext, recordExperience, validateEvent } from "@/lib/experience/events";
import { addItemToCalendar, isConnected } from "@/lib/calendar/service";
import { googleConfig } from "@/lib/calendar/google";

/**
 * What the concierge can do on a member's behalf, as tools it can call while talking to them: look up the details of an event
 * it has found, put it into their plan (the My Week calendar: the same plan that "I'll do this" on Today and Explore writes to,
 * through the same placement), and add a planned item to their Google Calendar. There is no separate store for it.
 *
 * Reading is free. Changing their plan or their Google Calendar needs the member to have asked: that is decided by the caller
 * from the member's own words (see authorise.ts), passed in as `authorised`, and checked here before anything is written. The
 * model is never trusted with it. Everything else a tool is given is checked too: the activity must be a real, active one the
 * member can see, the date a sensible one, and the day and part of the day ones the event is actually on.
 */

export const CALENDAR_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_event_details",
    description:
      "Look up the verified details of one activity from the lists you were given (by its id): when it is on, where, the cost, how long, and what is already in the member's plan at that time. Use it before you offer to add something, unless the lists already tell you everything you need. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "The id= from the lists." },
        date: { type: "string", description: "Optional: a date (YYYY-MM-DD) to check for conflicts and whether it is on." },
      },
      required: ["activity_id"],
    },
  },
  {
    name: "add_to_my_plan",
    description:
      "Put an activity into the member's Lark Hour plan (their My Week calendar). Only when they have asked you to or said yes to your offer. It checks the event is really on that day and the time is free, and tells you if it could not. Never say it is added until this reports ok.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "The id= from the lists." },
        date: { type: "string", description: "The day it is for, YYYY-MM-DD. For an event with its own date, that date." },
        part_of_day: { type: "string", enum: ["morning", "afternoon", "evening"], description: "Only for a place or group with no fixed time: which part of the day. Leave out otherwise." },
      },
      required: ["activity_id", "date"],
    },
  },
  {
    name: "add_to_google_calendar",
    description:
      "Add something already in the member's plan to their Google Calendar. Only when they asked for Google Calendar or said yes to your offer. It tells you if Google Calendar is not connected. Never say it is added until this reports ok.",
    input_schema: {
      type: "object",
      properties: { item_id: { type: "string", description: "The item= id of a planned item, or the item_id that add_to_my_plan returned." } },
      required: ["item_id"],
    },
  },
];

export type ToolAction =
  | { type: "added"; title: string; day: string; slot: string; date: string; itemId: string | null }
  | { type: "google"; itemId: string };

export type ToolOutcome = { result: unknown; isError: boolean; action?: ToolAction };

export type GoogleState = "ready" | "not_switched_on" | "not_connected";

export type ToolContext = {
  member: SupabaseClient;
  admin: SupabaseClient;
  memberId: string;
  now: Date;
  /** Whether the member asked for this, from their own words. Without it nothing is written. */
  authorised: boolean;
  place?: typeof placeOpenTimeChoice;
  googleState?: () => Promise<GoogleState>;
  googleAdd?: (itemId: string) => Promise<{ error: string | null; reconnect?: boolean }>;
  recordPlanned?: (activityId: string) => Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** How far ahead something can be added: the plans people make. */
export const MAX_DAYS_AHEAD = 28;
const PARTS: SlotName[] = ["morning", "afternoon", "evening"];
const FULL_DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  expires_at: string | null;
  recurrence_rule: string | null;
  duration_minutes: number | null;
  price_estimate: number | null;
  booking_url: string | null;
  description: string | null;
};

const fail = (error: string, extra: Record<string, unknown> = {}): ToolOutcome => ({ result: { ok: false, error, ...extra }, isError: true });
const readable = (date: string) => `${FULL_DAY[weekdayOf(date)]} ${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`;
const clock = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

async function readActivity(member: SupabaseClient, id: string): Promise<ActivityRow | null> {
  const { data } = await member
    .from("activities")
    .select("id, title, category, address, date_time, expires_at, recurrence_rule, duration_minutes, price_estimate, booking_url, description")
    .eq("id", id)
    .maybeSingle();
  return (data as ActivityRow | null) ?? null;
}

/** Whether a date is one a plan can be made for: real, not past, and not too far ahead. Returns a reason if not. */
export function checkDate(date: unknown, now: Date): string | null {
  if (typeof date !== "string" || !DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return "That is not a date I can use. I need the day as YYYY-MM-DD.";
  const today = londonToday(now);
  if (date < today) return "That day has already gone.";
  if (date > addDays(today, MAX_DAYS_AHEAD)) return `That is more than ${MAX_DAYS_AHEAD} days ahead, further than I can plan.`;
  return null;
}

/** The dates in the next few weeks that a group that meets at set times is on. */
export function nextMeetings(rule: string | null, from: string, count = 4): { date: string; start: string; end: string }[] {
  const found: { date: string; start: string; end: string }[] = [];
  for (let i = 0; i <= MAX_DAYS_AHEAD && found.length < count; i++) {
    const date = addDays(from, i);
    const intervals = intervalsOnDate(rule, date);
    if (intervals && intervals.length > 0) found.push({ date, start: clock(intervals[0][0]), end: clock(intervals[0][1]) });
  }
  return found;
}

/**
 * Which part of the day an activity goes in on a date, or why it cannot go there. A one-off event only on its own day and
 * at its own time; a group that meets only on a day it meets; a place only when it is open; anything else where the member
 * asked (morning, if they did not say).
 */
export function chooseSlot(a: Pick<ActivityRow, "date_time" | "expires_at" | "recurrence_rule">, date: string, requested: SlotName | null, today: string): { slot: SlotName } | { error: string; next?: { date: string; start: string; end: string }[] } {
  const event = eventDate({ date_time: a.date_time, expires_at: a.expires_at });
  if (event) {
    if (event.date !== date) return { error: `That one is on ${readable(event.date)}, not ${readable(date)}.` };
    return { slot: slotForHour(event.hour) };
  }
  if (a.expires_at && date > a.expires_at.slice(0, 10)) return { error: `That one ends on ${readable(a.expires_at.slice(0, 10))}.` };

  const rule = a.recurrence_rule;
  const intervals = rule ? intervalsOnDate(rule, date) : null;
  if (rule && intervals !== null) {
    if (intervals.length === 0) {
      const next = nextMeetings(rule, today);
      return isSessionRule(rule) ? { error: `It does not meet on ${readable(date)}.`, next } : { error: `It is closed on ${readable(date)}.` };
    }
    const open = slotsOverlapping(intervals);
    if (isSessionRule(rule)) return { slot: slotForHour(intervals[0][0] / 60) };
    if (requested && !open.includes(requested)) return { error: `It is not open in the ${requested} on ${readable(date)}. It is open ${intervals.map(([s, e]) => `${clock(s)} to ${clock(e)}`).join(" and ")}.` };
    return { slot: requested ?? open[0] ?? "morning" };
  }
  return { slot: requested ?? "morning" };
}

function priceText(p: number | null): string {
  return p === null ? "price not known" : p === 0 ? "free" : `about £${p}`;
}

async function planFor(member: SupabaseClient, memberId: string, date: string): Promise<{ slot: string; title: string; id: string }[]> {
  const { data } = await member
    .from("itineraries")
    .select("itinerary_items(id, day_of_week, slot, member_action, activities(title))")
    .eq("member_id", memberId)
    .eq("week_start_date", weekStartFor(date))
    .maybeSingle();
  const day = weekdayOf(date) as DayName;
  return ((data?.itinerary_items ?? []) as unknown as { id: string; day_of_week: string; slot: string; member_action: string; activities: { title: string } | null }[])
    .filter((i) => i.day_of_week === day && i.member_action !== "skipped")
    .map((i) => ({ id: i.id, slot: i.slot, title: i.activities?.title ?? "something" }));
}

async function getDetails(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const id = typeof input.activity_id === "string" ? input.activity_id : "";
  if (!UUID.test(id)) return fail("That is not an activity id from the lists.");
  const a = await readActivity(ctx.member, id);
  if (!a) return fail("That activity is not available any more.");

  const today = londonToday(ctx.now);
  const event = eventDate({ date_time: a.date_time, expires_at: a.expires_at });
  const meetings = !event && isSessionRule(a.recurrence_rule) ? nextMeetings(a.recurrence_rule, today) : null;
  const kind = event ? "one_off_event" : meetings ? "group_that_meets" : a.expires_at ? "runs_until_a_date" : "place_to_visit";

  let when: string;
  if (event) {
    const start = new Date(a.date_time as string);
    when = `${readable(event.date)} at ${clock(start.getUTCHours() * 60 + start.getUTCMinutes())}`;
  } else if (meetings) {
    when = meetings.length ? `meets ${meetings.map((m) => `${readable(m.date)} ${m.start} to ${m.end}`).join("; ")}` : "no meeting in the next four weeks";
  } else if (a.expires_at) {
    when = `until ${readable(a.expires_at.slice(0, 10))}`;
  } else {
    when = "a place to visit; check opening times";
  }

  const checkOn = typeof input.date === "string" && DATE.test(input.date) ? input.date : event?.date ?? null;
  const planned = checkOn ? await planFor(ctx.member, ctx.memberId, checkOn) : [];
  const hours = checkOn && a.recurrence_rule && !event ? intervalsOnDate(a.recurrence_rule, checkOn) : null;

  return {
    isError: false,
    result: {
      ok: true,
      id: a.id,
      title: a.title,
      kind,
      when,
      address: a.address,
      cost: priceText(a.price_estimate),
      duration_minutes: a.duration_minutes,
      booking_url: a.booking_url,
      on_the_date_asked: checkOn && hours ? (hours.length ? `open or meeting ${hours.map(([s, e]) => `${clock(s)} to ${clock(e)}`).join(" and ")} on ${readable(checkOn)}` : `not on ${readable(checkOn)}`) : undefined,
      already_in_their_plan_that_day: checkOn ? planned.map((p) => `${p.slot}: ${p.title}`) : undefined,
      calendars_you_can_see: "their Lark Hour plan only (not their Google Calendar)",
    },
  };
}

async function addToPlan(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.authorised) {
    return fail("The member has not asked you to add this yet. Tell them what you would add (the name, the day and the time) and ask whether to go ahead.", { needs_confirmation: true });
  }
  const id = typeof input.activity_id === "string" ? input.activity_id : "";
  if (!UUID.test(id)) return fail("That is not an activity id from the lists.");
  const dateProblem = checkDate(input.date, ctx.now);
  if (dateProblem) return fail(dateProblem);
  const date = input.date as string;

  const a = await readActivity(ctx.member, id);
  if (!a) return fail("That activity is not available any more.");

  const requested = PARTS.includes(input.part_of_day as SlotName) ? (input.part_of_day as SlotName) : null;
  const chosen = chooseSlot(a, date, requested, londonToday(ctx.now));
  if ("error" in chosen) return fail(chosen.error, chosen.next ? { next_meetings: chosen.next.map((m) => `${readable(m.date)} ${m.start} to ${m.end}`) } : {});

  const place = ctx.place ?? placeOpenTimeChoice;
  const placed = await place(ctx.member, ctx.admin, ctx.memberId, id, chosen.slot, ctx.now, "You asked the concierge to add this.", date);
  if (placed.error) {
    return fail(/already planned/i.test(placed.error) ? `Something is already planned on ${readable(date)} in the ${chosen.slot}. You could offer another part of the day or another day.` : placed.error);
  }

  // The item's id, so it can go on to Google Calendar. Found, not assumed: it is the one in that day and part of the day.
  const day = weekdayOf(date) as DayName;
  const item = (await planFor(ctx.member, ctx.memberId, date)).find((p) => p.slot === chosen.slot);
  try {
    await (ctx.recordPlanned ?? defaultRecordPlanned(ctx))(id);
  } catch {
    // Learning from it is a bonus.
  }

  return {
    isError: false,
    result: { ok: true, added: true, title: a.title, day: FULL_DAY[day], date, part_of_day: chosen.slot, item_id: item?.id ?? null },
    action: { type: "added", title: a.title, day: FULL_DAY[day], slot: chosen.slot, date, itemId: item?.id ?? null },
  };
}

function defaultRecordPlanned(ctx: ToolContext) {
  return async (activityId: string) => {
    const planned = validateEvent({ type: "planned", activityId });
    if (!planned) return;
    const state = await loadDailyState(ctx.member, ctx.memberId, londonToday(ctx.now));
    await recordExperience(ctx.member, ctx.memberId, [{ ...planned, context: buildContext(state, {}) }]);
  };
}

async function addToGoogle(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.authorised) {
    return fail("The member has not asked for Google Calendar yet. Ask whether they would like it there too.", { needs_confirmation: true });
  }
  const itemId = typeof input.item_id === "string" ? input.item_id : "";
  if (!UUID.test(itemId)) return fail("That is not the id of a planned item.");

  const state = await (ctx.googleState ?? defaultGoogleState(ctx))();
  if (state === "not_switched_on") return fail("Google Calendar is not switched on in Lark Hour yet, so it cannot be added there.");
  if (state === "not_connected") return fail("Their Google Calendar is not connected. They can connect it in Account, and then ask again.");

  const result = await (ctx.googleAdd ?? defaultGoogleAdd(ctx))(itemId);
  if (result.error) return fail(result.reconnect ? "Google no longer lets Lark Hour reach their calendar. They can connect it again in Account." : result.error);
  return { isError: false, result: { ok: true, added: true, calendar: "Google Calendar" }, action: { type: "google", itemId } };
}

function defaultGoogleState(ctx: ToolContext) {
  return async (): Promise<GoogleState> => {
    if (!googleConfig()) return "not_switched_on";
    return (await isConnected(ctx.admin, ctx.memberId)) ? "ready" : "not_connected";
  };
}

function defaultGoogleAdd(ctx: ToolContext) {
  return async (itemId: string) => {
    const config = googleConfig();
    if (!config) return { error: "Google Calendar is not switched on." };
    return addItemToCalendar(ctx.memberId, itemId, { member: ctx.member, admin: ctx.admin, config });
  };
}

/** Runs one tool the model asked for. Never throws: a failure goes back to the model as a result it can explain. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const args = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  try {
    if (name === "get_event_details") return await getDetails(args, ctx);
    if (name === "add_to_my_plan") return await addToPlan(args, ctx);
    if (name === "add_to_google_calendar") return await addToGoogle(args, ctx);
    return fail("That is not something you can do.");
  } catch (err) {
    console.warn(`concierge tool ${name} failed:`, err instanceof Error ? err.message : err);
    return fail("Something went wrong on our side, and nothing was changed.");
  }
}
