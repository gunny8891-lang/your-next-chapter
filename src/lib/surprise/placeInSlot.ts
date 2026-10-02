import type { SupabaseClient } from "@supabase/supabase-js";
import { londonToday, weekdayOf, weekStartFor, type DayName, type SlotName } from "@/lib/opportunities/schedule";

/** Which plan week and day "today" belongs to, in the member's (London) calendar. */
export function resolveToday(now: Date = new Date()): { weekStart: string; day: DayName } {
  const today = londonToday(now);
  return { weekStart: weekStartFor(today), day: weekdayOf(today) };
}

const CHOSEN_RATIONALE = "You chose this from today's Open Time suggestions.";

/**
 * Puts a Surprise Me choice into today's free slot, so "I'll do this" actually
 * changes the day (it used to only record a preference).
 *
 * Plan rows can only be written by the admin client — members have no insert
 * policy on itineraries/itinerary_items — so `admin` does the writes. That is
 * kept safe by what this function does and does not do: the caller has already
 * authenticated `memberId`; the activity is read with the member's own client
 * (so only an active one is visible); the itinerary is looked up or created
 * strictly for `memberId`; and the only write is one item into that itinerary,
 * and only into an empty slot.
 */
export async function placeOpenTimeChoice(
  member: SupabaseClient,
  admin: SupabaseClient,
  memberId: string,
  activityId: string,
  slot: SlotName,
  now: Date = new Date(),
  rationale: string = CHOSEN_RATIONALE
): Promise<{ error: string | null }> {
  const { weekStart, day } = resolveToday(now);

  const { data: activity } = await member.from("activities").select("id").eq("id", activityId).maybeSingle();
  if (!activity) return { error: "That suggestion isn't available any more." };

  const { data: existing } = await member
    .from("itineraries")
    .select("id")
    .eq("member_id", memberId)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  let itineraryId = existing?.id as string | undefined;
  if (!itineraryId) {
    // A member who never generated this week's plan still gets a place to put it.
    const { data: created, error: createError } = await admin
      .from("itineraries")
      .upsert({ member_id: memberId, week_start_date: weekStart, status: "sent" }, { onConflict: "member_id,week_start_date" })
      .select("id")
      .single();
    if (createError || !created) return { error: createError?.message ?? "Couldn't start this week's plan." };
    itineraryId = created.id as string;
  }

  const { data: occupied, error: occupiedError } = await admin
    .from("itinerary_items")
    .select("id")
    .eq("itinerary_id", itineraryId)
    .eq("day_of_week", day)
    .eq("slot", slot)
    .limit(1);
  if (occupiedError) return { error: occupiedError.message };
  if (occupied && occupied.length > 0) return { error: "Something is already planned for that time." };

  const { error: insertError } = await admin.from("itinerary_items").insert({
    itinerary_id: itineraryId,
    activity_id: activityId,
    day_of_week: day,
    slot,
    member_action: "accepted",
    rationale_text: rationale,
  });
  if (insertError) return { error: insertError.message };

  // Same signal the plain acceptance recorded, so the Memory Agent still learns from it.
  const { error: signalError } = await member.from("preference_signals").insert({
    member_id: memberId,
    source: "surprise_me_response",
    activity_id: activityId,
    signal_type: "liked",
  });
  return { error: signalError?.message ?? null };
}
