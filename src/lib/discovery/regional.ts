import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistDiscovery,
  geocodePending,
  type DiscoveryRunResult,
  type PendingGeocode,
} from "@/lib/discovery/run";
import { createClaudeWebSearchSource } from "@/lib/discovery/sources/claudeWebSearch";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";
import { decideSearch, normalizeRegionKey, type RegionState, type SearchDecision } from "@/lib/discovery/throttle";
import type { Coordinates } from "@/lib/geo/geocode";

/**
 * Runs the real search for one region and saves what it found (phase 1 only —
 * see persistDiscovery). Injectable so the orchestration can be tested without
 * spending tokens.
 */
export type RunSearch = (region: string) => Promise<{ results: DiscoveryRunResult[]; pending: PendingGeocode[] }>;

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
  regions: string[],
  options: Options = {}
): Promise<ThrottledSearchSummary> {
  const maxSearches = options.maxSearches ?? 1;
  const nowIso = () => (options.now ?? new Date()).toISOString();
  const runSearch: RunSearch =
    options.runSearch ?? ((region) => persistDiscovery(supabase, [createClaudeWebSearchSource([region])]));

  const labelByKey = new Map<string, string>();
  for (const label of regions) {
    const key = normalizeRegionKey(label);
    if (key && !labelByKey.has(key)) labelByKey.set(key, label.trim());
  }

  const summary: ThrottledSearchSummary = { searched: [], skipped: [], deferred: [] };
  if (labelByKey.size === 0) return summary;

  const { data: stateRows, error: stateError } = await supabase
    .from("discovery_regions")
    .select("region_key, region_label, last_attempt_at, last_success_at, empty_runs, consecutive_failures")
    .in("region_key", [...labelByKey.keys()]);
  if (stateError) {
    throw new Error(`Couldn't read discovery_regions (is the migration applied?): ${stateError.message}`);
  }
  const stateByKey = new Map((stateRows ?? []).map((r) => [r.region_key as string, r as RegionState]));

  const due: { key: string; label: string; state: RegionState | undefined }[] = [];
  for (const [key, label] of labelByKey) {
    const state = stateByKey.get(key);
    const decision = decideSearch(state, options.now ?? new Date());
    const runnable = decision.due || (options.force && decision.reason !== "just_attempted");
    if (runnable) due.push({ key, label, state });
    else summary.skipped.push({ region: label, reason: decision.reason });
  }

  due.sort((a, b) => lastSuccessMs(a.state) - lastSuccessMs(b.state));
  const toRun = due.slice(0, maxSearches);
  summary.deferred = due.slice(maxSearches).map((d) => d.label);

  for (const { key, label, state } of toRun) {
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
      ({ results, pending } = await runSearch(label));
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
 * Fire-and-forget regional discovery, meant to be called from `after()` when a
 * member sets or changes their location. Goes through the same throttle as the
 * nightly job, so five members in one town cost one search, not five.
 *
 * If the search auto-activated anything, the member's itinerary is regenerated
 * so their week picks it up without a manual "Generate my real week" click.
 * Swallows its own errors since nothing awaits this.
 */
export async function triggerDiscoveryForRegion(
  supabase: SupabaseClient,
  memberId: string,
  region: string
): Promise<void> {
  try {
    const summary = await searchRegionsThrottled(supabase, [region], { maxSearches: 1 });
    const newlyActive = summary.searched.reduce((sum, o) => sum + o.insertedActive, 0);
    if (newlyActive > 0) await generateAndSaveItinerary(supabase, memberId);
  } catch {
    // Best-effort — the nightly job will pick this region up when it's due.
  }
}
