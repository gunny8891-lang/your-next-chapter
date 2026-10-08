import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import { geocodeLocation, sleep, type Coordinates } from "@/lib/geo/geocode";
import { normaliseTags } from "@/lib/opportunities/tags";

export type DiscoveryRunResult = {
  source: string;
  found: number;
  inserted: number;
  insertedActive: number;
  skippedExisting: number;
  errors: string[];
};

/**
 * A saved candidate that still needs coordinates. Kept as a reference to its
 * source's result so that auto-activating it later can be counted there.
 */
export type PendingGeocode = {
  id: string;
  candidate: RawActivityCandidate;
  result: DiscoveryRunResult;
};

const MIN_GEOCODE_GAP_MS = 1100; // Nominatim asks for no more than ~1 request/sec

/**
 * Auto-activation without a human review pass: only when a candidate is
 * genuinely high-confidence — a real per-event booking URL (not a synthetic
 * fallback) AND a resolved, geocodable location. Anything short of that —
 * vague addresses, no real link — still needs review.
 */
function qualifiesForAutoActivation(c: RawActivityCandidate, hasCoordinates: boolean): boolean {
  return c.status === "needs_review" && Boolean(c.bookingUrlVerified) && hasCoordinates;
}

function activatedNote(c: RawActivityCandidate): string | null {
  return c.adminNotes ? `${c.adminNotes} (auto-activated: verified URL + resolved location)` : null;
}

/**
 * Phase 1 — fetch candidates from each source, dedupe against existing
 * activities by booking_url, and SAVE the rest as source='discovery_agent'.
 * Nothing slow happens here: no geocoding. A source's search can cost a dollar
 * or more and take minutes, so its results are stored the moment they come
 * back, rather than after a long rate-limited geocoding pass that could be cut
 * off by the function's time limit and lose everything the search paid for.
 *
 * Candidates that already carry coordinates are auto-activated here if they
 * qualify; the rest are saved as the source marked them (usually needs_review)
 * and returned as `pending` for geocodePending to finish.
 */
export async function persistDiscovery(
  supabase: SupabaseClient,
  sources: DiscoverySource[]
): Promise<{ results: DiscoveryRunResult[]; pending: PendingGeocode[] }> {
  const results: DiscoveryRunResult[] = [];
  const pending: PendingGeocode[] = [];

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

    if (toInsert.length > 0) {
      const saved = toInsert.map((c) => {
        const hasCoordinates = c.locationLat != null && c.locationLng != null;
        if (qualifiesForAutoActivation(c, hasCoordinates)) {
          c.status = "active";
          c.adminNotes = activatedNote(c);
        }
        // Ids are assigned here so a saved row can be updated later without
        // having to match it back by booking_url (several candidates can share one).
        return { id: crypto.randomUUID(), candidate: c, hasCoordinates };
      });

      const rows = saved.map(({ id, candidate: c }) => ({
        id,
        title: c.title,
        description: c.description,
        category: c.category,
        address: c.address,
        location_lat: c.locationLat,
        location_lng: c.locationLng,
        date_time: c.dateTime,
        expires_at: c.availableUntil ?? null,
        price_estimate: c.priceEstimate,
        // A price found by a search or a tag is an estimate until someone has checked it: the app says "about".
        price_type: c.priceEstimate === null ? "unknown" : c.priceEstimate === 0 ? "free" : "entry",
        cost_confidence: c.priceEstimate === null ? "unknown" : "estimated",
        recurrence_rule: c.openingHours ?? null,
        duration_minutes: c.durationMinutes ?? null,
        booking_url: c.bookingUrl,
        source: "discovery_agent" as const,
        tags: normaliseTags(c.tags),
        // Always all four, "unknown" when the source said nothing. Rows in one insert must carry the same columns: a
        // column present in some rows and absent in others is filled with null for the rest, not with the default, and
        // dog_access is not nullable.
        dog_access: c.dog?.access ?? "unknown",
        dog_restrictions: c.dog?.restrictions ?? null,
        dog_confidence: c.dog?.confidence ?? "unknown",
        dog_source: c.dog?.source ?? null,
        status: c.status ?? "active",
        admin_notes: c.adminNotes ?? null,
      }));

      const { error, count } = await supabase.from("activities").insert(rows, { count: "exact" });
      if (error) {
        result.errors.push(error.message);
      } else {
        result.inserted = count ?? toInsert.length;
        result.insertedActive = rows.filter((r) => r.status === "active").length;
        for (const { id, candidate, hasCoordinates } of saved) {
          if (!hasCoordinates && candidate.address) pending.push({ id, candidate, result });
        }
      }
    }

    results.push(result);
  }

  return { results, pending };
}

/**
 * Phase 2 — give saved candidates their coordinates and, where they qualify,
 * promote them from needs_review to active. Best-effort and safe to cut off:
 * anything not reached simply stays in the admin review queue.
 *
 * Geocodes each distinct address once (several events at one venue are
 * common), spaced to respect Nominatim's ~1 request/sec policy. Returns how
 * many candidates were auto-activated, and counts each in its source's result.
 */
export async function geocodePending(
  supabase: SupabaseClient,
  pending: PendingGeocode[],
  geocode: (address: string) => Promise<Coordinates | null> = geocodeLocation
): Promise<number> {
  const byAddress = new Map<string, Coordinates | null>();
  let lastRequestAt = 0;
  let activated = 0;

  for (const { id, candidate: c, result } of pending) {
    const address = c.address;
    if (!address) continue;

    if (!byAddress.has(address)) {
      const wait = MIN_GEOCODE_GAP_MS - (Date.now() - lastRequestAt);
      if (wait > 0) await sleep(wait);
      byAddress.set(address, await geocode(address));
      lastRequestAt = Date.now();
    }

    const coords = byAddress.get(address);
    if (!coords) continue;

    c.locationLat = coords.lat;
    c.locationLng = coords.lng;
    const update: Record<string, unknown> = { location_lat: coords.lat, location_lng: coords.lng };
    if (qualifiesForAutoActivation(c, true)) {
      update.status = "active";
      update.admin_notes = activatedNote(c);
    }

    const { error } = await supabase.from("activities").update(update).eq("id", id);
    if (error) {
      result.errors.push(`Couldn't update coordinates for "${c.title}": ${error.message}`);
      continue;
    }
    if (update.status === "active") {
      activated += 1;
      result.insertedActive += 1;
    }
  }

  return activated;
}

/**
 * Runs each registered Discovery Source end to end: save what it found, then
 * geocode and auto-activate. Manual curation for the pilot region
 * (supabase/seed.sql) stays the primary source for now per spec section 2 —
 * this tops it up. The regional search calls the two phases separately so it
 * can record its outcome in between (see regional.ts).
 */
export async function runDiscoveryAgent(
  supabase: SupabaseClient,
  sources: DiscoverySource[]
): Promise<DiscoveryRunResult[]> {
  const { results, pending } = await persistDiscovery(supabase, sources);
  await geocodePending(supabase, pending);
  return results;
}
