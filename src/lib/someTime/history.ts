import type { SupabaseClient } from "@supabase/supabase-js";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";
import { addDays } from "@/lib/opportunities/schedule";
import { buildRecommendationMemory, type MemoryEvent, type RecommendationMemory } from "@/lib/memory/memory";
import type { RepetitionHistory } from "@/lib/someTime/score";

const ACTIVITY_MEMORY_DAYS = 28;
const CATEGORY_MEMORY_DAYS = 7;
/** How far back what they have turned down or repeated is remembered (the longest "no" is half a year). */
const MEMORY_DAYS = 185;

type PlanRow = {
  week_start_date: string;
  itinerary_items: {
    day_of_week: string;
    member_action: string;
    activities: { id: string; category: string } | { id: string; category: string }[] | null;
  }[];
};

const firstActivity = (a: PlanRow["itinerary_items"][number]["activities"]) => (Array.isArray(a) ? (a[0] ?? null) : a);

/**
 * Pure: turns the member's recent plans and likes into what the scorer needs.
 *  - an activity they accepted or liked in the last month is "done" (don't repeat it);
 *  - the categories of what they had planned or accepted in the last week show
 *    what they have had plenty of.
 * Anything dated after today is the future, not history, and skipped or swapped
 * items are things they chose not to do.
 */
export function buildRepetitionHistory(plans: PlanRow[], likedActivityIds: string[], today: string, memory?: RecommendationMemory): RepetitionHistory {
  const recentActivityIds = new Set<string>(likedActivityIds);
  const categoryCounts: Record<string, number> = {};
  const activityCutoff = addDays(today, -ACTIVITY_MEMORY_DAYS);
  const categoryCutoff = addDays(today, -CATEGORY_MEMORY_DAYS);

  for (const plan of plans) {
    for (const item of plan.itinerary_items ?? []) {
      const dayIndex = DAYS_OF_WEEK.indexOf(item.day_of_week as (typeof DAYS_OF_WEEK)[number]);
      const activity = firstActivity(item.activities);
      if (dayIndex < 0 || !activity) continue;

      const date = addDays(plan.week_start_date, dayIndex);
      if (date > today) continue;
      if (item.member_action === "skipped" || item.member_action === "swapped") continue;

      if (item.member_action === "accepted" && date >= activityCutoff) recentActivityIds.add(activity.id);
      if (date >= categoryCutoff) categoryCounts[activity.category] = (categoryCounts[activity.category] ?? 0) + 1;
    }
  }
  if (memory) {
    // What they actually went to is better evidence of "done" than what they said yes to,
    // and something they planned but did not go to has not been done at all.
    for (const id of memory.recentlyDoneIds) recentActivityIds.add(id);
    for (const id of memory.notDoneIds) recentActivityIds.delete(id);
  }
  return { recentActivityIds, categoryCounts, ...(memory ? { memory } : {}) };
}

export async function loadRepetitionHistory(supabase: SupabaseClient, memberId: string, today: string): Promise<RepetitionHistory> {
  const since = addDays(today, -ACTIVITY_MEMORY_DAYS - 7);
  const [{ data: plans }, { data: liked }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("itineraries")
      .select("week_start_date, itinerary_items(day_of_week, member_action, activities(id, category))")
      .eq("member_id", memberId)
      .gte("week_start_date", since),
    supabase
      .from("preference_signals")
      .select("activity_id")
      .eq("member_id", memberId)
      .eq("signal_type", "liked")
      // A saved idea is a "liked" signal from explicit feedback. Saving is "I would like
      // this, some time", not "I have done this", so it must not count as repetition.
      .neq("source", "explicit_feedback")
      .gte("created_at", `${addDays(today, -ACTIVITY_MEMORY_DAYS)}T00:00:00Z`),
    // The fuller record: what they went to, repeated, turned down. A failed read just means no memory beyond plans and signals.
    supabase
      .from("experience_events")
      .select("activity_id, event_type, outcome, reason, context, created_at")
      .eq("member_id", memberId)
      .in("event_type", ["planned", "completed", "dismissed"])
      .gte("created_at", `${addDays(today, -MEMORY_DAYS)}T00:00:00Z`)
      .limit(2000),
  ]);
  if (eventsError) console.warn("history: could not read the experience log:", eventsError.message);
  const memory = eventsError ? undefined : buildRecommendationMemory((events ?? []) as MemoryEvent[], new Date(`${today}T12:00:00Z`));

  return buildRepetitionHistory(
    (plans ?? []) as unknown as PlanRow[],
    ((liked ?? []) as { activity_id: string | null }[]).map((r) => r.activity_id).filter((id): id is string => !!id),
    today,
    memory
  );
}
