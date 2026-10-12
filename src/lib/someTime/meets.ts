import { monthlyScheduleText, parseOpeningHours, type Interval } from "@/lib/someTime/openingHours";

const FULL_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const clock = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Something that is only on at set times and so has to be planned around them, in a few words for the planner:
 * "Thursday 14:00–16:00" or "On the 2nd and 4th Monday, 10:00–12:00". Null for a place with ordinary long hours (open most
 * days: nothing to plan around) or a schedule that is not understood.
 */
export function meetsText(raw: string | null | undefined): string | null {
  const monthly = monthlyScheduleText(raw);
  if (monthly) return monthly;
  const week = parseOpeningHours(raw);
  if (!week) return null;
  const days = week.map((intervals, index) => ({ intervals, index })).filter((d) => d.intervals.length > 0);
  if (days.length === 0 || days.length > 3) return null;
  return days.map((d) => `${FULL_DAY[d.index]} ${d.intervals.map(([s, e]) => `${clock(s)}–${clock(e)}`).join(" and ")}`).join("; ");
}

export type SlotName = "morning" | "afternoon" | "evening";

/** The parts of a day an interval overlaps by at least half an hour: morning (6 to 12), afternoon (12 to 5), evening (5 to 11). */
export function slotsOverlapping(intervals: Interval[]): SlotName[] {
  const windows: { slot: SlotName; from: number; to: number }[] = [
    { slot: "morning", from: 360, to: 720 },
    { slot: "afternoon", from: 720, to: 1020 },
    { slot: "evening", from: 1020, to: 1380 },
  ];
  return windows.filter((w) => intervals.some(([s, e]) => Math.min(e, w.to) - Math.max(s, w.from) >= 30)).map((w) => w.slot);
}
