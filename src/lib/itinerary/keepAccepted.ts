/**
 * Rebuilding a week must not undo what a member has already decided. An outing they
 * said yes to ("Going") stays exactly where it is, with its place in their calendar, and
 * only what they have not agreed to is replaced. Pure, so the rules can be tested; the
 * generator (generateAndSave.ts) applies them.
 */

export type ExistingItem = { id: string; activity_id: string; day_of_week: string; slot: string; member_action: string };
export type GeneratedItem = { activity_id: string; day: string; slot: string; rationale: string };

/** Splits the week's current items into those to keep (accepted) and those a rebuild may replace. */
export function splitForRebuild<T extends { member_action: string }>(existing: T[]): { kept: T[]; replaceable: T[] } {
  return {
    kept: existing.filter((item) => item.member_action === "accepted"),
    replaceable: existing.filter((item) => item.member_action !== "accepted"),
  };
}

/**
 * The newly generated items that may be added alongside the ones kept: never into a day and
 * time of day a kept outing already holds, and never the same activity twice in the week.
 */
export function newItemsAround(generated: GeneratedItem[], kept: Pick<ExistingItem, "activity_id" | "day_of_week" | "slot">[]): GeneratedItem[] {
  const takenSlots = new Set(kept.map((k) => `${k.day_of_week}|${k.slot}`));
  const takenActivities = new Set(kept.map((k) => k.activity_id));
  const usedNow = new Set<string>();
  return generated.filter((g) => {
    if (takenSlots.has(`${g.day}|${g.slot}`) || takenActivities.has(g.activity_id) || usedNow.has(g.activity_id)) return false;
    usedNow.add(g.activity_id);
    return true;
  });
}
