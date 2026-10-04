"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { MemberAction } from "@/lib/types";
import { londonToday } from "@/lib/opportunities/schedule";
import { loadDailyState } from "@/lib/experience/dailyStateStore";
import { buildContext, recordExperience, type ExperienceEvent } from "@/lib/experience/events";

/**
 * What each choice teaches the (older) preference log. Skipping a planned thing is NOT a
 * dislike: it means "not this time" (they may be busy, tired, away), so it writes no
 * taste signal at all; the experience log records that it happened, and nothing more.
 */
const SIGNAL_FOR_ACTION: Record<Exclude<MemberAction, "pending">, { source: string; signal_type: string } | null> = {
  accepted: { source: "accept", signal_type: "liked" },
  skipped: null,
  swapped: { source: "swap", signal_type: "too_similar" },
};

/** The experience a choice in My Week is: yes is "planned"; "not this time" and "something else" are taste-neutral. */
const EVENT_FOR_ACTION: Record<Exclude<MemberAction, "pending">, Omit<ExperienceEvent, "activityId">> = {
  accepted: { type: "planned", surface: "week" },
  skipped: { type: "dismissed", reason: "didnt_go", surface: "week" },
  swapped: { type: "dismissed", reason: "didnt_go", surface: "week" },
};

export async function updateItineraryItemAction(itemId: string, action: "accepted" | "swapped" | "skipped") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Demo/mock items (no matching row yet, since the Itinerary Agent isn't wired up)
  // have nothing to persist against — the client keeps its own optimistic state for those.
  const { data: existing } = await supabase
    .from("itinerary_items")
    .select("id, activity_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!existing) return;

  await supabase.from("itinerary_items").update({ member_action: action }).eq("id", itemId);

  const signal = SIGNAL_FOR_ACTION[action];
  if (signal) {
    await supabase.from("preference_signals").insert({
      member_id: user.id,
      source: signal.source,
      activity_id: existing.activity_id,
      signal_type: signal.signal_type,
    });
  }

  const state = await loadDailyState(supabase, user.id, londonToday());
  await recordExperience(supabase, user.id, [{ ...EVENT_FOR_ACTION[action], activityId: existing.activity_id, context: buildContext(state) }]);

  revalidatePath("/week");
}

export async function respondSurpriseAction(cardId: string, response: "accepted" | "dismissed") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("surprise_me_cards")
    .select("id")
    .eq("id", cardId)
    .maybeSingle();
  if (!existing) return;

  await supabase.from("surprise_me_cards").update({ member_response: response }).eq("id", cardId);

  revalidatePath("/week");
}
