import type { DurationChoice, StartChoice } from "@/lib/someTime/request";

/** The last sensible moment to still be out and about; nothing is planned past this. */
const DAY_END_MIN = 22 * 60 + 30;
const AFTERNOON_START_MIN = 14 * 60;
const EVENING_START_MIN = 18 * 60;
/** Below this there is no time to go anywhere. */
const MIN_USABLE_MIN = 25;

export type TimeWindow = {
  /** The member's date (London), YYYY-MM-DD. */
  date: string;
  /** Minutes after midnight. */
  startMin: number;
  endMin: number;
  availableMinutes: number;
  /** A suggestion filling less than this is not "a way to spend" the time. */
  minUsefulMinutes: number;
};

export type WindowResult = { ok: true; window: TimeWindow } | { ok: false; reason: string };

/** The clock in London: today's date and minutes after midnight. */
export function londonClock(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const roundUp5 = (minutes: number) => Math.ceil(minutes / 5) * 5;

/** "14:05" for minutes after midnight (past-midnight values wrap). */
export function clockLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "30 min", "1 hour 15 min", "2 hours" */
export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h} hour${h === 1 ? "" : "s"}${rest ? ` ${rest} min` : ""}`;
}

/**
 * Turns "now / this afternoon / this evening" and "30 min … rest of day" into a
 * concrete stretch of today. A later start never begins before the time it names,
 * and never before now; the end is clipped to the end of a sensible day.
 */
export function resolveWindow(request: { start: StartChoice; duration: DurationChoice }, now: Date): WindowResult {
  const clock = londonClock(now);
  const nowMin = roundUp5(clock.minutes);
  const startMin =
    request.start === "afternoon" ? Math.max(nowMin, AFTERNOON_START_MIN)
    : request.start === "evening" ? Math.max(nowMin, EVENING_START_MIN)
    : nowMin;

  if (DAY_END_MIN - startMin < MIN_USABLE_MIN) {
    return { ok: false, reason: "It is too late today for anything new — try again tomorrow." };
  }

  const untilDayEnd = DAY_END_MIN - startMin;
  const [wanted, minUseful] =
    request.duration === "30m" ? [30, 15]
    : request.duration === "1-2h" ? [120, 45]
    : request.duration === "half_day" ? [240, 120]
    : [Math.min(600, untilDayEnd), Math.min(90, untilDayEnd)];

  const availableMinutes = Math.min(wanted, untilDayEnd);
  return {
    ok: true,
    window: {
      date: clock.date,
      startMin,
      endMin: startMin + availableMinutes,
      availableMinutes,
      minUsefulMinutes: Math.min(minUseful, availableMinutes),
    },
  };
}
