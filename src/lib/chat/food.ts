import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { foodKindOf, type FoodKind } from "@/lib/opportunities/kinds";
import { haversineDistanceKm } from "@/lib/geo/haversine";

/**
 * Food and drink for the concierge: cafés, pubs, restaurants and tea rooms near home, offered only when they ask about eating or
 * drinking. They are kept out of the everyday lists on purpose (a pub is not an activity for a weekly plan), so without this the
 * concierge could not answer "where can I get lunch?" at all.
 */

const ASKS_ABOUT_FOOD =
  /\b(eat|eating|eats|lunch|dinner|breakfast|brunch|supper|coffee|cafes?|caf[eé]s?|pubs?|restaurants?|meal|meals|food|hungry|snack|bite to eat|afternoon tea|tea ?rooms?|cake|drinks?|takeaway)\b/i;

/** Whether this is about somewhere to eat or drink. Pure. */
export function wantsFood(question: string): boolean {
  return ASKS_ABOUT_FOOD.test(question);
}

const KIND_LABEL: Record<FoodKind, string> = { cafe: "café", pub: "pub", restaurant: "restaurant", tea_room: "tea room" };
/** How many of each kind, and in all, so the list is a spread and not twelve of whichever there is most of. */
const PER_KIND = 3;
const MAX_LISTED = 12;
const DETAIL_TAGS = new Set(["vegetarian-options", "vegan-options", "outdoor-seating", "chain", "afternoon-tea"]);

/** Pure: a spread of the best-ranked of each kind, in rank order within each kind. */
export function pickFood(ranked: OpportunityCandidate[]): OpportunityCandidate[] {
  const counts = new Map<FoodKind, number>();
  const picked: OpportunityCandidate[] = [];
  for (const venue of ranked) {
    const kind = foodKindOf(venue.tags);
    if (!kind) continue;
    const count = counts.get(kind) ?? 0;
    if (count >= PER_KIND || picked.length >= MAX_LISTED) continue;
    counts.set(kind, count + 1);
    picked.push(venue);
  }
  return picked;
}

/** Pure: one line for the concierge. */
export function foodLine(venue: OpportunityCandidate, homeKm: number | null): string {
  const kind = foodKindOf(venue.tags);
  const details = venue.tags.filter((t) => DETAIL_TAGS.has(t) && t !== "afternoon-tea");
  // What the map says it serves, if it says: the cuisine is among the tags that are not one of ours.
  const cuisine = venue.tags.filter((t) => !DETAIL_TAGS.has(t) && !["food-venue", "restaurant", "cafe", "pub", "lunch", "dinner", "brunch", "coffee", "drinks"].includes(t));
  const price = venue.price_estimate === null ? "" : venue.price_estimate === 0 ? " | Free" : ` | about £${venue.price_estimate}`;
  return [
    `- id=${venue.id}`,
    venue.title,
    kind ? KIND_LABEL[kind] : "food and drink",
    ...(cuisine.length ? [`serves: ${cuisine.slice(0, 2).join(", ")}`] : []),
    ...(details.length ? [details.join(", ")] : []),
    venue.address ?? "location TBC",
    homeKm === null ? "distance not known" : `${homeKm < 1 ? "under 1" : Math.round(homeKm)} km from home`,
    venue.recurrence_rule ? `hours: ${venue.recurrence_rule}` : "opening hours not known",
  ].join(" | ") + price;
}

/** The lines the concierge is given, or a plain statement that there are none yet. Never throws. */
export async function foodText(supabase: SupabaseClient, memberId: string): Promise<string> {
  try {
    const [{ candidates }, { data: where }] = await Promise.all([
      fetchRankedOpportunities(supabase, memberId, { foodVenues: "only" }),
      supabase.from("member_profiles").select("location_lat, location_lng").eq("user_id", memberId).maybeSingle(),
    ]);
    const picked = pickFood(candidates);
    if (picked.length === 0) return "None found near them yet. Say so, and suggest looking on a map once they are out.";
    const home = where as { location_lat: number | null; location_lng: number | null } | null;
    return picked
      .map((v) => foodLine(v, home?.location_lat != null && home?.location_lng != null && v.location_lat != null && v.location_lng != null ? haversineDistanceKm(home.location_lat, home.location_lng, v.location_lat, v.location_lng) : null))
      .join("\n");
  } catch (err) {
    console.warn("chat: could not read food and drink:", err instanceof Error ? err.message : err);
    return "";
  }
}
