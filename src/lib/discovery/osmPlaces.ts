import type { SupabaseClient } from "@supabase/supabase-js";
import { persistDiscovery } from "@/lib/discovery/run";
import {
  createOpenStreetMapSource,
  OSM_FOOD_NOTE_PREFIX,
  OSM_PLACES_NOTE_PREFIX,
  OSM_THINGS_NOTE_PREFIX,
  OSM_GARDEN_CENTRES_NOTE_PREFIX,
  type OpenStreetMapDeps,
  type OsmLayer,
} from "@/lib/discovery/sources/openStreetMap";
import { createDayTripSource, OSM_DAYTRIPS_NOTE_PREFIX } from "@/lib/discovery/sources/dayTrips";
import { createHeritageSource, OSM_HERITAGE_NOTE_PREFIX } from "@/lib/discovery/sources/heritage";
import type { DiscoverySource } from "@/lib/discovery/types";
import { themedKey } from "@/lib/discovery/themes";
import { normalizeRegionKey } from "@/lib/discovery/throttle";
import { geocodeLocation, sleep, type Coordinates } from "@/lib/geo/geocode";
import { haversineDistanceKm } from "@/lib/geo/haversine";

/**
 * Anything this close to a place counts as covering it. It must be smaller than the distance between a town and its
 * villages: at 12 km, Ardeley (8 km from Stevenage) counted as already covered by Stevenage's places, so nothing around
 * the village itself was ever fetched and someone living there saw only the town. Duplicates are skipped when places
 * are saved, so a nearby second fetch costs time (about a minute, free), not repeated entries.
 */
export const COVERED_RADIUS_KM = 6;

/** The box around a centre that counts as covered by it. Pure. */
export function coverageBox(centre: Coordinates, km: number = COVERED_RADIUS_KM) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((centre.lat * Math.PI) / 180));
  return { latMin: centre.lat - dLat, latMax: centre.lat + dLat, lngMin: centre.lng - dLng, lngMax: centre.lng + dLng };
}

/**
 * Garden centres are few and far between, so anything within this distance covers a centre: at the usual few kilometres a
 * region with none nearby would be searched again every night for nothing.
 */
const GARDEN_CENTRES_COVERED_KM = 20;

const LAYERS: { layer: OsmLayer; notePrefix: string; coveredKm?: number }[] = [
  { layer: "places", notePrefix: OSM_PLACES_NOTE_PREFIX },
  { layer: "food", notePrefix: OSM_FOOD_NOTE_PREFIX },
  { layer: "things", notePrefix: OSM_THINGS_NOTE_PREFIX },
  { layer: "gardencentres", notePrefix: OSM_GARDEN_CENTRES_NOTE_PREFIX, coveredKm: GARDEN_CENTRES_COVERED_KM },
];

/** The key under which the last look for garden centres in a region is remembered (see themes.ts: a key with "#" is never a place). */
export const GARDEN_CENTRES_KEY = "osm-gardencentres";
const GARDEN_CENTRES_RECHECK_DAYS = 90;
const GARDEN_CENTRES_RETRY_DAYS = 3;

async function gardenCentresDoneRecently(supabase: SupabaseClient, key: string, now: Date): Promise<boolean> {
  const { data } = await supabase.from("discovery_regions").select("last_attempt_at, last_success_at").eq("region_key", key).maybeSingle();
  if (!data) return false;
  const since = (iso: unknown) => (iso ? now.getTime() - new Date(iso as string).getTime() : Infinity);
  return since(data.last_success_at) < GARDEN_CENTRES_RECHECK_DAYS * 86_400_000 || since(data.last_attempt_at) < GARDEN_CENTRES_RETRY_DAYS * 86_400_000;
}

async function rememberGardenCentres(supabase: SupabaseClient, key: string, region: string, now: Date, success: boolean): Promise<void> {
  await supabase
    .from("discovery_regions")
    .upsert({ region_key: key, region_label: region, last_attempt_at: now.toISOString(), ...(success ? { last_success_at: now.toISOString() } : {}) }, { onConflict: "region_key" });
}

export type OsmRegionOutcome = {
  region: string;
  status: "added" | "already_covered" | "failed";
  inserted: number;
  error?: string;
};

type Deps = OpenStreetMapDeps & {
  geocode?: (query: string) => Promise<Coordinates | null>;
  now?: Date;
};

/** Whether any of these places is within the covered distance of the centre: a true distance, not the corner of a box. Pure. */
export function isCovered(places: { location_lat: number | null; location_lng: number | null }[], centre: Coordinates, km: number = COVERED_RADIUS_KM): boolean {
  return places.some((p) => p.location_lat != null && p.location_lng != null && haversineDistanceKm(centre.lat, centre.lng, Number(p.location_lat), Number(p.location_lng)) <= km);
}

async function alreadyCovered(supabase: SupabaseClient, centre: Coordinates, notePrefix: string, km: number = COVERED_RADIUS_KM): Promise<boolean> {
  const box = coverageBox(centre, km);
  const { data, error } = await supabase
    .from("activities")
    .select("location_lat, location_lng")
    .like("admin_notes", `${notePrefix}%`)
    .gte("location_lat", box.latMin)
    .lte("location_lat", box.latMax)
    .gte("location_lng", box.lngMin)
    .lte("location_lng", box.lngMax)
    .limit(500);
  if (error) throw new Error(`Couldn't check existing place coverage: ${error.message}`);
  return isCovered(data ?? [], centre, km);
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
    // Whether anything other than garden centres was fetched: a region with no garden centre near it is looked at again each
    // night, and that must not use up the few regions a night can fetch for.
    let fetchedMore = false;
    const errors: string[] = [];

    for (const { layer, notePrefix, coveredKm } of LAYERS) {
      if (await alreadyCovered(supabase, centre, notePrefix, coveredKm)) continue;
      // Garden centres: where there are none within reach, that is asked again every three months, not every night.
      const gardenKey = layer === "gardencentres" && region !== "this area" ? themedKey(normalizeRegionKey(region), GARDEN_CENTRES_KEY) : null;
      if (gardenKey && (await gardenCentresDoneRecently(supabase, gardenKey, deps.now ?? new Date()))) continue;
      fetchedAny = true;
      if (layer !== "gardencentres") fetchedMore = true;

      // Space this request from the previous one — Nominatim allows ~1/second.
      await (deps.sleep ?? sleep)(1100);
      const { results } = await persistDiscovery(supabase, [createOpenStreetMapSource(supabase, centre, region, deps, layer)]);
      const result = results[0];
      inserted += result.inserted;
      if (result.errors.length) errors.push(`${layer}: ${result.errors[0]}`);
      if (gardenKey) await rememberGardenCentres(supabase, gardenKey, region, deps.now ?? new Date(), result.errors.length === 0);
    }

    // Only garden centres were looked at: nothing to report, and no use of the night's few fetches (a failure there is only logged).
    if (!fetchedAny || (!fetchedMore && inserted === 0)) {
      if (errors.length > 0) console.warn(`garden centres for "${region}":`, errors.join("; "));
      return { region, status: "already_covered", inserted: 0 };
    }
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

// ---- wide-area layers: day trips and heritage ---------------------------------------------------------------------------

/** The key under which a region's day-trip fetch is remembered (see themes.ts: a key with "#" is never read as a place). */
export const DAY_TRIPS_KEY = "osm-daytrips";
/** The key under which a region's heritage fetch is remembered. */
export const HERITAGE_KEY = "osm-heritage";
/** A region whose last fetch failed is left alone this long before it is tried again. */
const FAILED_RETRY_DAYS = 3;

type LandmarkLayer = {
  /** What the fetch is called in a message. */
  label: string;
  key: string;
  notePrefix: string;
  /** If this many places of the layer are already within `nearbyKm` of a centre, it is covered, whatever it was called when it was fetched. */
  minNearby: number;
  nearbyKm: number;
  /** A region done longer ago than this is done again (what is already held is not added twice). Never, if absent. */
  recheckDays?: number;
  create: (supabase: SupabaseClient, centre: Coordinates, region: string, deps: Deps) => DiscoverySource;
};

const DAY_TRIPS_LAYER: LandmarkLayer = {
  label: "day trips",
  key: DAY_TRIPS_KEY,
  notePrefix: OSM_DAYTRIPS_NOTE_PREFIX,
  minNearby: 12,
  nearbyKm: 20,
  create: createDayTripSource,
};

const HERITAGE_LAYER: LandmarkLayer = {
  label: "heritage",
  key: HERITAGE_KEY,
  notePrefix: OSM_HERITAGE_NOTE_PREFIX,
  minNearby: 25,
  nearbyKm: 15,
  // New places are mapped all the time, and the search is better than it was: looked at again twice a year.
  recheckDays: 180,
  create: createHeritageSource,
};

async function nearbyRows(supabase: SupabaseClient, centre: Coordinates, layer: LandmarkLayer): Promise<number> {
  const box = coverageBox(centre, layer.nearbyKm);
  const { data, error } = await supabase
    .from("activities")
    .select("location_lat, location_lng")
    .like("admin_notes", `${layer.notePrefix}%`)
    .gte("location_lat", box.latMin)
    .lte("location_lat", box.latMax)
    .gte("location_lng", box.lngMin)
    .lte("location_lng", box.lngMax)
    .limit(500);
  if (error) throw new Error(`Couldn't check existing ${layer.label}: ${error.message}`);
  return (data ?? []).filter((p) => p.location_lat != null && p.location_lng != null && haversineDistanceKm(centre.lat, centre.lng, Number(p.location_lat), Number(p.location_lng)) <= layer.nearbyKm).length;
}

/**
 * Makes sure a region has a wide-area layer (day trips, or heritage: see sources/dayTrips.ts and sources/heritage.ts). They
 * hardly ever change, so once a region has been done it is not done again (or only after `recheckDays`); that is remembered in
 * the same table that remembers the paid searches, under a key of its own. A region that is the same city under another name is
 * recognised by the places already near it. Never throws: a failure is reported in the outcome.
 */
async function ensureLandmarkLayer(supabase: SupabaseClient, region: string, layer: LandmarkLayer, deps: Deps = {}): Promise<OsmRegionOutcome> {
  try {
    const key = themedKey(normalizeRegionKey(region), layer.key);
    const now = deps.now ?? new Date();
    const { data: marker, error: markerError } = await supabase.from("discovery_regions").select("last_attempt_at, last_success_at").eq("region_key", key).maybeSingle();
    if (markerError) throw new Error(`Couldn't read discovery_regions: ${markerError.message}`);
    const age = (iso: unknown) => (iso ? now.getTime() - new Date(iso as string).getTime() : Infinity);
    if (marker?.last_success_at && (layer.recheckDays === undefined || age(marker.last_success_at) < layer.recheckDays * 86_400_000)) {
      return { region, status: "already_covered", inserted: 0 };
    }
    if (age(marker?.last_attempt_at) < FAILED_RETRY_DAYS * 86_400_000) return { region, status: "already_covered", inserted: 0 };

    const remember = (success: boolean) =>
      supabase.from("discovery_regions").upsert(
        { region_key: key, region_label: region, last_attempt_at: now.toISOString(), ...(success ? { last_success_at: now.toISOString() } : {}) },
        { onConflict: "region_key" }
      );

    const centre = await (deps.geocode ?? geocodeLocation)(region);
    if (!centre) {
      // Tried and failed: left alone for a few days, rather than tried again first thing every night, ahead of every later region.
      await remember(false);
      return { region, status: "failed", inserted: 0, error: `Couldn't locate "${region}"` };
    }

    // The same city under another name: covered already. (Not for a layer that is looked at again, which is about finding more.)
    if (layer.recheckDays === undefined && (await nearbyRows(supabase, centre, layer)) >= layer.minNearby) {
      await remember(true);
      return { region, status: "already_covered", inserted: 0 };
    }

    await (deps.sleep ?? sleep)(1100);
    const { results } = await persistDiscovery(supabase, [layer.create(supabase, centre, region, deps)]);
    const result = results[0];
    await remember(result.errors.length === 0);
    if (result.errors.length) return { region, status: "failed", inserted: result.inserted, error: `${layer.label}: ${result.errors[0]}` };
    return { region, status: "added", inserted: result.inserted };
  } catch (err) {
    return { region, status: "failed", inserted: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Several regions, at most `maxFetches` of which actually search (each takes a couple of minutes). */
async function ensureLayerForRegions(
  supabase: SupabaseClient,
  regions: string[],
  layer: LandmarkLayer,
  options: { maxFetches?: number } & Deps = {}
): Promise<OsmRegionOutcome[]> {
  const maxFetches = options.maxFetches ?? 1;
  const outcomes: OsmRegionOutcome[] = [];
  let fetched = 0;
  for (const region of regions) {
    if (fetched >= maxFetches) break;
    // Each region is looked up on the map before anything is fetched: spaced, as the map service asks.
    if (outcomes.length > 0) await (options.sleep ?? sleep)(1100);
    const outcome = await ensureLandmarkLayer(supabase, region, layer, options);
    outcomes.push(outcome);
    if (outcome.status !== "already_covered") fetched += 1;
  }
  return outcomes;
}

export const ensureDayTrips = (supabase: SupabaseClient, region: string, deps: Deps = {}) => ensureLandmarkLayer(supabase, region, DAY_TRIPS_LAYER, deps);
export const ensureDayTripsForRegions = (supabase: SupabaseClient, regions: string[], options: { maxFetches?: number } & Deps = {}) => ensureLayerForRegions(supabase, regions, DAY_TRIPS_LAYER, options);
export const ensureHeritage = (supabase: SupabaseClient, region: string, deps: Deps = {}) => ensureLandmarkLayer(supabase, region, HERITAGE_LAYER, deps);
export const ensureHeritageForRegions = (supabase: SupabaseClient, regions: string[], options: { maxFetches?: number } & Deps = {}) => ensureLayerForRegions(supabase, regions, HERITAGE_LAYER, options);
