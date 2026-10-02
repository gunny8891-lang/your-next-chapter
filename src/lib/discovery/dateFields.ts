// Shared by the Claude-based discovery sources so they describe — and parse —
// event dates the same way.
//
// The distinction matters because the app treats date_time as "a one-off
// event that is over once it starts". Attaching a single sample date to a
// recurring walk or an ongoing exhibition (which earlier extractions did)
// makes it look finished days into a run that lasts weeks.

export const DATE_FIELD_PROMPT = `"dateTime": string|null (ISO 8601 start time for a SINGLE one-off event with one \
specific date and time ONLY — leave it null for anything that runs on many dates, such as a recurring session, a series \
of walks or tours, or an ongoing exhibition, and for standing groups and venues), "availableUntil": string|null (the \
last day an ongoing exhibition, seasonal run or multi-date series is available, as an ISO 8601 date, ONLY if the page \
states an end date; otherwise null)`;

// Strict on purpose: JavaScript's Date will happily read "through to 1 November"
// as 1 November 2001, turning a model's prose into a plausible-looking wrong
// date that would expire an item immediately.
const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** True only for a real ISO 8601 date or date-time (and a real calendar day — not 2026-02-31). */
export function isValidIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_8601.exec(value.trim());
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
}

/** A valid ISO timestamp, or null. A bare date is read as the END of that day (it is a last-available day). */
export function parseAvailableUntil(value: unknown): string | null {
  if (!isValidIso(value)) return null;
  const text = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59Z` : text;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
