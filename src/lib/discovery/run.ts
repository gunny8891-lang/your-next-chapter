import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySource } from "@/lib/discovery/types";
import { geocodeLocation, sleep } from "@/lib/geo/geocode";
import { createClaudeWebSearchSource } from "@/lib/discovery/sources/claudeWebSearch";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";

export type DiscoveryRunResult = {
  source: string;
  found: number;
  inserted: number;
  insertedActive: number;
  skippedExisting: number;
  errors: string[];
};

/**
 * Runs each registered Discovery Source, dedupes against existing activities by
 * booking_url (each source's stable per-event URL), and inserts the rest as
 * source='discovery_agent'. Manual curation for the pilot region (supabase/seed.sql)
 * stays the primary source for now per spec section 2 — this tops it up.
 *
 * A needs_review candidate is auto-activated (skipping the admin queue) only
 * when it has both a genuine per-event booking URL and a resolved location —
 * see the loop below. Everything else still requires manual approval.
 */
export async function runDiscoveryAgent(
  supabase: SupabaseClient,
  sources: DiscoverySource[]
): Promise<DiscoveryRunResult[]> {
  const results: DiscoveryRunResult[] = [];

  for (const source of sources) {
    const result: DiscoveryRunResult = {
      source: source.name,
      found: 0,
      inserted: 0,
      insertedActive: 0,
      skippedExisting: 0,
      errors: [],
    };

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

    // Most sources can't provide coordinates directly (an LLM reading a page
    // has no lat/lng to give), so geocode from the address here — one place,
    // regardless of source — respecting Nominatim's ~1 request/sec policy.
    for (const c of toInsert) {
      if (c.locationLat == null && c.locationLng == null && c.address) {
        const coords = await geocodeLocation(c.address);
        if (coords) {
          c.locationLat = coords.lat;
          c.locationLng = coords.lng;
        }
        await sleep(1100);
      }

      // Auto-activate without a human review pass, but only when a candidate
      // is genuinely high-confidence: a real per-event booking URL (not a
      // synthetic fallback) AND a resolved, geocodable location. Anything
      // short of that — vague addresses, no real link — still needs review.
      if (c.status === "needs_review" && c.bookingUrlVerified && c.locationLat != null && c.locationLng != null) {
        c.status = "active";
        c.adminNotes = c.adminNotes ? `${c.adminNotes} (auto-activated: verified URL + resolved location)` : null;
      }
    }

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
        status: c.status ?? "active",
        admin_notes: c.adminNotes ?? null,
      }));

      const { error, count } = await supabase.from("activities").insert(rows, { count: "exact" });
      if (error) result.errors.push(error.message);
      else {
        result.inserted = count ?? toInsert.length;
        result.insertedActive = rows.filter((r) => r.status === "active").length;
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Fire-and-forget single-region discovery run, meant to be called from
 * `after()` when a member sets or changes their location — rather than
 * leaving a brand-new region with zero candidates until the nightly cron
 * happens to cover it. Swallows its own errors since nothing awaits this.
 *
 * If the run auto-activated any candidates (see runDiscoveryAgent), the
 * member's itinerary is regenerated again so their week picks them up
 * without them needing to click "Generate my real week" themselves. Skipped
 * when nothing new went active, to avoid a wasted Itinerary Agent call.
 */
export async function triggerDiscoveryForRegion(supabase: SupabaseClient, memberId: string, region: string): Promise<void> {
  try {
    const results = await runDiscoveryAgent(supabase, [createClaudeWebSearchSource([region])]);
    const newlyActive = results.reduce((sum, r) => sum + r.insertedActive, 0);
    if (newlyActive > 0) {
      await generateAndSaveItinerary(supabase, memberId);
    }
  } catch {
    // Best-effort — the nightly cron will retry this region regardless.
  }
}
