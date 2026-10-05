import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDailyState, type DailyState } from "@/lib/experience/dailyState";

/** Today's Daily State for a member, or null. Never throws: no reading is the same as not having said. */
export async function loadDailyState(supabase: SupabaseClient, memberId: string, date: string): Promise<DailyState | null> {
  const { data, error } = await supabase
    .from("daily_states")
    .select("energy, intention, indoors, less_walking")
    .eq("member_id", memberId)
    .eq("state_date", date)
    .maybeSingle();
  if (error) {
    console.warn("daily state: could not read:", error.message);
    return null;
  }
  return parseDailyState(data);
}

/** Replaces today's Daily State. One row per member per day: saying it again changes it. */
export async function saveDailyState(supabase: SupabaseClient, memberId: string, date: string, state: DailyState): Promise<{ error: string | null }> {
  const { error } = await supabase.from("daily_states").upsert(
    {
      member_id: memberId,
      state_date: date,
      energy: state.energy,
      intention: state.intention,
      indoors: state.indoors,
      less_walking: state.lessWalking,
    },
    { onConflict: "member_id,state_date" }
  );
  return { error: error?.message ?? null };
}

export async function clearDailyState(supabase: SupabaseClient, memberId: string, date: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("daily_states").delete().eq("member_id", memberId).eq("state_date", date);
  return { error: error?.message ?? null };
}

/** How many days a Daily State is kept. The privacy notice says this number, and a test holds the two together. */
export const DAILY_STATE_KEEP_DAYS = 7;

/** The nightly clean-up: Daily States older than a week are deleted. They only ever shaped their own day. */
export async function purgeOldDailyStates(admin: SupabaseClient, today: string, keepDays = DAILY_STATE_KEEP_DAYS): Promise<number> {
  const cutoff = new Date(new Date(`${today}T12:00:00Z`).getTime() - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("daily_states").delete().lt("state_date", cutoff).select("member_id");
  if (error) {
    console.warn("daily state: could not purge old rows:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
