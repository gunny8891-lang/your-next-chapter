import type { SupabaseClient } from "@supabase/supabase-js";
import { generateItinerary } from "@/lib/itinerary/agent";

export function getCurrentWeekStart(): string {
  const now = new Date();
  const diffToMonday = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diffToMonday);
  return monday.toISOString().slice(0, 10);
}

/**
 * Shared by the per-member "Generate my week" action and the weekly batch job —
 * generates (or regenerates) a member's itinerary for the current week and
 * persists it. Requires the admin client since writes here are the trusted-job
 * path, not the member's own RLS-scoped session (see admin.ts).
 */
export async function generateAndSaveItinerary(
  admin: SupabaseClient,
  memberId: string
): Promise<{ error: string | null; usedFallback?: boolean; itineraryId?: string }> {
  const weekStartDate = getCurrentWeekStart();
  const { itinerary, usedFallback } = await generateItinerary(admin, memberId);

  const { data: itineraryRow, error: itineraryError } = await admin
    .from("itineraries")
    .upsert(
      { member_id: memberId, week_start_date: weekStartDate, status: "sent", generated_at: new Date().toISOString() },
      { onConflict: "member_id,week_start_date" }
    )
    .select("id")
    .single();

  if (itineraryError || !itineraryRow) {
    return { error: itineraryError?.message ?? "Failed to create itinerary" };
  }

  // Regenerate case: clear any previously generated items for this week first.
  await admin.from("itinerary_items").delete().eq("itinerary_id", itineraryRow.id);

  const rows = itinerary.items.map((item) => ({
    itinerary_id: itineraryRow.id,
    activity_id: item.activity_id,
    day_of_week: item.day,
    slot: item.slot,
    rationale_text: item.rationale,
  }));

  const { error: itemsError } = await admin.from("itinerary_items").insert(rows);
  if (itemsError) return { error: itemsError.message };

  return { error: null, usedFallback, itineraryId: itineraryRow.id };
}
