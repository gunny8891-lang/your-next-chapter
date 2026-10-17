/**
 * Tidying what a model wrote into a field, so a placeholder is never mistaken for a fact: an address of "unknown" is not an
 * address (it would be looked up on the map and could land anywhere), and a start time of midnight (or no time at all) is a
 * date with no time given.
 */

const NO_ADDRESS = /^(unknown|unknown address|tbc|tba|n\/a|na|none|various( locations?)?|varies|multiple locations?|several locations?|see (the )?(website|page)|online|not (stated|given|known|specified))\.?$/i;

/** The address, or null when it says it is not known. Pure. */
export function cleanAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text && !NO_ADDRESS.test(text) ? text : null;
}

/** The day, and the clock time if there is one, whatever sits after it (seconds, a Z, an offset such as +01:00). */
const DAY_AND_TIME = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** The start time to use when a page gave only a day. Mornings are when most of what we list happens, and the card says to check. */
export const DEFAULT_START = "10:00:00";

/** Whether an ISO date or date-time is a day with no time: a bare date, or midnight (how a date with no time often arrives). Pure. */
export function hasNoTime(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const m = DAY_AND_TIME.exec(iso.trim());
  return Boolean(m) && (m![2] === undefined || (m![2] === "00" && m![3] === "00"));
}

/**
 * A start that can be offered. The app keeps the time on the clock as written (10:00 is stored as 10:00 with a Z, as every
 * source does), so an offset such as +01:00 is dropped and the clock time kept: 19:00+01:00 is 19:00, not 18:00. A day with no
 * time given is put at a morning start, with a note to add to the description, so it is not an event "starting at midnight" that
 * can never be reached. Pure.
 */
export function startOf(iso: string | null | undefined): { dateTime: string | null; timeGiven: boolean } {
  if (!iso) return { dateTime: null, timeGiven: false };
  const m = DAY_AND_TIME.exec(iso.trim());
  if (!m) return { dateTime: iso, timeGiven: true };
  if (hasNoTime(iso)) return { dateTime: `${m[1]}T${DEFAULT_START}Z`, timeGiven: false };
  return { dateTime: `${m[1]}T${m[2]}:${m[3]}:00Z`, timeGiven: true };
}

export const TIME_NOT_GIVEN_NOTE = "The page gave the day but not the start time: check it before going.";
