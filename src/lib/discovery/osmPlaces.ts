import type { SupabaseClient } from "@supabase/supabase-js";
import { persistDiscovery } from "@/lib/discovery/run";
import {
  createOpenStreetMapSource,
  OSM_FOOD_NOTE_PREFIX,
  OSM_PLACES_NOTE_PREFIX,
  type OpenStreetMapDeps,
  type OsmLayer,
} from "@/lib/discovery/sources/openStreetMap";
import { geocodeLocation, sleep, type Coordinates } from "@/lib/geo/geocode";

// Anything this close to a region's centre counts as that region's coverage.
const COVERED_RADIUS_KM = 12;

const LAYERS: { layer: OsmLayer; notePrefix: string }[] = [
  { layer: "places", notePrefix: OSM_PLACES_NOTE_PREFIX },
  { layer: "food", notePrefix: OSM_FOOD_NOTE_PREFIX },
];

export type OsmRegionOutcome = {
  region: string;
  status: "added" | "already_covered" | "failed";
  inserted: number;
  error?: string;
};

type Deps = OpenStreetMapDeps & {
  geocode?: (query: string) => Promise<Coordinates | null>;
};

async function alreadyCovered(supabase: SupabaseClient, centre: Coordinates, notePrefix: string): Promise<boolean> {
  const dLat = COVERED_RADIUS_KM / 111;
  const dLng = COVERED_RADIUS_KM / (111 * Math.cos((centre.lat * Math.PI) / 180));
  const { count, error } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .like("admin_notes", `${notePrefix}%`)
    .gte("location_lat", centre.lat - dLat)
    .lte("location_lat", centre.lat + dLat)
    .gte("location_lng", centre.lng - dLng)
    .lte("location_lng", centre.lng + dLng);
  if (error) throw new Error(`Couldn't check existing place coverage: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Makes sure a region has its free OpenStreetMap layers: general places
 * (libraries, parks, museums…) and food & drink (cafés, pubs, restaurants, tea
 * rooms). Each is checked and fetched on its own, so a region that already has
 * its places still gets food. Venues rarely change, so once a layer has any rows
 * in a region it isn't fetched again — this is what keeps the nightly job and
 * repeated location changes from re-querying a public service for nothing.
 * Never throws: a failure is reported in the outcome.
 */
export async function ensureOpenStreetMapPlaces(
  supabase: SupabaseClient,
  region: string,
  deps: Deps = {}
): Promise<OsmRegionOutcome> {
  try {
    const centre = await (deps.geocode ?? geocodeLocation)(region);
    if (!centre) return { region, status: "failed", inserted: 0, error: `Couldn't locate "${region}"` };

    let inserted = 0;
    let fetchedAny = false;
    const errors: string[] = [];

    for (const { layer, notePrefix } of LAYERS) {
      if (await alreadyCovered(supabase, centre, notePrefix)) continue;
      fetchedAny = true;

      // Space this request from the previous one — Nominatim allows ~1/second.
      await (deps.sleep ?? sleep)(1100);
      const { results } = await persistDiscovery(supabase, [createOpenStreetMapSource(supabase, centre, region, deps, layer)]);
      const result = results[0];
      inserted += result.inserted;
      if (result.errors.length) errors.push(`${layer}: ${result.errors[0]}`);
    }

    if (!fetchedAny) return { region, status: "already_covered", inserted: 0 };
    if (errors.length) return { region, status: "failed", inserted, error: errors.join("; ") };
    return { region, status: "added", inserted };
  } catch (err) {
    return { region, status: "failed", inserted: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Covers several regions, one at a time. `maxFetches` bounds how many actually
 * hit the network per call (already-covered regions only cost a geocode), so a
 * backlog of new regions is worked through over a few runs instead of one long one.
 */
export async function ensureOpenStreetMapPlacesForRegions(
  supabase: SupabaseClient,
  regions: string[],
  options: { maxFetches?: number } & Deps = {}
): Promise<OsmRegionOutcome[]> {
  const maxFetches = options.maxFetches ?? 2;
  const outcomes: OsmRegionOutcome[] = [];
  let fetched = 0;
  for (const region of regions) {
    if (fetched >= maxFetches) break;
    const outcome = await ensureOpenStreetMapPlaces(supabase, region, options);
    outcomes.push(outcome);
    if (outcome.status !== "already_covered") fetched += 1;
    await (options.sleep ?? sleep)(1100);
  }
  return outcomes;
}
