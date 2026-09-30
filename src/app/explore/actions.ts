"use server";

import { createClient } from "@/utils/supabase/server";
import { getSurpriseOptions, type SurpriseWhen, type SurpriseWho } from "@/lib/surprise/onDemand";
import type { SurpriseOption } from "@/lib/types";

export async function getSurpriseOptionsAction(
  when: SurpriseWhen,
  who: SurpriseWho
): Promise<{ error: string | null; options: SurpriseOption[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", options: [] };

  try {
    const options = await getSurpriseOptions(supabase, user.id, when, who);
    return { error: null, options };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't get suggestions right now", options: [] };
  }
}

export async function acceptSurpriseOptionAction(activityId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Feeds the Memory Agent the same way any other acceptance does — this
  // signal type already exists in the schema specifically for Surprise Me.
  const { error } = await supabase.from("preference_signals").insert({
    member_id: user.id,
    source: "surprise_me_response",
    activity_id: activityId,
    signal_type: "liked",
  });

  return { error: error?.message ?? null };
}
