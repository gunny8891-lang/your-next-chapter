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

export type OsmRegionOutcome = {
  region: string;
  status: "added" | "already_covered" | "failed";
  inserted: number;
  error?: string;
};

type Deps = OpenStreetMapDeps & {
  geocode?: (query: string) => Promise<Coordinates | null>;
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
      fetchedAny = true;
      if (layer !== "gardencentres") fetchedMore = true;

      // Space this request from the previous one — Nominatim allows ~1/second.
      await (deps.sleep ?? sleep)(1100);
      const { results } = await persistDiscovery(supabase, [createOpenStreetMapSource(supabase, centre, region, deps, layer)]);
      const result = results[0];
      inserted += result.inserted;
      if (result.errors.length) errors.push(`${layer}: ${result.errors[0]}`);
    }

    if (!fetchedAny || (!fetchedMore && inserted === 0 && errors.length === 0)) return { region, status: "already_covered", inserted: 0 };
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

// ---- day trips -------------------------------------------------------------

/** The key under which a region's day-trip fetch is remembered (see themes.ts: a key with "#" is never read as a place). */
export const DAY_TRIPS_KEY = "osm-daytrips";
/** A region whose last day-trip fetch failed is left alone this long before it is tried again. */
const FAILED_RETRY_DAYS = 3;
/** If this many day-trip places are already within reach of a centre, it is covered, whatever it was called when it was fetched. */
const COVERED_BY_NEARBY_ROWS = 12;
const NEARBY_KM = 20;

async function nearbyDayTripRows(supabase: SupabaseClient, centre: Coordinates): Promise<number> {
  const box = coverageBox(centre, NEARBY_KM);
  const { data, error } = await supabase
    .from("activities")
    .select("location_lat, location_lng")
    .like("admin_notes", `${OSM_DAYTRIPS_NOTE_PREFIX}%`)
    .gte("location_lat", box.latMin)
    .lte("location_lat", box.latMax)
    .gte("location_lng", box.lngMin)
    .lte("location_lng", box.lngMax)
    .limit(200);
  if (error) throw new Error(`Couldn't check existing day trips: ${error.message}`);
  return (data ?? []).filter((p) => p.location_lat != null && p.location_lng != null && haversineDistanceKm(centre.lat, centre.lng, Number(p.location_lat), Number(p.location_lng)) <= NEARBY_KM).length;
}

/**
 * Makes sure a region has its well-known places for a day out (see sources/dayTrips.ts). They hardly ever change, so once a
 * region has been done it is not done again; that is remembered in the same table that remembers the paid searches, under a
 * key of its own. A region that is the same city under another name is recognised by the places already near it.
 * Never throws: a failure is reported in the outcome.
 */
export async function ensureDayTrips(supabase: SupabaseClient, region: string, deps: Deps & { now?: Date } = {}): Promise<OsmRegionOutcome> {
  try {
    const key = themedKey(normalizeRegionKey(region), DAY_TRIPS_KEY);
    const now = deps.now ?? new Date();
    const { data: marker, error: markerError } = await supabase.from("discovery_regions").select("last_attempt_at, last_success_at").eq("region_key", key).maybeSingle();
    if (markerError) throw new Error(`Couldn't read discovery_regions: ${markerError.message}`);
    if (marker?.last_success_at) return { region, status: "already_covered", inserted: 0 };
    if (marker?.last_attempt_at && now.getTime() - new Date(marker.last_attempt_at as string).getTime() < FAILED_RETRY_DAYS * 86_400_000) {
      return { region, status: "already_covered", inserted: 0 };
    }

    const centre = await (deps.geocode ?? geocodeLocation)(region);
    if (!centre) return { region, status: "failed", inserted: 0, error: `Couldn't locate "${region}"` };

    const remember = (success: boolean) =>
      supabase.from("discovery_regions").upsert(
        { region_key: key, region_label: region, last_attempt_at: now.toISOString(), ...(success ? { last_success_at: now.toISOString() } : {}) },
        { onConflict: "region_key" }
      );

    if ((await nearbyDayTripRows(supabase, centre)) >= COVERED_BY_NEARBY_ROWS) {
      await remember(true);
      return { region, status: "already_covered", inserted: 0 };
    }

    await (deps.sleep ?? sleep)(1100);
    const { results } = await persistDiscovery(supabase, [createDayTripSource(supabase, centre, region, deps)]);
    const result = results[0];
    await remember(result.errors.length === 0);
    if (result.errors.length) return { region, status: "failed", inserted: result.inserted, error: `day trips: ${result.errors[0]}` };
    return { region, status: "added", inserted: result.inserted };
  } catch (err) {
    return { region, status: "failed", inserted: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Day trips for several regions, at most `maxFetches` of which actually search (each takes a couple of minutes). */
export async function ensureDayTripsForRegions(
  supabase: SupabaseClient,
  regions: string[],
  options: { maxFetches?: number } & Deps & { now?: Date } = {}
): Promise<OsmRegionOutcome[]> {
  const maxFetches = options.maxFetches ?? 1;
  const outcomes: OsmRegionOutcome[] = [];
  let fetched = 0;
  for (const region of regions) {
    if (fetched >= maxFetches) break;
    const outcome = await ensureDayTrips(supabase, region, options);
    outcomes.push(outcome);
    if (outcome.status !== "already_covered") fetched += 1;
  }
  return outcomes;
}
