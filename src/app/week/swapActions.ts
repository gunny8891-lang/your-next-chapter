"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { fetchRankedOpportunities } from "@/lib/opportunities/engine";
import type { SwapAlternative } from "@/lib/types";

const MAX_ALTERNATIVES = 4;

export async function getSwapAlternativesAction(
  itemId: string
): Promise<{ error: string | null; alternatives: SwapAlternative[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", alternatives: [] };

  const { data: item } = await supabase
    .from("itinerary_items")
    .select("itinerary_id, activity_id, itineraries!inner(member_id), activities(category)")
    .eq("id", itemId)
    .eq("itineraries.member_id", user.id)
    .maybeSingle();

  const category = (item?.activities as unknown as { category: string } | null)?.category;
  if (!item || !category) return { error: "Item not found", alternatives: [] };

  const { data: usedRows } = await supabase
    .from("itinerary_items")
    .select("activity_id")
    .eq("itinerary_id", item.itinerary_id);
  const excludeIds = new Set([...(usedRows ?? []).map((r) => r.activity_id), item.activity_id]);

  const { candidates } = await fetchRankedOpportunities(supabase, user.id, {
    category,
    excludeActivityIds: excludeIds,
  });
  const ranked = candidates.slice(0, MAX_ALTERNATIVES);

  return {
    error: null,
    alternatives: ranked.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category as SwapAlternative["category"],
      address: a.address,
      priceEstimate: a.price_estimate,
      tags: a.tags,
    })),
  };
}

export async function applySwapAction(itemId: string, newActivityId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: existing } = await supabase.from("itinerary_items").select("activity_id").eq("id", itemId).maybeSingle();
  if (!existing) return { error: "Item not found" };

  const { error } = await supabase
    .from("itinerary_items")
    .update({
      activity_id: newActivityId,
      member_action: "pending",
      rationale_text: "A fresh pick, swapped in based on your recent preferences.",
    })
    .eq("id", itemId);
  if (error) return { error: error.message };

  await supabase.from("preference_signals").insert({
    member_id: user.id,
    source: "swap",
    activity_id: existing.activity_id,
    signal_type: "too_similar",
  });

  revalidatePath("/week");
  return { error: null };
}
