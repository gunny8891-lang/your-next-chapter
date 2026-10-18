import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import type { Coordinates } from "@/lib/geo/geocode";
import { dogFactsFromOsm } from "@/lib/discovery/dogTags";
import { DAY_TRIP_TAG } from "@/lib/opportunities/engine";
import {
  addressOf,
  areaOf,
  classifyPlace,
  describe,
  haversineKm,
  isDuplicate,
  loadExisting,
  NOT_AN_ATTRACTION,
  openingHoursOf,
  osmUrl,
  OSM_NOTE_PREFIX,
  TYPES,
  websiteOf,
  type ExistingPlace,
  type FetchJson,
  type NominatimPlace,
  type OpenStreetMapDeps,
  type PlaceType,
} from "@/lib/discovery/sources/openStreetMap";
import { gridBoxes, quarters, runGridSearch, totalBudget, type GridSearch } from "@/lib/discovery/sources/gridSearch";

/**
 * Well-known places worth a day out, from OpenStreetMap: the big museums, galleries, castles, historic houses, gardens and
 * visitor attractions that a nearby-places search never reaches because they are not near anyone's front door, but that
 * someone in a London borough, or any town with a city a train ride away, would happily go to for the day.
 *
 * Nothing here names a place. "Well known" is what the map itself says: an entry that has a Wikipedia or Wikidata page and
 * a high search importance, and that says something a visitor can use (a website, opening hours or a charge). The same
 * rule finds the British Museum for Barnet, Chatsworth for Sheffield and Bletchley Park for Milton Keynes.
 *
 * Nominatim returns at most 40 results a search and a city has hundreds of museums, so a box that comes back full is cut
 * into four and searched again, down to a limit, within a fixed number of requests (about two minutes at its pace).
 */

/** Notes of day-trip rows start with this, so they can be told apart from the nearby-places layers. */
export const OSM_DAYTRIPS_NOTE_PREFIX = `${OSM_NOTE_PREFIX} (day trips`;
export { DAY_TRIP_TAG };
/** How far from a member's area to look. */
export const DAY_TRIP_SOURCE_RADIUS_KM = 45;

/** Nominatim's importance for a famous place; the British Museum and the V&A are above 0.6, a local museum about 0.3. */
const MIN_IMPORTANCE = 0.4;
/** Nothing that is not itself somewhere to go: a street, a bank's head office, a depot, a racecourse. */
const NOT_A_DESTINATION = /\b(street|road|depot|racecourse|bank of england)\b|^(the )?guildhall$/i;
const MIN_VISIT_MINUTES = 120;

/** What each search may spend: the nine boxes of the grid, and more for the kinds a city has hundreds of. */
const SEARCHES: GridSearch[] = [
  { term: "museum", query: "[tourism=museum]", budget: 24 },
  { term: "art gallery", query: "[tourism=gallery]", budget: 20 },
  { term: "attraction", query: "[tourism=attraction]", budget: 24 },
  { term: "castle", query: "[historic=castle]", budget: 10 },
  { term: "manor", query: "[historic=manor]", budget: 9 },
  { term: "garden", query: "[leisure=garden]", budget: 10 },
  { term: "zoo", query: "[tourism=zoo]", budget: 9 },
];
/** Every request is spaced a second apart, so this bounds the run to about two minutes. */
export const MAX_DAY_TRIP_REQUESTS = totalBudget(SEARCHES);

/** How many of each kind are kept for a region. */
const KEEP: Partial<Record<PlaceType, number>> = { museum: 12, art_gallery: 6, attraction: 12, heritage_house: 8, castle: 4, garden: 5, zoo: 3 };

export { gridBoxes, quarters };

/** Whether the map itself treats a place as well known: a Wikipedia or Wikidata page, and a high importance. Pure. */
export function isWellKnown(place: NominatimPlace): boolean {
  const e = place.extratags ?? {};
  return (place.importance ?? 0) >= MIN_IMPORTANCE && Boolean(e.wikidata || e.wikipedia);
}

/**
 * Pure: from the raw results, the well-known places that are open to visitors, once each, best known first, a few of each
 * kind, leaving out anything already in the catalogue.
 */
export function selectLandmarks(
  results: { term: string; places: NominatimPlace[] }[],
  centre: Coordinates,
  radiusKm: number,
  existing: ExistingPlace[],
  regionLabel: string
): RawActivityCandidate[] {
  type Scored = { place: NominatimPlace; type: PlaceType; coords: Coordinates; score: number };
  const seen = new Set<string>();
  const all: Scored[] = [];
  for (const { term, places } of results) {
    for (const place of places) {
      const key = `${place.osm_type}/${place.osm_id}`;
      if (seen.has(key)) continue;
      const type = classifyPlace(place, term);
      if (!type || KEEP[type] === undefined) continue;
      if (!isWellKnown(place) || NOT_AN_ATTRACTION.test(place.name ?? "") || NOT_A_DESTINATION.test(place.name ?? "")) continue;
      // Something a visitor can use: a website, opening hours or a charge. Being on Wikipedia says it is notable, not that it is open.
      const e = place.extratags ?? {};
      if (!(websiteOf(place) || e.opening_hours || e.fee)) continue;
      const coords = { lat: parseFloat(place.lat!), lng: parseFloat(place.lon!) };
      if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) continue;
      const distance = haversineKm(centre, coords);
      if (distance > radiusKm) continue;
      if (isDuplicate(place.name!, coords, existing)) continue;
      seen.add(key);
      all.push({ place, type, coords, score: (place.importance ?? 0) * 10 + (e.opening_hours ? 0.5 : 0) - distance * 0.02 });
    }
  }

  all.sort((a, b) => b.score - a.score);
  const accepted: ExistingPlace[] = [];
  const kept = new Map<PlaceType, number>();
  const chosen: Scored[] = [];
  for (const item of all) {
    const count = kept.get(item.type) ?? 0;
    if (count >= (KEEP[item.type] ?? 0)) continue;
    if (isDuplicate(item.place.name!, item.coords, accepted)) continue;
    accepted.push({ title: item.place.name!, location_lat: item.coords.lat, location_lng: item.coords.lng });
    kept.set(item.type, count + 1);
    chosen.push(item);
  }

  return chosen.map(({ place, type, coords }): RawActivityCandidate => {
    const cfg = TYPES[type];
    const fee = place.extratags?.fee;
    const free = fee === "no" || (cfg.freeByDefault === true && fee !== "yes");
    const tags = [...cfg.tags, DAY_TRIP_TAG];
    if (place.extratags?.wheelchair === "yes") tags.push("wheelchair-accessible");
    const area = areaOf(place, regionLabel);
    return {
      title: place.name!.trim(),
      description: `${describe(type, place, area)} Well known, and worth a day out.`,
      category: cfg.category,
      address: addressOf(place, regionLabel),
      locationLat: coords.lat,
      locationLng: coords.lng,
      dateTime: null,
      priceEstimate: free ? 0 : null,
      openingHours: openingHoursOf(place),
      durationMinutes: Math.max(cfg.minutes, MIN_VISIT_MINUTES),
      bookingUrl: websiteOf(place) ?? osmUrl(place),
      dog: dogFactsFromOsm(place.extratags, osmUrl(place)),
      bookingUrlVerified: true,
      tags,
      status: "active",
      adminNotes: `${OSM_DAYTRIPS_NOTE_PREFIX}; © OpenStreetMap contributors, ODbL) — a well-known place for a day out, not a scheduled event.`,
    };
  });
}

/** The source for one area: searches the grid (cutting any full box into four), then selects. */
export function createDayTripSource(supabase: SupabaseClient, centre: Coordinates, regionLabel: string, deps: OpenStreetMapDeps & { fetchJson?: FetchJson } = {}): DiscoverySource {
  return {
    name: "openstreetmap-daytrips",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const existing = await loadExisting(supabase, centre, DAY_TRIP_SOURCE_RADIUS_KM);
      const { results, requests, failures } = await runGridSearch({ centre, radiusKm: DAY_TRIP_SOURCE_RADIUS_KM, searches: SEARCHES, fetchJson: deps.fetchJson, wait: deps.sleep });
      if (requests > 0 && failures === requests) {
        throw new Error(`OpenStreetMap day-trip search failed for "${regionLabel}" (all ${requests} requests failed)`);
      }
      return selectLandmarks(results, centre, DAY_TRIP_SOURCE_RADIUS_KM, existing, regionLabel);
    },
  };
}
