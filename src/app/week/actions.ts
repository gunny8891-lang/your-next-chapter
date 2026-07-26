"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { MemberAction } from "@/lib/types";

const SIGNAL_FOR_ACTION: Record<Exclude<MemberAction, "pending">, { source: string; signal_type: string }> = {
  accepted: { source: "accept", signal_type: "liked" },
  skipped: { source: "skip", signal_type: "disliked" },
  swapped: { source: "swap", signal_type: "too_similar" },
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
  await supabase.from("preference_signals").insert({
    member_id: user.id,
    source: signal.source,
    activity_id: existing.activity_id,
    signal_type: signal.signal_type,
  });

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
