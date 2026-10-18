import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { isFoodVenue } from "@/lib/opportunities/kinds";
import { haversineDistanceKm } from "@/lib/geo/haversine";

/**
 * Heritage and culture for the concierge, when they ask for it by name: the National Trust, English Heritage, a historic house, a
 * castle, a museum, a gallery. The concierge's everyday lists are a short balanced selection of everything, so a direct question
 * about the National Trust would not reliably find the properties near them without this.
 */

const ASKS_ABOUT_HERITAGE =
  /\b(national trust|english heritage|stately homes?|historic (house|home|site|building)s?|heritage|castles?|abbeys?|priory|museums?|galleries|gallery|roman (ruins?|villa|remains|baths)|ruins|windmill|manor house|country house|open gardens?)\b/i;

/** Whether this is about heritage, museums or historic places. Pure. */
export function wantsHeritage(question: string): boolean {
  return ASKS_ABOUT_HERITAGE.test(question);
}

const MAX_LISTED = 12;
const HERITAGE_TAGS = ["national-trust", "english-heritage", "heritage", "history", "museum", "gallery", "castle", "house tour", "art"];

/** Pure: the nearest places that are heritage or culture, never somewhere to eat or a group, nearest first, the big two first among equals. */
export function pickHeritage(candidates: OpportunityCandidate[], home: { lat: number; lng: number } | null, question: string = ""): { venue: OpportunityCandidate; km: number | null }[] {
  const wantsTrust = /national trust/i.test(question);
  const wantsEnglishHeritage = /english heritage/i.test(question);
  const places = candidates
    .filter((c) => !isFoodVenue(c) && !c.date_time && c.tags.some((t) => HERITAGE_TAGS.includes(t)))
    .filter((c) => (wantsTrust ? c.tags.includes("national-trust") : wantsEnglishHeritage ? c.tags.includes("english-heritage") : true))
    .map((venue) => ({
      venue,
      km: home && venue.location_lat != null && venue.location_lng != null ? haversineDistanceKm(home.lat, home.lng, venue.location_lat, venue.location_lng) : null,
    }));
  const rank = (p: { venue: OpportunityCandidate; km: number | null }) => (p.km ?? 1000) - (p.venue.tags.includes("national-trust") || p.venue.tags.includes("english-heritage") ? 3 : 0);
  places.sort((a, b) => rank(a) - rank(b));
  return places.slice(0, MAX_LISTED);
}

/** Pure: one line for the concierge. */
export function heritageLine(venue: OpportunityCandidate, km: number | null): string {
  const runBy = venue.tags.includes("national-trust") ? "National Trust" : venue.tags.includes("english-heritage") ? "English Heritage" : null;
  const price = venue.price_estimate === null ? "price not known" : venue.price_estimate === 0 ? "free" : `about £${venue.price_estimate}`;
  return [
    `- id=${venue.id}`,
    venue.title,
    ...(runBy ? [`run by the ${runBy}`] : []),
    price,
    venue.address ?? "location TBC",
    km === null ? "distance not known" : `${km < 1 ? "under 1" : Math.round(km)} km from home`,
    venue.recurrence_rule ? `hours: ${venue.recurrence_rule}` : "opening hours not known",
  ].join(" | ");
}

/** The lines the concierge is given, or a plain statement that there are none known yet. Never throws. */
export async function heritageText(supabase: SupabaseClient, memberId: string, question: string): Promise<string> {
  try {
    const [{ candidates }, { data: where }] = await Promise.all([
      fetchRankedOpportunities(supabase, memberId),
      supabase.from("member_profiles").select("location_lat, location_lng").eq("user_id", memberId).maybeSingle(),
    ]);
    const home = where as { location_lat: number | null; location_lng: number | null } | null;
    const picked = pickHeritage(candidates, home?.location_lat != null && home?.location_lng != null ? { lat: home.location_lat, lng: home.location_lng } : null, question);
    if (picked.length === 0) return "None known within their distance yet. Heritage places for an area are gathered as it is learned, so suggest trying again soon, or looking at the National Trust and English Heritage websites.";
    return picked.map(({ venue, km }) => heritageLine(venue, km)).join("\n");
  } catch (err) {
    console.warn("chat: could not read heritage places:", err instanceof Error ? err.message : err);
    return "";
  }
}
