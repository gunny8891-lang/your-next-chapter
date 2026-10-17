import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { isFoodVenue } from "@/lib/opportunities/kinds";
import { suitsChildren } from "@/lib/opportunities/kids";
import { haversineDistanceKm } from "@/lib/geo/haversine";

/**
 * Things for children, for the concierge, when they mention grandchildren or children. The everyday lists are a short balanced
 * selection of everything, so a question about the grandchildren would not reliably find the places for them without this.
 */

const MENTIONS_CHILDREN =
  /\b(grand-?child(?:ren)?|grandkids?|grandsons?|granddaughters?)\b|\b(?:with|for|my|our|the)\s+(?:an?\s+)?(?:little\s+)?(?:kids?|children|toddlers?|babies|nephews?|nieces?|little ones)\b|\btake\s+(?:the\s+)?(?:kids|children)\b/i;

/** Whether the question is about children or grandchildren. Pure. */
export function wantsKidsActivities(question: string): boolean {
  return MENTIONS_CHILDREN.test(question);
}

const MAX_LISTED = 12;
/** The tags worth telling the concierge, so it can say whether a place is indoors and what sort of place it is. */
const DESCRIBING = ["toddlers", "soft play", "playground", "farm", "animals", "wildlife", "active play", "mini golf", "bowling", "swimming", "museum", "indoor", "outdoors", "nature", "gardens"];

/** Pure: the places that say they suit children, in the order given, never somewhere to eat. */
export function pickKidsPlaces(ranked: OpportunityCandidate[]): OpportunityCandidate[] {
  return ranked.filter((c) => suitsChildren(c.tags) && !isFoodVenue(c)).slice(0, MAX_LISTED);
}

/** Pure: one line for the concierge. */
export function kidsLine(venue: OpportunityCandidate, km: number | null): string {
  const what = venue.tags.filter((t) => DESCRIBING.includes(t));
  const price = venue.price_estimate === null ? "price not known" : venue.price_estimate === 0 ? "free" : `about £${venue.price_estimate}`;
  return [
    `- id=${venue.id}`,
    venue.title,
    ...(what.length ? [what.slice(0, 4).join(", ")] : []),
    price,
    venue.address ?? "location TBC",
    km === null ? "distance not known" : `${km < 1 ? "under 1" : Math.round(km)} km from home`,
    venue.recurrence_rule ? `hours: ${venue.recurrence_rule}` : venue.date_time ? `on ${venue.date_time.slice(0, 10)}` : "opening hours not known",
  ].join(" | ");
}

/** The lines the concierge is given, or a plain statement that there are none known yet. Never throws. */
export async function kidsText(supabase: SupabaseClient, memberId: string, exclude: Set<string>): Promise<string> {
  try {
    const [{ candidates }, { data: where }] = await Promise.all([
      fetchRankedOpportunities(supabase, memberId, { excludeActivityIds: exclude }),
      supabase.from("member_profiles").select("location_lat, location_lng").eq("user_id", memberId).maybeSingle(),
    ]);
    const home = where as { location_lat: number | null; location_lng: number | null } | null;
    const picked = pickKidsPlaces(candidates);
    if (picked.length === 0) return "None known near them yet. Places for children are gathered as an area is learned, so suggest trying again soon, or something general like a park.";
    return picked
      .map((v) => kidsLine(v, home?.location_lat != null && home?.location_lng != null && v.location_lat != null && v.location_lng != null ? haversineDistanceKm(home.location_lat, home.location_lng, v.location_lat, v.location_lng) : null))
      .join("\n");
  } catch (err) {
    console.warn("chat: could not read things for children:", err instanceof Error ? err.message : err);
    return "";
  }
}
