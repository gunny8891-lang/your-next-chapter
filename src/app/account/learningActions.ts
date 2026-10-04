"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * "Clear what we've learned": deletes what the app has noted about how this member
 * spends their time: the record of what they opened, saved, planned and how it went,
 * the likes and dislikes that shape their ranking, and how they said they felt today.
 * Their plans, saved ideas, goals, people and profile are theirs to edit elsewhere
 * and are left alone.
 *
 * The preference log is append-only for members by design (no delete permission), so
 * this uses the backend's access, scoped strictly to the signed-in member's own rows.
 */
const LEARNED = ["experience_events", "preference_signals", "daily_states"] as const;

export async function clearLearningAction(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const admin = createAdminClient();
  const failures: string[] = [];
  // Every table is attempted, so one failing does not leave the others holding data.
  for (const table of LEARNED) {
    const { error } = await admin.from(table).delete().eq("member_id", user.id);
    if (error) failures.push(`${table}: ${error.message}`);
  }
  if (failures.length > 0) {
    console.warn("clear learning: some tables could not be cleared:", failures.join("; "));
    return { error: "We couldn't clear everything just now. Please try again." };
  }

  revalidatePath("/today");
  revalidatePath("/week");
  revalidatePath("/account");
  return { error: null };
}
