import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import type { Coordinates } from "@/lib/geo/geocode";
import { dogFactsFromOsm } from "@/lib/discovery/dogTags";
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
import { runGridSearch, totalBudget, type GridSearch } from "@/lib/discovery/sources/gridSearch";

/**
 * Heritage, museums, historic houses, gardens, galleries and local cultural venues across a whole county and over its borders, from
 * OpenStreetMap: National Trust and English Heritage properties, local authority and volunteer-run museums, castles, manors,
 * archaeological sites, zoos and farms, theatres and arts centres. The places layers keep only the best few of each kind within
 * a few miles, which leaves out most of a county's heritage; the day-trip layer keeps only the nationally famous. This one keeps
 * what a visitor could actually go to, over the furthest a member can travel.
 *
 * Nothing here names a place. What counts is what the map says: it is a visitor attraction, museum, house, garden, gallery or
 * theatre, and it says something a visitor could use (a website, opening hours or a charge). Properties run by the National Trust
 * or English Heritage are found by their operator and tagged, so they can be asked for by name.
 */

/** Notes of heritage rows start with this, so they can be told apart from the other layers. */
export const OSM_HERITAGE_NOTE_PREFIX = `${OSM_NOTE_PREFIX} (heritage`;
/** The furthest a member can say they will travel is 40 km (25 miles): that is as far as is looked. */
export const HERITAGE_RADIUS_KM = 40;

const SEARCHES: GridSearch[] = [
  { term: "museum", query: "[tourism=museum]", budget: 20 },
  { term: "art gallery", query: "[tourism=gallery]", budget: 12 },
  { term: "attraction", query: "[tourism=attraction]", budget: 20 },
  { term: "castle", query: "[historic=castle]", budget: 8 },
  { term: "manor", query: "[historic=manor]", budget: 8 },
  { term: "garden", query: "[leisure=garden]", budget: 10 },
  { term: "zoo", query: "[tourism=zoo]", budget: 5 },
  { term: "archaeological site", query: "[historic=archaeological_site]", budget: 8 },
  { term: "theatre", query: "[amenity=theatre]", budget: 8 },
  { term: "arts centre", query: "[amenity=arts_centre]", budget: 8 },
  // Found by who runs them: the map says so on the property, and nothing else finds them all.
  { term: "National Trust", query: "National Trust", budget: 10 },
  { term: "English Heritage", query: "English Heritage", budget: 8 },
];
/** Every request is spaced a second apart: this bounds the run to about two and a half minutes. */
export const MAX_HERITAGE_REQUESTS = totalBudget(SEARCHES);

/** How many of each kind are kept for a region. */
const KEEP: Partial<Record<PlaceType, number>> = {
  museum: 30,
  art_gallery: 14,
  attraction: 25,
  heritage_house: 15,
  castle: 10,
  garden: 14,
  zoo: 6,
  heritage_site: 10,
  theatre: 10,
  arts_centre: 10,
};

/** Parts of a property, not somewhere to go: its car park, its toilets, its visitor centre or café, its ticket office. */
const NOT_A_PLACE_TO_GO = /\b(car park|parking|toilets?|visitor centre|visitor center|information point|cafe|café|tea ?rooms?|restaurant|shop|ticket office|entrance|coach park)\b/i;

export type Operator = "national-trust" | "english-heritage" | null;

/** Pure: whether the National Trust or English Heritage runs it, from what the map says about who does. */
export function operatorOf(place: NominatimPlace): Operator {
  const e = place.extratags ?? {};
  const who = `${e.operator ?? ""} ${e.owner ?? ""} ${e.brand ?? ""}`;
  if (/national trust/i.test(who)) return "national-trust";
  if (/english heritage/i.test(who)) return "english-heritage";
  return null;
}

/** Pure: how much a place is worth keeping, among places of the same kind: who runs it, how well described, how known, how near. */
export function scoreOf(place: NominatimPlace, distanceKm: number): number {
  const e = place.extratags ?? {};
  return (
    (operatorOf(place) ? 3 : 0) + (e.wikidata ? 2 : 0) + (e.wikipedia ? 1 : 0) + (websiteOf(place) ? 1.5 : 0) + (e.opening_hours ? 1 : 0) + (place.importance ?? 0) * 4 - distanceKm * 0.05
  );
}

/**
 * Pure: from the raw results, the places a visitor could go to, once each, the best few of each kind, leaving out anything
 * already in the catalogue.
 */
export function selectHeritage(
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
      let type = classifyPlace(place, term);
      // An estate or parkland the National Trust or English Heritage runs (mapped as a park) is a place to visit, not a local park.
      if ((type === "park" || type === "nature_reserve") && operatorOf(place)) type = "attraction";
      if (!type || KEEP[type] === undefined) continue;
      const name = place.name ?? "";
      if (NOT_AN_ATTRACTION.test(name) || NOT_A_PLACE_TO_GO.test(name)) continue;
      // Something a visitor can use: a website, opening hours or a charge. (Or being run by one of the big two, which always has.)
      const e = place.extratags ?? {};
      if (!(websiteOf(place) || e.opening_hours || e.fee || operatorOf(place))) continue;
      const coords = { lat: parseFloat(place.lat!), lng: parseFloat(place.lon!) };
      if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) continue;
      const distance = haversineKm(centre, coords);
      if (distance > radiusKm) continue;
      if (isDuplicate(name, coords, existing)) continue;
      seen.add(key);
      all.push({ place, type, coords, score: scoreOf(place, distance) });
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
    const operator = operatorOf(place);
    const tags = [...cfg.tags];
    if (operator) tags.push(operator);
    if (operator && !tags.includes("heritage")) tags.push("heritage");
    if (place.extratags?.wheelchair === "yes") tags.push("wheelchair-accessible");
    const area = areaOf(place, regionLabel);
    const runBy = operator === "national-trust" ? " Run by the National Trust." : operator === "english-heritage" ? " Run by English Heritage." : "";
    return {
      title: place.name!.trim(),
      description: `${describe(type, place, area)}${runBy}`,
      category: cfg.category,
      address: addressOf(place, regionLabel),
      locationLat: coords.lat,
      locationLng: coords.lng,
      dateTime: null,
      priceEstimate: free ? 0 : null,
      openingHours: openingHoursOf(place),
      durationMinutes: cfg.minutes,
      bookingUrl: websiteOf(place) ?? osmUrl(place),
      dog: dogFactsFromOsm(place.extratags, osmUrl(place)),
      bookingUrlVerified: true,
      tags,
      status: "active",
      adminNotes: `${OSM_HERITAGE_NOTE_PREFIX}; © OpenStreetMap contributors, ODbL) — a place to visit, not a scheduled event.`,
    };
  });
}

/** The source for one area: searches the grid (cutting any full box into four), then selects. */
export function createHeritageSource(supabase: SupabaseClient, centre: Coordinates, regionLabel: string, deps: OpenStreetMapDeps & { fetchJson?: FetchJson } = {}): DiscoverySource {
  return {
    name: "openstreetmap-heritage",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const existing = await loadExisting(supabase, centre, HERITAGE_RADIUS_KM);
      const { results, requests, failures } = await runGridSearch({ centre, radiusKm: HERITAGE_RADIUS_KM, searches: SEARCHES, fetchJson: deps.fetchJson, wait: deps.sleep });
      if (requests > 0 && failures === requests) throw new Error(`OpenStreetMap heritage search failed for "${regionLabel}" (all ${requests} requests failed)`);
      return selectHeritage(results, centre, HERITAGE_RADIUS_KM, existing, regionLabel);
    },
  };
}
