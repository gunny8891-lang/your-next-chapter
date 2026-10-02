import { SLOTS } from "@/lib/itinerary/schema";
import { slotForHour, type SlotName } from "@/lib/opportunities/schedule";
import type { TimeWindow } from "@/lib/someTime/window";

/**
 * The parts of today's plan a stretch of time covers, in order. Accepting a
 * suggestion puts it in the first of these that is free: a 14:00–16:00 outing is
 * "afternoon"; a half day from 13:00 covers afternoon and evening. A one-off
 * event belongs only to the part of the day it actually happens in.
 */
export function slotsForWindow(window: Pick<TimeWindow, "startMin" | "endMin">, eventStartMin?: number | null): SlotName[] {
  if (eventStartMin != null) return [slotForHour(Math.floor(eventStartMin / 60))];
  const first = SLOTS.indexOf(slotForHour(Math.floor(window.startMin / 60)));
  const last = SLOTS.indexOf(slotForHour(Math.floor(Math.max(window.startMin, window.endMin - 1) / 60)));
  return SLOTS.slice(first, last + 1);
}
