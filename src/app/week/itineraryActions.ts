"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateItinerary } from "@/lib/itinerary/agent";

function getCurrentWeekStart(): string {
  const now = new Date();
  const diffToMonday = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diffToMonday);
  return monday.toISOString().slice(0, 10);
}

export async function generateWeekItineraryAction(): Promise<{ error: string | null; usedFallback?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const weekStartDate = getCurrentWeekStart();

  const { itinerary, usedFallback } = await generateItinerary(admin, user.id);

  const { data: itineraryRow, error: itineraryError } = await admin
    .from("itineraries")
    .upsert(
      { member_id: user.id, week_start_date: weekStartDate, status: "sent", generated_at: new Date().toISOString() },
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

  revalidatePath("/week");
  return { error: null, usedFallback };
}
