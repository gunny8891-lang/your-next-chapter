import type { DayName } from "@/lib/opportunities/schedule";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";

/**
 * A small reader for OpenStreetMap opening_hours — enough of the syntax to cover
 * what real cafés, pubs, libraries and leisure centres publish, such as
 * "Mo-Fr 07:00-16:30; Sa 08:00-15:00; Su off" or "Tu-Su 12:00-14:30,17:30-22:00".
 *
 * Deliberately conservative: if anything in a rule is not understood (sunrise,
 * "unsigned", month ranges…) the whole string is treated as unknown rather than
 * guessed at, and unknown is never turned into "closed". A venue we are unsure
 * about can still be suggested; one we are sure is shut is not.
 */

/** [start, end] in minutes after midnight; end may run past 1440 for places open after midnight. */
type Interval = [number, number];
type Week = Interval[][]; // Monday = 0 … Sunday = 6

const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseDays(part: string): number[] | null {
  const days = new Set<number>();
  for (const token of part.split(",")) {
    const t = token.trim();
    if (!t) continue;
    const range = t.match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/);
    if (range) {
      const from = DAY_CODES.indexOf(range[1]);
      const to = DAY_CODES.indexOf(range[2]);
      if (from < 0 || to < 0) return null;
      for (let d = from; ; d = (d + 1) % 7) {
        days.add(d);
        if (d === to) break;
      }
    } else {
      const day = DAY_CODES.indexOf(t);
      if (day < 0) return null;
      days.add(day);
    }
  }
  return days.size ? [...days] : null;
}

function parseTimes(part: string): Interval[] | null {
  const intervals: Interval[] = [];
  for (const token of part.split(",")) {
    const m = token.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    // 12:00-00:00 means "until midnight"; 22:00-02:00 means "until 2am the next day".
    if (end <= start) end += 1440;
    if (start >= 1440) return null;
    intervals.push([start, end]);
  }
  return intervals.length ? intervals : null;
}

/** Parses opening hours into the intervals for each weekday, or null if not understood. */
export function parseOpeningHours(raw: string | null | undefined): Week | null {
  const text = raw?.trim();
  if (!text) return null;
  const week: Week = [[], [], [], [], [], [], []];

  if (/^24\s*\/\s*7$/.test(text)) return week.map(() => [[0, 1440]] as Interval[]);

  for (const rawRule of text.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;

    // A rule purely about public or school holidays ("PH off") changes things we
    // cannot see; skip it rather than mistaking it for a normal day being closed.
    if (/^(PH|SH)(\s*,\s*(PH|SH))*(\s|$)/.test(rule)) continue;
    // But "Sa-Su,SH 11:00-16:00" is still weekend hours: drop the holiday token, keep the days.
    const ordinary = rule.replace(/\s*,\s*(PH|SH)\b/g, "").replace(/\b(PH|SH)\s*,\s*/g, "");

    const match = ordinary.match(/^(?:([A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?)*)\s+)?(off|closed|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)$/i);
    if (!match) return null;

    const days = match[1] ? parseDays(match[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;

    const timesText = match[2];
    const intervals = /^(off|closed)$/i.test(timesText) ? [] : parseTimes(timesText);
    if (!intervals) return null;

    // Later rules replace earlier ones for the days they name.
    for (const day of days) week[day] = intervals;
  }
  return week;
}

export type OpenStatus =
  | { status: "open"; closesAt: number | null }
  | { status: "closed" }
  | { status: "unknown" };

/**
 * Whether a place is open for a visit starting at `arriveMin` on `weekday`.
 * "Open" means open on arrival and staying open for at least the first half hour
 * (or the whole visit, if shorter) — enough that you are not turned away or
 * rushed out. `closesAt` is minutes after midnight (may exceed 1440).
 */
export function openStatus(raw: string | null | undefined, weekday: DayName, arriveMin: number, stayMinutes: number): OpenStatus {
  const week = parseOpeningHours(raw);
  if (!week) return { status: "unknown" };

  const day = DAYS_OF_WEEK.indexOf(weekday);
  const yesterday = (day + 6) % 7;
  const needUntil = arriveMin + Math.min(Math.max(stayMinutes, 0), 30);

  // Today's intervals, plus anything from last night that runs past midnight.
  const candidates: Interval[] = [
    ...week[day],
    ...week[yesterday].filter(([, end]) => end > 1440).map(([start, end]): Interval => [start - 1440, end - 1440]),
  ];
  const fit = candidates.find(([start, end]) => start <= arriveMin && needUntil <= end);
  return fit ? { status: "open", closesAt: fit[1] } : { status: "closed" };
}
