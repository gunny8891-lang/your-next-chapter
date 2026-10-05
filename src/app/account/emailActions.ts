"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/** Which emails the member wants. Their own row only: the member's own session does the write, so row-level security applies. */
export async function saveEmailPreferencesAction(prefs: { weeklyPlan: boolean; reminders: boolean }): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("member_profiles")
    .update({ email_weekly_plan: prefs.weeklyPlan === true, email_reminders: prefs.reminders === true })
    .eq("user_id", user.id);
  if (error) return { error: "We couldn't save that just now. Please try again." };

  revalidatePath("/account");
  return { error: null };
}
