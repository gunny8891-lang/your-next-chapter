import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySource } from "@/lib/discovery/types";

export type DiscoveryRunResult = {
  source: string;
  found: number;
  inserted: number;
  skippedExisting: number;
  errors: string[];
};

/**
 * Runs each registered Discovery Source, dedupes against existing activities by
 * booking_url (each source's stable per-event URL), and inserts the rest as
 * source='discovery_agent'. Manual curation for the pilot region (supabase/seed.sql)
 * stays the primary source for now per spec section 2 — this tops it up.
 */
export async function runDiscoveryAgent(
  supabase: SupabaseClient,
  sources: DiscoverySource[]
): Promise<DiscoveryRunResult[]> {
  const results: DiscoveryRunResult[] = [];

  for (const source of sources) {
    const result: DiscoveryRunResult = { source: source.name, found: 0, inserted: 0, skippedExisting: 0, errors: [] };

    let candidates;
    try {
      candidates = await source.fetchCandidates();
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Unknown fetch error");
      results.push(result);
      continue;
    }
    result.found = candidates.length;

    if (candidates.length === 0) {
      results.push(result);
      continue;
    }

    const { data: existing } = await supabase
      .from("activities")
      .select("booking_url")
      .in(
        "booking_url",
        candidates.map((c) => c.bookingUrl)
      );
    const existingUrls = new Set((existing ?? []).map((r) => r.booking_url));

    const toInsert = candidates.filter((c) => !existingUrls.has(c.bookingUrl));
    result.skippedExisting = candidates.length - toInsert.length;

    if (toInsert.length > 0) {
      const rows = toInsert.map((c) => ({
        title: c.title,
        description: c.description,
        category: c.category,
        address: c.address,
        location_lat: c.locationLat,
        location_lng: c.locationLng,
        date_time: c.dateTime,
        price_estimate: c.priceEstimate,
        booking_url: c.bookingUrl,
        source: "discovery_agent" as const,
        tags: c.tags,
        status: "active" as const,
      }));

      const { error, count } = await supabase.from("activities").insert(rows, { count: "exact" });
      if (error) result.errors.push(error.message);
      else result.inserted = count ?? toInsert.length;
    }

    results.push(result);
  }

  return results;
}
