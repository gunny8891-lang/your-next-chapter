import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAffinity, scoreActivity, type AffinityScores, type PreferenceSignalRow } from "@/lib/memory/scoring";
import { filterByDistance } from "@/lib/geo/filterByDistance";

export type OpportunityCandidate = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  price_estimate: number | null;
  tags: string[];
  rating: number | null;
  accessibility_notes: string | null;
  location_lat: number | null;
  location_lng: number | null;
  booking_url: string | null;
  date_time: string | null;
};

export type FetchOpportunitiesOptions = {
  /** Never include these activity ids in the result (already scheduled, currently on screen, etc). */
  excludeActivityIds?: Set<string>;
  /** Restrict to a single category (e.g. swap alternatives within the same slot's category). */
  category?: string;
};

/**
 * The shared candidate-gathering pipeline behind every recommendation surface
 * (Itinerary Agent, on-demand Surprise Me, concierge chat, nudge detection,
 * swap alternatives): fetch the member's active activities, restrict to their
 * travel radius, apply the caller's exclusions, and rank by Memory Agent
 * affinity — highest-scoring first.
 *
 * Centralizing this closes a real gap: chat, nudge detection, and swap
 * alternatives each independently queried `activities` without ever applying
 * distance filtering, so they could surface something outside a member's
 * travel radius. It also means a future provider (Google Places, a wider
 * Ticketmaster rollout, etc.) only needs to land normalized rows in
 * `activities` to reach every surface — no per-consumer wiring (project brief
 * sections 9-10, "Opportunity Engine").
 */
export async function fetchRankedOpportunities(
  supabase: SupabaseClient,
  memberId: string,
  options: FetchOpportunitiesOptions = {}
): Promise<{ candidates: OpportunityCandidate[]; affinity: AffinityScores }> {
  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_lat, location_lng, travel_radius_km")
    .eq("user_id", memberId)
    .maybeSingle();

  let query = supabase
    .from("activities")
    .select(
      "id, title, category, address, price_estimate, tags, rating, accessibility_notes, location_lat, location_lng, booking_url, date_time"
    )
    .eq("status", "active");
  if (options.category) query = query.eq("category", options.category);

  const { data: activities } = await query;
  const allActive = (activities ?? []) as OpportunityCandidate[];

  const inRange = filterByDistance(
    allActive,
    profile ?? { location_lat: null, location_lng: null, travel_radius_km: null }
  );

  const eligible = options.excludeActivityIds
    ? inRange.filter((a) => !options.excludeActivityIds!.has(a.id))
    : inRange;

  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals } = await supabase
    .from("preference_signals")
    .select("signal_type, activity_id, created_at, activities(category, tags)")
    .eq("member_id", memberId)
    .gte("created_at", fourWeeksAgo)
    .order("created_at", { ascending: false })
    .limit(50);
  const affinity = computeAffinity((signals ?? []) as unknown as PreferenceSignalRow[]);

  const candidates = [...eligible].sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity));

  return { candidates, affinity };
}
