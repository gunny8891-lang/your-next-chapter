import type { SupabaseClient } from "@supabase/supabase-js";
import { generateItinerary } from "@/lib/itinerary/agent";
import { addDays, getCurrentWeekStart, londonWeekStart, weekToShow } from "@/lib/opportunities/schedule";
import { dropFromCalendarIfAny } from "@/lib/calendar/sync";
import { newItemsAround, splitForRebuild, type ExistingItem } from "@/lib/itinerary/keepAccepted";

// Moved to opportunities/schedule so the planner can use it without importing
// this file (which imports the planner). Re-exported for existing callers.
export { getCurrentWeekStart };

/**
 * The week a member's plan screens are showing, which is the one to rebuild when they ask for a
 * fresh plan: this week, or on a Sunday (once it exists) next week.
 */
export async function weekForMember(admin: SupabaseClient, memberId: string, now: Date = new Date()): Promise<string> {
  const current = londonWeekStart(now);
  const { data } = await admin.from("itineraries").select("week_start_date").eq("member_id", memberId).in("week_start_date", [current, addDays(current, 7)]);
  return weekToShow((data ?? []).map((row) => row.week_start_date as string), now);
}

/**
 * Shared by the per-member "Generate my week" action and the weekly batch job —
 * generates (or regenerates) a member's itinerary for the current week and
 * persists it. Requires the admin client since writes here are the trusted-job
 * path, not the member's own RLS-scoped session (see admin.ts).
 */
export async function generateAndSaveItinerary(
  admin: SupabaseClient,
  memberId: string,
  // Which week to plan (its Monday). The Sunday job says "next week"; everything else leaves it out and gets the
  // week the member is looking at (see weekForMember).
  options: { weekStart?: string } = {}
): Promise<{ error: string | null; usedFallback?: boolean; itineraryId?: string; itemCount?: number }> {
  const weekStartDate = options.weekStart ?? (await weekForMember(admin, memberId));
  const { itinerary, usedFallback } = await generateItinerary(admin, memberId, { weekStart: weekStartDate });

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

  // Regenerate case: replace what the member has not agreed to, and leave alone what they have (outings marked
  // "Going", with their place in the member's calendar). Starting again from nothing would quietly undo their
  // decisions, and leave events in their Google Calendar that the app could no longer find to remove.
  const { data: existing } = await admin.from("itinerary_items").select("id, activity_id, day_of_week, slot, member_action").eq("itinerary_id", itineraryRow.id);
  const { kept, replaceable } = splitForRebuild((existing ?? []) as ExistingItem[]);

  if (replaceable.length > 0) {
    const ids = replaceable.map((item) => item.id);
    // Any of these that were on the member's calendar come off it first, while we can still find them.
    const { data: onCalendar } = await admin.from("calendar_events").select("itinerary_item_id").eq("member_id", memberId).in("itinerary_item_id", ids);
    for (const link of onCalendar ?? []) await dropFromCalendarIfAny(memberId, link.itinerary_item_id as string);
    await admin.from("itinerary_items").delete().in("id", ids);
  }

  const rows = newItemsAround(itinerary.items, kept).map((item) => ({
    itinerary_id: itineraryRow.id,
    activity_id: item.activity_id,
    day_of_week: item.day,
    slot: item.slot,
    rationale_text: item.rationale,
  }));

  if (rows.length > 0) {
    const { error: itemsError } = await admin.from("itinerary_items").insert(rows);
    if (itemsError) return { error: itemsError.message };
  }

  return { error: null, usedFallback, itineraryId: itineraryRow.id, itemCount: rows.length + kept.length };
}
