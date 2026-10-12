import type { DayName } from "@/lib/opportunities/schedule";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";

/**
 * A small reader for OpenStreetMap opening_hours — enough of the syntax to cover
 * what real cafés, pubs, libraries and leisure centres publish, such as
 * "Mo-Fr 07:00-16:30; Sa 08:00-15:00; Su off" or "Tu-Su 12:00-14:30,17:30-22:00",
 * and what a club or group publishes about when it meets: "Th 14:00-16:00", or
 * "Mo[2,4] 10:00-12:00" for the 2nd and 4th Monday of the month ("Fr[-1]" is the last).
 *
 * Deliberately conservative: if anything in a rule is not understood (sunrise,
 * "unsigned", month ranges…) the whole string is treated as unknown rather than
 * guessed at, and unknown is never turned into "closed". A venue we are unsure
 * about can still be suggested; one we are sure is shut is not.
 */

/** [start, end] in minutes after midnight; end may run past 1440 for places open after midnight. */
export type Interval = [number, number];
type Week = Interval[][]; // Monday = 0 … Sunday = 6

/** A rule that holds only on certain weeks of the month: nth is 1..5 from the start, -1 for the last. */
type MonthlyRule = { day: number; nth: number[]; intervals: Interval[] };

export type Schedule = {
  /** What holds every week. */
  week: Week;
  /** What holds only on certain weeks of the month. */
  monthly: MonthlyRule[];
};

const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Splits on commas that are not inside square brackets: "Mo[2,4],We" is two items. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "[") depth += 1;
    if (ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** "2,4" or "1-3" or "-1" as week-of-month numbers, or null if it is not a sensible list. */
function parseNth(text: string): number[] | null {
  const found = new Set<number>();
  for (const raw of text.split(",")) {
    const t = raw.trim();
    const range = t.match(/^([1-5])\s*-\s*([1-5])$/);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) found.add(n);
      continue;
    }
    if (/^-1$/.test(t)) {
      found.add(-1);
      continue;
    }
    if (/^[1-5]$/.test(t)) {
      found.add(Number(t));
      continue;
    }
    return null;
  }
  return found.size ? [...found] : null;
}

type DayPick = { day: number; nth: number[] | null };

function parseDays(part: string): DayPick[] | null {
  const picks: DayPick[] = [];
  for (const token of splitTop(part)) {
    const t = token.trim();
    if (!t) continue;
    const range = t.match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/);
    if (range) {
      const from = DAY_CODES.indexOf(range[1]);
      const to = DAY_CODES.indexOf(range[2]);
      if (from < 0 || to < 0) return null;
      for (let d = from; ; d = (d + 1) % 7) {
        picks.push({ day: d, nth: null });
        if (d === to) break;
      }
      continue;
    }
    const monthly = t.match(/^([A-Za-z]{2})\[([^\]]+)\]$/);
    if (monthly) {
      const day = DAY_CODES.indexOf(monthly[1]);
      const nth = parseNth(monthly[2]);
      if (day < 0 || !nth) return null;
      picks.push({ day, nth });
      continue;
    }
    const day = DAY_CODES.indexOf(t);
    if (day < 0) return null;
    picks.push({ day, nth: null });
  }
  return picks.length ? picks : null;
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

/** The days part of a rule: one or more of "Mo", "Mo-Fr", "Mo[2,4]", comma separated. */
const DAYS_PART = String.raw`[A-Za-z]{2}(?:\[[0-9,\s-]+\]|\s*-\s*[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:\[[0-9,\s-]+\]|\s*-\s*[A-Za-z]{2})?)*`;
const TIME = String.raw`\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}`;
const RULE = new RegExp(`^(?:(${DAYS_PART})\\s+)?(off|closed|${TIME}(?:\\s*,\\s*${TIME})*)$`, "i");

/** Parses a schedule: what holds every week, and what holds only on certain weeks of the month. Null if not understood. */
export function parseSchedule(raw: string | null | undefined): Schedule | null {
  const text = raw?.trim();
  if (!text) return null;
  const week: Week = [[], [], [], [], [], [], []];
  const monthly: MonthlyRule[] = [];

  if (/^24\s*\/\s*7$/.test(text)) return { week: week.map(() => [[0, 1440]] as Interval[]), monthly };

  for (const rawRule of text.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;

    // A rule purely about public or school holidays ("PH off") changes things we
    // cannot see; skip it rather than mistaking it for a normal day being closed.
    if (/^(PH|SH)(\s*,\s*(PH|SH))*(\s|$)/.test(rule)) continue;
    // But "Sa-Su,SH 11:00-16:00" is still weekend hours: drop the holiday token, keep the days.
    const ordinary = rule.replace(/\s*,\s*(PH|SH)\b/g, "").replace(/\b(PH|SH)\s*,\s*/g, "");

    const match = ordinary.match(RULE);
    if (!match) return null;

    const picks = match[1] ? parseDays(match[1]) : [0, 1, 2, 3, 4, 5, 6].map((day): DayPick => ({ day, nth: null }));
    if (!picks) return null;

    const timesText = match[2];
    const off = /^(off|closed)$/i.test(timesText);
    const intervals = off ? [] : parseTimes(timesText);
    if (!intervals) return null;

    for (const pick of picks) {
      if (pick.nth) {
        // "Off" on certain weeks of the month is not something this keeps: treat it as not understood.
        if (off) return null;
        monthly.push({ day: pick.day, nth: pick.nth, intervals });
      } else {
        // Later rules replace earlier ones for the days they name.
        week[pick.day] = intervals;
      }
    }
  }
  return { week, monthly };
}

/**
 * Parses opening hours into the intervals for each weekday, or null if not understood. A schedule that only holds on some
 * weeks of the month cannot be shown as a plain week, so it is "not understood" here: use parseSchedule and a date.
 */
export function parseOpeningHours(raw: string | null | undefined): Week | null {
  const schedule = parseSchedule(raw);
  if (!schedule || schedule.monthly.length > 0) return null;
  return schedule.week;
}

/** Which occurrence of its weekday a date is in its month (1..5), and whether it is the last. */
export function weekOfMonth(date: string): { nth: number; last: boolean } | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { nth: Math.ceil(day / 7), last: day + 7 > daysInMonth };
}

function monthlyMatches(rule: MonthlyRule, date: string): boolean {
  const w = weekOfMonth(date);
  if (!w) return false;
  return rule.nth.includes(w.nth) || (w.last && rule.nth.includes(-1));
}

/**
 * When something is on, on one particular date: its intervals that day (none if it is not on), or null if the schedule is
 * not understood. This is the question a planner needs, and the only one a "2nd and 4th Monday" can be answered with.
 */
export function intervalsOnDate(raw: string | null | undefined, date: string): Interval[] | null {
  const schedule = parseSchedule(raw);
  const w = weekOfMonth(date);
  if (!schedule || !w) return null;
  const day = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monthly = schedule.monthly.filter((r) => r.day === day);
  const matched = monthly.filter((r) => monthlyMatches(r, date)).flatMap((r) => r.intervals);
  return [...schedule.week[day], ...matched];
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
 *
 * `date` (YYYY-MM-DD) is needed for anything that holds only on some weeks of the month: without it such a schedule is
 * "unknown" (it might be on, so it is not ruled out), with it the answer is exact.
 */
export function openStatus(raw: string | null | undefined, weekday: DayName, arriveMin: number, stayMinutes: number, date?: string): OpenStatus {
  const schedule = parseSchedule(raw);
  if (!schedule) return { status: "unknown" };
  if (schedule.monthly.length > 0 && !date) return { status: "unknown" };

  const day = DAYS_OF_WEEK.indexOf(weekday);
  const yesterday = (day + 6) % 7;
  const needUntil = arriveMin + Math.min(Math.max(stayMinutes, 0), 30);

  const today: Interval[] = date ? (intervalsOnDate(raw, date) ?? []) : schedule.week[day];

  // Today's intervals, plus anything from last night that runs past midnight.
  const candidates: Interval[] = [
    ...today,
    ...schedule.week[yesterday].filter(([, end]) => end > 1440).map(([start, end]): Interval => [start - 1440, end - 1440]),
  ];
  const fit = candidates.find(([start, end]) => start <= arriveMin && needUntil <= end);
  return fit ? { status: "open", closesAt: fit[1] } : { status: "closed" };
}

const ORDINAL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", [-1]: "last" };
const FULL_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const clock = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * In words, when something that is only on some weeks of the month meets: "On the 2nd and 4th Monday, 10:00–12:00".
 * Null for anything that is a plain weekly schedule (see hoursText for those) or not understood.
 */
export function monthlyScheduleText(raw: string | null | undefined): string | null {
  const schedule = parseSchedule(raw);
  if (!schedule || schedule.monthly.length === 0) return null;
  const parts = schedule.monthly.map((rule) => {
    const nth = [...rule.nth].sort((a, b) => (a === -1 ? 9 : b === -1 ? -9 : a - b)).map((n) => ORDINAL[n]);
    const which = nth.length > 1 ? `${nth.slice(0, -1).join(", ")} and ${nth.at(-1)}` : nth[0];
    const times = rule.intervals.map(([s, e]) => `${clock(s)}–${clock(e)}`).join(" and ");
    return `the ${which} ${FULL_DAY[rule.day]}, ${times}`;
  });
  return `On ${parts.join("; and on ")}`;
}
