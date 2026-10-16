import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, londonToday, weekdayOf, type SlotName } from "@/lib/opportunities/schedule";
import { placeOpenTimeChoice } from "@/lib/surprise/placeInSlot";
import { checkDate, chooseSlot, FULL_DAY, readActivity, recordPlannedBy } from "@/lib/chat/calendarTools";

/**
 * "Plan it again next week": after someone says they loved something they planned, one tap puts it in the same part of the same
 * day a week later. It goes through the same placement as every other way of planning something, and the same checks the
 * concierge makes: a one-off event cannot be repeated, a group only goes on a day it meets, a place only when it is open, and
 * nothing goes on top of something already planned.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS: SlotName[] = ["morning", "afternoon", "evening"];
/** It is offered straight after they answer, so it is about something from the last few days. */
const MAX_AGE_DAYS = 7;

export const PLAN_AGAIN_RATIONALE = "You enjoyed this last week, so it is here again.";

export type PlanAgainResult = { error: string | null; when?: string };

export type PlanAgainDeps = {
  member: SupabaseClient;
  admin: SupabaseClient;
  memberId: string;
  now: Date;
  place?: typeof placeOpenTimeChoice;
  recordPlanned?: (activityId: string) => Promise<void>;
};

export async function planAgain(deps: PlanAgainDeps, input: { activityId: unknown; date: unknown; slot: unknown }): Promise<PlanAgainResult> {
  const { activityId, date, slot } = input;
  if (typeof activityId !== "string" || !UUID.test(activityId) || typeof date !== "string" || !DATE.test(date) || !SLOTS.includes(slot as SlotName)) {
    return { error: "That didn't look right, please try again." };
  }
  const today = londonToday(deps.now);
  if (date > today || date < addDays(today, -MAX_AGE_DAYS)) return { error: "That was too long ago to repeat from here. You can find it again in Explore." };

  const next = addDays(date, 7);
  const dateProblem = checkDate(next, deps.now);
  if (dateProblem) return { error: dateProblem };

  const activity = await readActivity(deps.member, activityId);
  if (!activity) return { error: "That isn't available any more." };

  const chosen = chooseSlot(activity, next, slot as SlotName, today);
  if ("error" in chosen) return { error: chosen.error };

  const placed = await (deps.place ?? placeOpenTimeChoice)(deps.member, deps.admin, deps.memberId, activityId, chosen.slot, deps.now, PLAN_AGAIN_RATIONALE, next);
  if (placed.error) {
    return { error: /already planned/i.test(placed.error) ? "Something is already planned for then. You can choose another time in My Week." : placed.error };
  }
  try {
    await (deps.recordPlanned ?? recordPlannedBy(deps.member, deps.memberId, deps.now))(activityId);
  } catch {
    // Learning from it is a bonus.
  }
  return { error: null, when: `${FULL_DAY[weekdayOf(next)]} ${chosen.slot}` };
}
