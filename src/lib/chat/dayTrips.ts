import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRankedOpportunities, selectBalanced } from "@/lib/opportunities/engine";
import { haversineDistanceKm } from "@/lib/geo/haversine";
import { estimateTravel } from "@/lib/someTime/travel";

/**
 * Day trips for the concierge: the well-known places further afield (see discovery/sources/dayTrips.ts), offered only when
 * they ask for a day out, so an ordinary question is not answered with a train ride.
 */

const ASKS_FOR_A_DAY_OUT =
  /\bday[- ]?(?:trips?|outs?)\b|\bdays out\b|\btrip (?:out|somewhere|away)\b|\b(?:tourist|touristy|sightseeing|sight-seeing)\b|\b(?:into|up to|down to) (?:london|town|the city)\b|\bsomewhere (?:famous|special|different)\b|\bwhole day\b/i;

/** Whether this is a request for a day out rather than something nearby. Pure. */
export function wantsDayTrips(question: string): boolean {
  return ASKS_FOR_A_DAY_OUT.test(question);
}

const MAX_LISTED = 10;

type Where = { location_lat: number | null; location_lng: number | null; drives: boolean | null; uses_public_transport: boolean | null; mobility_notes: string | null };

/** Pure: how far, and how long it takes to get there, in words. */
export function journeyText(km: number | null, travel: { drives: boolean | null; uses_public_transport: boolean | null; mobility_notes: string | null }): string {
  if (km === null) return "distance not known";
  const t = estimateTravel(km, travel);
  const minutes = t.minutes >= 90 ? `about ${Math.round((t.minutes / 60) * 2) / 2} hours` : `about ${Math.round(t.minutes / 5) * 5} minutes`;
  return `about ${Math.round(km)} km away, ${minutes} each way (an estimate)`;
}

/** The lines the concierge is given, or a plain statement that there are none yet. Never throws. */
export async function dayTripsText(supabase: SupabaseClient, memberId: string, exclude: Set<string>): Promise<string> {
  try {
    const [{ candidates }, { data: where }] = await Promise.all([
      fetchRankedOpportunities(supabase, memberId, { dayTrips: true, excludeActivityIds: exclude }),
      supabase.from("member_profiles").select("location_lat, location_lng, drives, uses_public_transport, mobility_notes").eq("user_id", memberId).maybeSingle(),
    ]);
    if (candidates.length === 0) return "None found for their area yet. Day trips for a new area are gathered overnight, so suggest they try again tomorrow, and offer something nearer instead.";
    const home = (where ?? null) as Where | null;
    return selectBalanced(candidates, MAX_LISTED, 1)
      .map((a) => {
        const km = home?.location_lat != null && home?.location_lng != null && a.location_lat != null && a.location_lng != null ? haversineDistanceKm(home.location_lat, home.location_lng, a.location_lat, a.location_lng) : null;
        const price = a.price_estimate === null ? "" : a.price_estimate === 0 ? " | Free" : ` | £${a.price_estimate}`;
        return `- id=${a.id} | ${a.title} | category=${a.category}${price} | ${a.address ?? "location TBC"} | ${journeyText(km, home ?? { drives: null, uses_public_transport: null, mobility_notes: null })}`;
      })
      .join("\n");
  } catch (err) {
    console.warn("chat: could not read day trips:", err instanceof Error ? err.message : err);
    return "";
  }
}
