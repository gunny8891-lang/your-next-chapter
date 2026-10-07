/**
 * "Your day" on Today lists the morning, the afternoon and the evening. At 5.25 pm a free morning is
 * not something to "find something" for: tapping it only opened "starting now", which made the screen
 * feel unaware of the time. A free part of the day that has already gone is left out; one with something
 * planned in it always stays, since it is part of the day's story. Pure: the time is passed in.
 */

/** The hour each part of the day is over for offering things: morning ends at noon, afternoon at 5 pm, evening at 10 pm. */
export const SLOT_OVER_AT_HOUR: Record<string, number> = { morning: 12, afternoon: 17, evening: 22 };

export function visibleSlots<T extends { slot: string; item: unknown | null }>(slots: T[], minutesIntoDay: number): T[] {
  const hour = minutesIntoDay / 60;
  return slots.filter(({ slot, item }) => item !== null || hour < (SLOT_OVER_AT_HOUR[slot] ?? 24));
}
