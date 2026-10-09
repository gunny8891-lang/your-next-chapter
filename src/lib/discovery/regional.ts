import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistDiscovery,
  geocodePending,
  type DiscoveryRunResult,
  type PendingGeocode,
} from "@/lib/discovery/run";
import { createClaudeWebSearchSource } from "@/lib/discovery/sources/claudeWebSearch";
import { searchAllowed } from "@/lib/ai/limits";
import { ensureOpenStreetMapPlaces } from "@/lib/discovery/osmPlaces";
import { memberAreas } from "@/lib/discovery/areas";
import { mergeDuplicateVenues } from "@/lib/discovery/duplicates";
import { DISCOVERY_THEMES, isThemedKey, THEME_REFRESH_DAYS, themedKey } from "@/lib/discovery/themes";
import { createTicketmasterSource } from "@/lib/discovery/sources/ticketmaster";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";
import { decideSearch, nearestRegion, normalizeRegionKey, type RegionState, type SearchDecision } from "@/lib/discovery/throttle";
import { geocodeLocation, sleep, type Coordinates } from "@/lib/geo/geocode";

/** A place to search: the words, and where it is when that is already known (so it is not looked up again). */
export type RegionRequest = {
  label: string;
  lat?: number | null;
  lng?: number | null;
  /** A focused search for one kind of thing in this place (see themes.ts), throttled on its own and less often. */
  theme?: string;
};

/** One request per focused search for a place: the same place, once for each theme. */
export function themedRequests(place: RegionRequest, themes: { key: string }[] = DISCOVERY_THEMES): RegionRequest[] {
  return themes.map((t) => ({ ...place, theme: t.key }));
}

/**
 * Runs the real search for one region and saves what it found (phase 1 only —
 * see persistDiscovery). Injectable so the orchestration can be tested without
 * spending tokens.
 */
export type RunSearch = (region: string, theme?: string) => Promise<{ results: DiscoveryRunResult[]; pending: PendingGeocode[] }>;

export type RegionOutcome = {
  region: string;
  status: "searched" | "failed";
  found: number;
  inserted: number;
  insertedActive: number;
  error?: string;
};

export type ThrottledSearchSummary = {
  searched: RegionOutcome[];
  skipped: { region: string; reason: SearchDecision["reason"] }[];
  /** Due, but left for a later run because of maxSearches. */
  deferred: string[];
};

type Options = {
  /** A single search can take minutes (observed ~4.5), so keep this small per function invocation. */
  maxSearches?: number;
  /** Search even if not due (still never while another search for the region is in flight). */
  force?: boolean;
  now?: Date;
  runSearch?: RunSearch;
  /** The member whose sign-up or location change started this, so the cost is attributed to them. */
  memberId?: string;
  /** Injectable for the same reason as runSearch. */
  geocode?: (address: string) => Promise<Coordinates | null>;
};

function lastSuccessMs(state: RegionState | undefined): number {
  return state?.last_success_at ? new Date(state.last_success_at).getTime() : 0;
}

/**
 * The only path that spends money on a regional web search. Decides which
 * regions are actually worth searching (see throttle.ts), searches at most
 * `maxSearches` of them — never-searched first, then least recently
 * searched — and records the outcome so the next run can skip them.
 *
 * Fails closed: if the throttle state can't be read or a search can't be
 * claimed, nothing is searched, rather than falling back to unthrottled spend.
 */
export async function searchRegionsThrottled(
  supabase: SupabaseClient,
  regions: (string | RegionRequest)[],
  options: Options = {}
): Promise<ThrottledSearchSummary> {
  const maxSearches = options.maxSearches ?? 1;
  const nowIso = () => (options.now ?? new Date()).toISOString();
  const runSearch: RunSearch =
    options.runSearch ?? ((region, theme) => persistDiscovery(supabase, [createClaudeWebSearchSource([region], { memberId: options.memberId, theme })]));

  const requests: RegionRequest[] = regions
    .map((r) => (typeof r === "string" ? { label: r } : r))
    .map((r) => ({ ...r, label: r.label.trim() }))
    .filter((r) => r.label);

  const summary: ThrottledSearchSummary = { searched: [], skipped: [], deferred: [] };
  if (requests.length === 0) return summary;

  // Every region searched so far (a short list): a request is matched to one by WHERE it is, not by how it was typed,
  // so a postcode, "Town, County" and "Town" are one place and cost one search.
  const { data: stateRows, error: stateError } = await supabase
    .from("discovery_regions")
    .select("region_key, region_label, last_attempt_at, last_success_at, empty_runs, consecutive_failures, lat, lng");
  if (stateError) {
    throw new Error(`Couldn't read discovery_regions (is the migration applied?): ${stateError.message}`);
  }
  const allStates = (stateRows ?? []) as RegionState[];
  // A focused search keeps its own state under its own key; it is never what a place is matched to.
  const known = allStates.filter((r) => !isThemedKey(r.region_key));
  const stateByKey = new Map(allStates.map((r) => [r.region_key, r]));
  const geocode = options.geocode ?? geocodeLocation;

  type Wanted = { key: string; label: string; state: RegionState | undefined; point: Coordinates | null; theme?: string };
  const wanted = new Map<string, Wanted>();
  let lookedUp = 0;
  for (const request of requests) {
    let point: Coordinates | null = request.lat != null && request.lng != null ? { lat: Number(request.lat), lng: Number(request.lng) } : null;
    if (!point) {
      // Without a position the best that can be done is the words. A failed lookup is not an error: it just means that.
      if (lookedUp > 0) await sleep(1100);
      lookedUp += 1;
      point = await geocode(request.label).catch(() => null);
    }
    const near = point ? nearestRegion(known, point) : undefined;
    // Two new requests for the same place in one run (a postcode and the town) are one search too.
    const sibling = !near && point ? nearestRegion([...wanted.values()].map((w) => ({ ...w, ...(w.point ?? {}) })), point) : undefined;
    const placeKey = near?.region_key ?? sibling?.key ?? normalizeRegionKey(request.label);
    if (!placeKey) continue;
    // A focused search for the same place is its own entry, with its own state.
    const key = request.theme ? themedKey(placeKey.split("#")[0], request.theme) : placeKey;
    if (wanted.has(key)) continue;
    // An existing region keeps its own name, so what is searched is the place that was searched before, not a postcode.
    const stored = near ?? stateByKey.get(placeKey);
    wanted.set(key, {
      key,
      label: stored?.region_label ?? request.label,
      state: request.theme ? stateByKey.get(key) : stored,
      point,
      theme: request.theme,
    });
  }

  const due: Wanted[] = [];
  for (const w of wanted.values()) {
    const decision = decideSearch(w.state, options.now ?? new Date(), w.theme ? THEME_REFRESH_DAYS : undefined);
    const runnable = decision.due || (options.force && decision.reason !== "just_attempted");
    if (runnable) due.push(w);
    else summary.skipped.push({ region: w.theme ? `${w.label} (${w.theme})` : w.label, reason: decision.reason });
  }

  due.sort((a, b) => lastSuccessMs(a.state) - lastSuccessMs(b.state));
  const toRun = due.slice(0, maxSearches);
  summary.deferred = due.slice(maxSearches).map((d) => (d.theme ? `${d.label} (${d.theme})` : d.label));

  for (const { key, label, state, point, theme } of toRun) {
    // Claim first. The failure count is bumped pessimistically and cleared on
    // success, so a search that gets killed mid-way (no chance to record
    // anything) still backs off instead of looking like it never happened —
    // and a second trigger for the same place can't start a duplicate.
    const { error: claimError } = await supabase.from("discovery_regions").upsert(
      {
        region_key: key,
        region_label: label,
        last_attempt_at: nowIso(),
        consecutive_failures: (state?.consecutive_failures ?? 0) + 1,
        // Where the region is, recorded once and not moved by later requests from nearby addresses. Not for a focused
        // search: with a position it could be matched as the place itself, and take the place's own throttle with it.
        ...(point && state?.lat == null && !theme ? { lat: point.lat, lng: point.lng } : {}),
      },
      { onConflict: "region_key" }
    );
    if (claimError) {
      summary.searched.push({
        region: label,
        status: "failed",
        found: 0,
        inserted: 0,
        insertedActive: 0,
        error: `Couldn't claim region: ${claimError.message}`,
      });
      continue;
    }

    let outcome: RegionOutcome;
    let results: DiscoveryRunResult[] = [];
    let pending: PendingGeocode[] = [];
    try {
      ({ results, pending } = await runSearch(label, theme));
      const errors = results.flatMap((r) => r.errors);
      outcome = {
        region: label,
        status: errors.length ? "failed" : "searched",
        found: results.reduce((s, r) => s + r.found, 0),
        inserted: results.reduce((s, r) => s + r.inserted, 0),
        insertedActive: results.reduce((s, r) => s + r.insertedActive, 0),
        error: errors[0],
      };
    } catch (err) {
      outcome = {
        region: label,
        status: "failed",
        found: 0,
        inserted: 0,
        insertedActive: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
    summary.searched.push(outcome);

    const update =
      outcome.status === "searched"
        ? {
            last_success_at: nowIso(),
            consecutive_failures: 0,
            empty_runs: outcome.inserted === 0 ? (state?.empty_runs ?? 0) + 1 : 0,
            last_found: outcome.found,
            last_inserted: outcome.inserted,
            last_error: null,
          }
        : { last_error: (outcome.error ?? "Unknown error").slice(0, 500) };
    const { error: recordError } = await supabase.from("discovery_regions").update(update).eq("region_key", key);
    if (recordError) console.error(`Failed to record discovery outcome for "${label}":`, recordError.message);

    // Only now give the saved activities their coordinates and promote the
    // qualifying ones. This is the slow, rate-limited part, so it comes after
    // both the results are saved and the success is recorded: if the function
    // is cut off here, the search is neither lost nor retried at full cost
    // tomorrow — whatever wasn't reached just stays in the review queue.
    if (outcome.status === "searched" && pending.length > 0) {
      try {
        await geocodePending(supabase, pending, options.geocode);
        outcome.insertedActive = results.reduce((s, r) => s + r.insertedActive, 0);
      } catch (err) {
        console.error(`Geocoding pass failed for "${label}":`, err instanceof Error ? err.message : err);
      }
    }
  }

  return summary;
}

/**
 * Events near one member, fetched right away when they set their location so a
 * new area doesn't wait for the nightly run. Returns how many went live; a
 * missing key or any failure just means none — the nightly job will try again.
 */
async function fetchTicketmasterNear(supabase: SupabaseClient, memberId: string): Promise<number> {
  if (!process.env.TICKETMASTER_API_KEY) return 0;
  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_lat, location_lng, travel_radius_km")
    .eq("user_id", memberId)
    .maybeSingle();
  const [area] = memberAreas(profile ? [profile] : []);
  if (!area) return 0;
  const { results } = await persistDiscovery(supabase, [createTicketmasterSource(area)]);
  return results.reduce((sum, r) => sum + r.insertedActive, 0);
}

/**
 * Fire-and-forget regional discovery, meant to be called from `after()` when a
 * member sets or changes their location. Goes through the same throttle as the
 * nightly job, so five members in one town cost one search, not five.
 *
 * If the search auto-activated anything, the member's itinerary is regenerated
 * so their week picks it up without a manual "Generate my real week" click.
 * Swallows its own errors since nothing awaits this.
 */
/** The steps of a regional trigger, replaceable so the rebuild of a member's week can be tested without searching anything. */
export type TriggerDeps = {
  searchAllowed?: typeof searchAllowed;
  searchRegions?: typeof searchRegionsThrottled;
  ensurePlaces?: typeof ensureOpenStreetMapPlaces;
  events?: (supabase: SupabaseClient, memberId: string) => Promise<number>;
  rebuildWeek?: typeof generateAndSaveItinerary;
  mergeDuplicates?: typeof mergeDuplicateVenues;
};

export async function triggerDiscoveryForRegion(
  supabase: SupabaseClient,
  memberId: string,
  region: string,
  deps: TriggerDeps = {}
): Promise<void> {
  try {
    // The free place layer runs alongside the paid search, not after it: a
    // regional search can take ~4.5 of the 5 minutes available, so queueing
    // this behind it could get both cut off.
    // The paid search (about $1.30) is the one thing here that costs real money, so it runs only
    // within the per-member and system-wide daily budget. The free places and events do not.
    // Where the member actually is (saved with their profile before this runs): the search is matched to a region by
    // place, so a postcode or "Town, County" for somewhere already searched does not start a second search.
    const { data: home } = await supabase.from("member_profiles").select("location_lat, location_lng").eq("user_id", memberId).maybeSingle();
    const request: RegionRequest = { label: region, lat: home?.location_lat ?? null, lng: home?.location_lng ?? null };
    const budget = await (deps.searchAllowed ?? searchAllowed)(supabase, memberId);
    if (!budget.allowed) console.warn(`discovery: not searching "${region}" for member ${memberId.slice(0, 8)} (${budget.reason}); the nightly job will reach it when it is due`);
    const [summary, places, events] = await Promise.all([
      (deps.searchRegions ?? searchRegionsThrottled)(supabase, [request], { maxSearches: budget.allowed ? 1 : 0, memberId }),
      (deps.ensurePlaces ?? ensureOpenStreetMapPlaces)(supabase, region),
      (deps.events ?? fetchTicketmasterNear)(supabase, memberId).catch(() => 0),
    ]);
    const newlyActive = summary.searched.reduce((sum, o) => sum + o.insertedActive, 0) + places.inserted + events;
    if (newlyActive > 0) {
      // The same place found by two sources is one place, before a week is built from them.
      await (deps.mergeDuplicates ?? mergeDuplicateVenues)(supabase);
      await (deps.rebuildWeek ?? generateAndSaveItinerary)(supabase, memberId);
    }
  } catch {
    // Best-effort — the nightly job will pick this region up when it's due.
  }
}
