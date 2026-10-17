/**
 * Tidying what a model wrote into a field, so a placeholder is never mistaken for a fact: an address of "unknown" is not an
 * address (it would be looked up on the map and could land anywhere), and a start time of midnight is a date with no time given.
 */

const NO_ADDRESS = /^(unknown|unknown address|tbc|tba|n\/a|na|none|various( locations?)?|varies|multiple locations?|several locations?|see (the )?(website|page)|online|not (stated|given|known|specified))\.?$/i;

/** The address, or null when it says it is not known. Pure. */
export function cleanAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text && !NO_ADDRESS.test(text) ? text : null;
}

const MIDNIGHT = /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?$/;
/** The start time to use when a page gave only a day. Mornings are when most of what we list happens, and the card says to check. */
export const DEFAULT_START = "10:00:00";

/** Whether an ISO date-time is a day with no time (midnight is how a date with no time arrives). Pure. */
export function hasNoTime(iso: string | null | undefined): boolean {
  return Boolean(iso) && MIDNIGHT.test((iso as string).trim());
}

/**
 * A date-time that can be offered: a day with no time given is put at a morning start, with a note to add to the description, so
 * it is not an event "starting at midnight" that can never be reached. Anything with a real time is left as it is. Pure.
 */
export function startOf(iso: string | null | undefined): { dateTime: string | null; timeGiven: boolean } {
  if (!iso) return { dateTime: null, timeGiven: false };
  if (!hasNoTime(iso)) return { dateTime: iso, timeGiven: true };
  return { dateTime: `${iso.trim().slice(0, 10)}T${DEFAULT_START}Z`, timeGiven: false };
}

export const TIME_NOT_GIVEN_NOTE = "The page gave the day but not the start time: check it before going.";
