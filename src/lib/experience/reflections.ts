import type { SupabaseClient } from "@supabase/supabase-js";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";
import { addDays, isOneOff, type SlotName } from "@/lib/opportunities/schedule";

/**
 * "Did you go?": the only way to know that something planned was actually done.
 * Asked gently, a day or two afterwards, about at most a couple of things, and only
 * once each. Something planned for today is asked about only once its part of the day has finished
 * (it may not have happened yet), and nothing older than a few days (nobody remembers, and it would
 * feel like nagging).
 */

export type PlanItem = { activityId: string; title: string; date: string; accepted: boolean; slot: SlotName | null; canRepeat: boolean };
/** What is asked about, and what is needed to offer to plan it again a week later in the same part of the day. */
export type Reflection = { activityId: string; title: string; date: string; slot: SlotName | null; canRepeat: boolean };

const LOOK_BACK_DAYS = 3;
const MAX_ASKED = 2;

/** When each part of the day is over, in minutes after midnight (London). */
export const SLOT_ENDS: Record<SlotName, number> = { morning: 12 * 60, afternoon: 17 * 60, evening: 22 * 60 };

/**
 * Pure: the accepted things from the last few days, and the parts of today that have finished, that have not been answered
 * yet, newest first. `nowMinutes` is the London time of day; without it today is never asked about.
 */
export function pendingReflections(items: PlanItem[], today: string, answered: Set<string>, nowMinutes: number | null = null): Reflection[] {
  const earliest = addDays(today, -LOOK_BACK_DAYS);
  const seen = new Set<string>();
  const out: Reflection[] = [];
  const over = (item: PlanItem) => item.date === today && nowMinutes !== null && item.slot !== null && nowMinutes >= SLOT_ENDS[item.slot];
  for (const item of [...items].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))) {
    if (!item.accepted) continue;
    if (item.date > today || item.date < earliest) continue;
    if (item.date === today && !over(item)) continue;
    if (answered.has(item.activityId) || seen.has(item.activityId)) continue;
    seen.add(item.activityId);
    out.push({ activityId: item.activityId, title: item.title, date: item.date, slot: item.slot, canRepeat: item.canRepeat });
    if (out.length >= MAX_ASKED) break;
  }
  return out;
}

type ActivityRow = { id: string; title: string; date_time?: string | null; expires_at?: string | null };
type ItineraryRow = {
  week_start_date: string;
  itinerary_items: {
    day_of_week: string;
    slot?: string;
    member_action: string;
    activities: ActivityRow | ActivityRow[] | null;
  }[];
};

const SLOTS: SlotName[] = ["morning", "afternoon", "evening"];

/** Pure: plan rows from the database as dated items. */
export function toPlanItems(rows: ItineraryRow[]): PlanItem[] {
  const items: PlanItem[] = [];
  for (const row of rows) {
    for (const item of row.itinerary_items ?? []) {
      const dayIndex = DAYS_OF_WEEK.indexOf(item.day_of_week as (typeof DAYS_OF_WEEK)[number]);
      const activity = Array.isArray(item.activities) ? item.activities[0] : item.activities;
      if (dayIndex < 0 || !activity) continue;
      const date = addDays(row.week_start_date, dayIndex);
      // A one-off event happens once; something that has ended by next week cannot be planned again.
      const ends = activity.expires_at ? activity.expires_at.slice(0, 10) : null;
      const canRepeat = !isOneOff({ date_time: activity.date_time ?? null, expires_at: activity.expires_at ?? null }) && (!ends || ends >= addDays(date, 7));
      items.push({ activityId: activity.id, title: activity.title, date, accepted: item.member_action === "accepted", slot: SLOTS.find((s) => s === item.slot) ?? null, canRepeat });
    }
  }
  return items;
}

/** What to ask about now. Never throws: no question is better than a broken page. */
export async function loadReflections(supabase: SupabaseClient, memberId: string, today: string, nowMinutes: number | null = null): Promise<Reflection[]> {
  const [{ data: plans, error: planError }, { data: events, error: eventError }] = await Promise.all([
    supabase
      .from("itineraries")
      .select("week_start_date, itinerary_items(day_of_week, slot, member_action, activities(id, title, date_time, expires_at))")
      .eq("member_id", memberId)
      .order("week_start_date", { ascending: false })
      .limit(3),
    supabase
      .from("experience_events")
      .select("activity_id, event_type, reason")
      .eq("member_id", memberId)
      .in("event_type", ["completed", "dismissed"])
      .gte("created_at", `${addDays(today, -LOOK_BACK_DAYS - 1)}T00:00:00Z`),
  ]);
  if (planError) {
    console.warn("reflections: could not read the plan:", planError.message);
    return [];
  }
  // A failed read of the answers must not make us ask the same question twice; with no
  // way to know what was answered, ask nothing.
  if (eventError) {
    console.warn("reflections: could not read earlier answers:", eventError.message);
    return [];
  }
  const answered = new Set(
    ((events ?? []) as { activity_id: string | null; event_type: string; reason: string | null }[])
      .filter((e) => e.activity_id && (e.event_type === "completed" || e.reason === "didnt_go"))
      .map((e) => e.activity_id as string)
  );
  return pendingReflections(toPlanItems((plans ?? []) as unknown as ItineraryRow[]), today, answered, nowMinutes);
}
