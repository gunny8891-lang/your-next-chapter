import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { haversineDistanceKm } from "@/lib/geo/haversine";

/**
 * Garden centres for the concierge, when they ask about one. They are in the everyday suggestions as places to visit, but the
 * concierge's lists are a short, balanced selection of everything, so a direct question about garden centres would not find them
 * there without this.
 */

const ASKS_ABOUT_GARDEN_CENTRES = /\bgarden ?cent(?:re|er)s?\b|\bplant (?:shop|nurser(?:y|ies))\b|\b(?:buy|buying|get|pick up) (?:some )?(?:plants|seeds|bulbs|compost)\b/i;

/** Whether this is about a garden centre. Pure. */
export function wantsGardenCentres(question: string): boolean {
  return ASKS_ABOUT_GARDEN_CENTRES.test(question);
}

const MAX_LISTED = 8;
export const GARDEN_CENTRE_TAG = "garden centre";

/** Pure: the nearest garden centres from a ranked list, nearest first. */
export function pickGardenCentres(candidates: OpportunityCandidate[], home: { lat: number; lng: number } | null): { venue: OpportunityCandidate; km: number | null }[] {
  const centres = candidates
    .filter((c) => c.tags.includes(GARDEN_CENTRE_TAG))
    .map((venue) => ({
      venue,
      km: home && venue.location_lat != null && venue.location_lng != null ? haversineDistanceKm(home.lat, home.lng, venue.location_lat, venue.location_lng) : null,
    }));
  centres.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  return centres.slice(0, MAX_LISTED);
}

/** Pure: one line for the concierge. */
export function gardenCentreLine(venue: OpportunityCandidate, km: number | null): string {
  return [
    `- id=${venue.id}`,
    venue.title,
    venue.address ?? "location TBC",
    km === null ? "distance not known" : `${km < 1 ? "under 1" : Math.round(km)} km from home`,
    venue.recurrence_rule ? `hours: ${venue.recurrence_rule}` : "opening hours not known",
  ].join(" | ");
}

/** The lines the concierge is given, or a plain statement that there are none known yet. Never throws. */
export async function gardenCentresText(supabase: SupabaseClient, memberId: string): Promise<string> {
  try {
    const [{ candidates }, { data: where }] = await Promise.all([
      fetchRankedOpportunities(supabase, memberId),
      supabase.from("member_profiles").select("location_lat, location_lng").eq("user_id", memberId).maybeSingle(),
    ]);
    const home = where as { location_lat: number | null; location_lng: number | null } | null;
    const picked = pickGardenCentres(candidates, home?.location_lat != null && home?.location_lng != null ? { lat: home.location_lat, lng: home.location_lng } : null);
    if (picked.length === 0) return "None known near them yet. Garden centres for a new area are gathered overnight, so suggest trying again tomorrow, or looking on a map.";
    return picked.map(({ venue, km }) => gardenCentreLine(venue, km)).join("\n");
  } catch (err) {
    console.warn("chat: could not read garden centres:", err instanceof Error ? err.message : err);
    return "";
  }
}
