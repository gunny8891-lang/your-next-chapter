import { isWetDay, type DayForecast } from "@/lib/nudges/weather";
import { SLOTS } from "@/lib/itinerary/schema";
import { addDays, eventDate, fitsDates, slotForHour, weekdayOf, type SlotName } from "@/lib/opportunities/schedule";

export type SurpriseWhen = "today" | "tomorrow" | "weekend";
export type SurpriseWho = "just_me" | "partner" | "friends" | "family";

/** Narrows untrusted input (it arrives from the browser) to a real slot. */
export function parseSlot(value: unknown): SlotName | null {
  return SLOTS.includes(value as SlotName) ? (value as SlotName) : null;
}

type ContextCandidate = { title?: string; tags: string[]; date_time: string | null; expires_at: string | null };

export type OpenTimeContext = {
  when: SurpriseWhen;
  who: SurpriseWho;
  /** Which part of today is free, when asked from Today's Open Time card. */
  slot: SlotName | null;
  /** The member's calendar date (London). */
  today: string;
  /** null when the forecast is unavailable — weather is then simply not considered. */
  forecast: DayForecast[] | null;
};

// Tags that mean being outside. Wet weather rules these out; it never adds to them.
const OUTDOOR_TAGS = ["outdoors", "walking", "nature", "gardens", "playground"];
// Places that are for children. The "grandchildren" tag is too broad to tell these apart (it is also
// on parks and gardens), so they are caught by what they are called.
const KIDS_VENUE_NAME = /\b(soft play|toddlers?|kids|children.?s|playground|nursery)\b/i;
const MAX_DATED_PROMOTED = 5;
const MAX_FAMILY_PROMOTED = 5;

/** The calendar dates a request covers. A weekend asked for on a Saturday or Sunday means what is left of it. */
export function windowDates(when: SurpriseWhen, today: string): string[] {
  if (when === "tomorrow") return [addDays(today, 1)];
  if (when === "weekend") {
    const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayOf(today));
    if (weekdayIndex === 6) return [today]; // Sunday
    const saturday = addDays(today, (5 - weekdayIndex + 7) % 7);
    return [saturday, addDays(saturday, 1)];
  }
  return [today];
}

function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function describeWindow(dates: string[]): string {
  return dates.map(dayLabel).join(" and ");
}

/**
 * Narrows and orders an already-ranked candidate list for one Open Time request,
 * before any AI is involved:
 *  - a one-off event only if it is on a requested day (and in the free part of
 *    the day, when one is given); a run only if it hasn't ended;
 *  - nothing outdoors when every requested day is wet;
 *  - playgrounds only when the member is with family;
 *  - events actually happening in the window, and family-suited places for a
 *    family outing, move to the front so the shortlist can't cut them off.
 * Ranking order is otherwise preserved.
 */
export function applyOpenTimeContext<T extends ContextCandidate>(
  ranked: T[],
  ctx: OpenTimeContext
): { candidates: T[]; dates: string[]; weatherNote: string | null } {
  const dates = windowDates(ctx.when, ctx.today);

  const windowForecast = (ctx.forecast ?? []).filter((d) => dates.includes(d.date));
  const allWet = windowForecast.length > 0 && windowForecast.every(isWetDay);
  const weatherNote = windowForecast.length
    ? windowForecast
        .map((d) => `${dayLabel(d.date)}: ${Math.round(d.temperatureMax)}°C, ${d.precipitationProbabilityMax}% chance of rain`)
        .join("; ") + (allWet ? " (wet — outdoor options have been removed)" : "")
    : null;

  const isDated = (a: T) => eventDate(a) !== null;

  const kept = ranked.filter((a) => {
    if (!fitsDates(a, dates)) return false;

    const event = eventDate(a);
    if (event && ctx.slot && slotForHour(event.hour) !== ctx.slot) return false;

    if (allWet && a.tags.some((t) => OUTDOOR_TAGS.includes(t))) return false;
    if (ctx.who !== "family" && (a.tags.includes("playground") || KIDS_VENUE_NAME.test(a.title ?? ""))) return false;
    return true;
  });

  const promoted = new Set<T>();
  kept.filter(isDated).slice(0, MAX_DATED_PROMOTED).forEach((a) => promoted.add(a));
  if (ctx.who === "family") {
    kept.filter((a) => a.tags.includes("grandchildren")).slice(0, MAX_FAMILY_PROMOTED).forEach((a) => promoted.add(a));
  }

  return { candidates: [...promoted, ...kept.filter((a) => !promoted.has(a))], dates, weatherNote };
}
