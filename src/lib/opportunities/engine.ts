import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreActivity, type AffinityScores } from "@/lib/memory/scoring";
import { computeLearnedAffinity, LEARNING_WINDOW_DAYS, type LearningEvent, type LearningSignal } from "@/lib/memory/learning";
import { filterByDistance } from "@/lib/geo/filterByDistance";
import { isStillAvailable } from "@/lib/opportunities/availability";
import { applyFoodVenueMode, type FoodVenueMode } from "@/lib/opportunities/kinds";
import { normaliseTags } from "@/lib/opportunities/tags";

export type OpportunityCandidate = {
  id: string;
  title: string;
  /** What it is, in a sentence or two (may be null). */
  description: string | null;
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
  expires_at: string | null;
  /** Weekly opening hours (OpenStreetMap syntax) for a standing venue; null if unknown. */
  recurrence_rule: string | null;
  /** Typical visit length in minutes, when known. */
  duration_minutes: number | null;
  /**
   * What it costs and whether a dog can come, held as what is known (see facts.ts). Optional: the rest of the app
   * never needs them, and a row read before they existed simply has none, which means "not known".
   */
  price_min?: number | null;
  price_max?: number | null;
  price_type?: string | null;
  cost_confidence?: string | null;
  booking_required?: boolean | null;
  dog_access?: string | null;
  dog_restrictions?: string | null;
  dog_confidence?: string | null;
  dog_source?: string | null;
};

export type FetchOpportunitiesOptions = {
  /** Never include these activity ids in the result (already scheduled, currently on screen, etc). */
  excludeActivityIds?: Set<string>;
  /** Restrict to a single category (e.g. swap alternatives within the same slot's category). */
  category?: string;
  /**
   * Cafés, pubs and restaurants. Left out by default so the weekly plan, Surprise
   * Me, nudges and swaps never offer "a pub" as an activity; "I've got some time"
   * asks for them.
   */
  foodVenues?: FoodVenueMode;
};

/**
 * Takes the top `limit` of an already-ranked list, but guarantees every category
 * that has anything at least `minPerCategory` slots. Plain top-N lets whichever
 * category happens to sit first crowd the rest out — for a new member every
 * score ties, so a week could be planned from one or two categories even when
 * the database holds all seven. Order within the result is the original rank.
 */
export function selectBalanced<T extends { category: string }>(ranked: T[], limit: number, minPerCategory: number): T[] {
  const picked = new Set<number>();
  const perCategory = new Map<string, number>();
  ranked.forEach((item, index) => {
    const count = perCategory.get(item.category) ?? 0;
    if (count < minPerCategory && picked.size < limit) {
      picked.add(index);
      perCategory.set(item.category, count + 1);
    }
  });
  for (let index = 0; index < ranked.length && picked.size < limit; index++) picked.add(index);
  return [...picked].sort((a, b) => a - b).map((index) => ranked[index]);
}

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
    .select("location_lat, location_lng, travel_radius_km, interests")
    .eq("user_id", memberId)
    .maybeSingle();

  let query = supabase
    .from("activities")
    .select(
      "id, title, description, category, address, price_estimate, tags, rating, accessibility_notes, location_lat, location_lng, booking_url, date_time, expires_at, recurrence_rule, duration_minutes, price_min, price_max, price_type, cost_confidence, booking_required, dog_access, dog_restrictions, dog_confidence, dog_source"
    )
    .eq("status", "active");
  if (options.category) query = query.eq("category", options.category);

  const { data: activities, error: activitiesError } = await query;
  // A failed read must not look like "nothing nearby" — that would silently
  // empty every recommendation surface at once.
  if (activitiesError) throw new Error(`Couldn't load activities: ${activitiesError.message}`);

  // Never recommend something that's already over: a one-off event whose date
  // has passed, or an exhibition/series past its end. Done here rather than by
  // changing status, because members can't read non-active activities — that
  // would make finished items vanish from their own week view and history.
  const now = new Date();
  const allActive = applyFoodVenueMode(
    // Tags arrive from several sources in several spellings; every rule below reads them in one vocabulary.
    ((activities ?? []) as OpportunityCandidate[]).map((a) => ({ ...a, tags: normaliseTags(a.tags) })).filter((a) => isStillAvailable(a, now)),
    options.foodVenues ?? "exclude"
  );

  const inRange = filterByDistance(
    allActive,
    profile ?? { location_lat: null, location_lng: null, travel_radius_km: null }
  );

  const eligible = options.excludeActivityIds
    ? inRange.filter((a) => !options.excludeActivityIds!.has(a.id))
    : inRange;

  // What they actually do, over the last year, read as the one source of what they like. The
  // experience log is the rich record; the older signals fill in history from before it existed
  // (and anywhere that does not write to the log yet), without counting anything twice.
  const since = new Date(Date.now() - LEARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: signals }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("preference_signals")
      .select("signal_type, source, activity_id, created_at, activities(category, tags)")
      .eq("member_id", memberId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("experience_events")
      .select("activity_id, event_type, outcome, reason, context, created_at, activities(category, tags)")
      .eq("member_id", memberId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);
  // A failed read of the log (the table not there, a hiccup) must not take recommendations down: learn from the signals alone.
  if (eventsError) console.warn("engine: could not read the experience log:", eventsError.message);
  const learned = computeLearnedAffinity(
    eventsError ? [] : ((events ?? []) as unknown as LearningEvent[]),
    (signals ?? []) as unknown as LearningSignal[]
  );
  // What they told us they like is protected: behaviour can tilt against it, but only so far.
  const affinity: AffinityScores = { ...learned, protectedTags: (profile?.interests ?? []).map((i: string) => i.trim().toLowerCase()).filter(Boolean) };

  const candidates = [...eligible].sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity));

  return { candidates, affinity };
}
