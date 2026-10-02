"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { placeOpenTimeChoice } from "@/lib/surprise/placeInSlot";
import { getSurpriseOptions, type SurpriseWhen, type SurpriseWho } from "@/lib/surprise/onDemand";
import { parseSlot } from "@/lib/surprise/context";
import type { SurpriseOption } from "@/lib/types";

/**
 * `slot` is optional: Today's Open Time card passes the part of the day that is
 * free; the Explore page has no such notion and omits it.
 */
export async function getSurpriseOptionsAction(
  when: SurpriseWhen,
  who: SurpriseWho,
  slot?: string
): Promise<{ error: string | null; options: SurpriseOption[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", options: [] };

  try {
    const options = await getSurpriseOptions(supabase, user.id, when, who, parseSlot(slot));
    return { error: null, options };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't get suggestions right now", options: [] };
  }
}

/**
 * "I'll do this". From Today's Open Time card (`slot` given) it puts the choice
 * into that slot of today's plan; from Explore (no slot) it only records the
 * preference, as before.
 */
export async function acceptSurpriseOptionAction(activityId: string, slot?: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const validSlot = parseSlot(slot);
  if (validSlot) {
    const result = await placeOpenTimeChoice(supabase, createAdminClient(), user.id, activityId, validSlot);
    if (!result.error) {
      revalidatePath("/today");
      revalidatePath("/week");
    }
    return result;
  }

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

/**
 * "Not for me" on a suggestion. A rejection the app can learn from — before,
 * anything a member didn't pick simply vanished.
 */
export async function dismissSurpriseOptionAction(activityId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("preference_signals").insert({
    member_id: user.id,
    source: "surprise_me_response",
    activity_id: activityId,
    signal_type: "disliked",
  });

  return { error: error?.message ?? null };
}
