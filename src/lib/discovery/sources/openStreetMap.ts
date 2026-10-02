import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import { sleep, type Coordinates } from "@/lib/geo/geocode";

/**
 * Free base layer of real, standing places — leisure centres, pools, parks,
 * libraries, museums, community centres and so on — from OpenStreetMap, via
 * the Nominatim search service the app already uses for geocoding.
 *
 * Why it exists: the Claude web search is good at events and groups but is one
 * generic prompt, so what it returns is lopsided. A real Barnet search came
 * back with nothing at all in Move, Wellness, Connect or Explore — including
 * for a member whose goal was fitness. These places cost nothing, arrive with
 * exact coordinates (no geocoding pass), and fill those categories.
 *
 * They are venues, not scheduled events: no date, so they never expire.
 *
 * Nominatim is a relevance-ranked search, not a bulk export, so this asks for
 * a handful of specific place types, filters hard (it also returns bus stops
 * called "Leisure Centre" and school buildings called "Swimming Pool"), and
 * keeps only the best few of each type. Its policy allows ~1 request/second
 * with an identifying User-Agent.
 */

export const OSM_NOTE_PREFIX = "Place data from OpenStreetMap";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_GAP_MS = 1100;
const NEAR_RADIUS_KM = 8;
const FAR_RADIUS_KM = 20;
/** If the near box yields fewer than this many usable places for a type, widen. */
const SPARSE_THRESHOLD = 4;
const DUPLICATE_DISTANCE_KM = 0.4;

type PlaceType =
  | "sports_centre" | "swimming_pool" | "park" | "yoga"
  | "museum" | "castle" | "nature_reserve" | "garden"
  | "library" | "arts_centre" | "community_centre"
  | "theatre" | "cinema" | "playground";

type TypeConfig = {
  category: CategoryName;
  label: string;
  /** How many of this type to keep per region. */
  keep: number;
  tags: string[];
  /** Free to enter by default (still overridden by an explicit fee=yes). */
  freeByDefault?: boolean;
};

const TYPES: Record<PlaceType, TypeConfig> = {
  sports_centre: { category: "Move", label: "Sports and leisure centre", keep: 4, tags: ["fitness", "indoor"] },
  swimming_pool: { category: "Move", label: "Swimming pool", keep: 3, tags: ["swimming", "gentle exercise"] },
  park: { category: "Move", label: "Public park — good for a walk", keep: 4, tags: ["walking", "outdoors", "grandchildren"], freeByDefault: true },
  yoga: { category: "Wellness", label: "Yoga, pilates or tai chi studio", keep: 4, tags: ["yoga", "relaxation"] },
  museum: { category: "Explore", label: "Museum", keep: 4, tags: ["museum", "history"] },
  castle: { category: "Explore", label: "Historic castle", keep: 2, tags: ["history", "heritage"] },
  nature_reserve: { category: "Explore", label: "Nature reserve", keep: 3, tags: ["walking", "nature", "outdoors", "grandchildren"], freeByDefault: true },
  garden: { category: "Joy", label: "Public garden", keep: 2, tags: ["gardens", "outdoors", "grandchildren"] },
  library: { category: "Learn", label: "Public library", keep: 3, tags: ["books", "quiet", "indoor"], freeByDefault: true },
  arts_centre: { category: "Learn", label: "Arts centre", keep: 3, tags: ["arts", "classes"] },
  community_centre: { category: "Connect", label: "Community centre", keep: 4, tags: ["community", "social"] },
  theatre: { category: "Joy", label: "Theatre", keep: 3, tags: ["theatre"] },
  cinema: { category: "Joy", label: "Cinema", keep: 2, tags: ["cinema"] },
  playground: { category: "Joy", label: "Children's playground", keep: 2, tags: ["playground", "grandchildren"], freeByDefault: true },
};

/**
 * Nominatim `category=type` → our place type. Anything else is ignored (bus
 * stops, buildings, shops…). Deliberately absent: gyms (leisure centres cover
 * fitness) and saunas (in London listings those are often massage parlours).
 */
const OSM_KIND_TO_TYPE: Record<string, PlaceType> = {
  "leisure=sports_centre": "sports_centre",
  "leisure=swimming_pool": "swimming_pool",
  "leisure=park": "park",
  "leisure=nature_reserve": "nature_reserve",
  "leisure=garden": "garden",
  "leisure=playground": "playground",
  "tourism=museum": "museum",
  "historic=castle": "castle",
  "amenity=library": "library",
  "amenity=arts_centre": "arts_centre",
  "amenity=community_centre": "community_centre",
  "amenity=theatre": "theatre",
  "amenity=cinema": "cinema",
};

/** What to ask Nominatim for. The yoga term goes first so a studio is classed as one, not as a generic gym. */
const SEARCH_TERMS = [
  "yoga", "sports centre", "swimming pool", "park",
  "museum", "castle", "nature reserve", "garden",
  "library", "arts centre", "community centre",
  "theatre", "cinema", "playground",
];

export type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  category?: string;
  type?: string;
  name?: string;
  lat?: string;
  lon?: string;
  importance?: number;
  extratags?: Record<string, string>;
  address?: Record<string, string>;
};

export type ExistingPlace = { title: string; location_lat: number | null; location_lng: number | null };

export type FetchJson = (url: string) => Promise<unknown | null>;

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Nominatim viewbox is `left,top,right,bottom` = west,north,east,south. */
export function viewboxAround(centre: Coordinates, radiusKm: number): string {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((centre.lat * Math.PI) / 180));
  return [centre.lng - dLng, centre.lat + dLat, centre.lng + dLng, centre.lat - dLat].map((n) => n.toFixed(4)).join(",");
}

// Names that say what a place is but not which one — useless on a card.
const GENERIC_NAME = /^(the |a )?(main |kids |childrens |children's |learner |competition |training |outdoor |indoor |sports? |leisure |community |public )*(swimming pool|pool|sports? ?centre|leisure ?centre|community ?centre|park|garden|gym|library|theatre|cinema|playground|museum|hall)$/i;
// A community centre run for one age group isn't a place to send a retiree.
const NOT_FOR_RETIREES = /\b(youth|young|children|child|nursery|scout|guide|cadet|acf|atc|detachment|barracks|school|college|academy)\b/i;
const PRIVATE_CLUB_NAME = /\b(club|ground|grounds|memorial|rugby|cricket|football|fc|hockey|boxing|mma)\b/i;
const LEISURE_FACILITY_NAME = /(centre|center|leisure|lido|pool|swim|sport|athletic|tennis|squash|badminton|aquatic|baths|arena|complex|stadium)/i;
const NOT_RETIREE_SPORTS = new Set([
  "boxing", "kickboxing", "martial_arts", "mma", "judo", "karate", "taekwondo", "wrestling", "crossfit",
  "bodybuilding", "weightlifting", "american_football", "rugby_union", "rugby_league", "rugby", "cricket",
  "soccer", "football", "field_hockey", "hockey", "basketball", "netball",
]);
const YOGA_LIKE = /\b(yoga|pilates|tai ?chi|qi ?gong)\b/i;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|and)\b/g, " ").replace(/\s+/g, " ").trim();
}

function sportIsYoga(extratags: Record<string, string> | undefined): boolean {
  return YOGA_LIKE.test((extratags?.sport ?? "").replace(/_/g, " "));
}

/** Decides what, if anything, a Nominatim result is for our purposes. */
export function classifyPlace(place: NominatimPlace, term: string): PlaceType | null {
  const name = place.name?.trim();
  if (!name || place.lat == null || place.lon == null) return null;
  if (GENERIC_NAME.test(name)) return null;

  const access = place.extratags?.access;
  if (access === "private" || access === "no" || access === "customers" || access === "permit") return null;

  let type = OSM_KIND_TO_TYPE[`${place.category}=${place.type}`];
  // A fitness centre or sports hall that is a yoga/pilates/tai chi studio is wellness, not a gym.
  if (term === "yoga") {
    const looksYoga = YOGA_LIKE.test(name) || sportIsYoga(place.extratags);
    const kind = `${place.category}=${place.type}`;
    const yogaKind = kind === "leisure=fitness_centre" || kind === "leisure=sports_centre" || kind === "healthcare=alternative";
    return looksYoga && yogaKind ? "yoga" : null;
  }
  if (!type) return null;

  if ((type === "community_centre" || type === "sports_centre" || type === "swimming_pool") && NOT_FOR_RETIREES.test(name)) return null;
  // "Sports centre" in OSM also covers members' clubs, club grounds and combat
  // gyms. Keep only what reads as a public leisure facility.
  if (type === "sports_centre" || type === "swimming_pool") {
    const e = place.extratags ?? {};
    if (e.club || PRIVATE_CLUB_NAME.test(name)) return null;
    const sports = (e.sport ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    if (sports.length > 0 && sports.every((s) => NOT_RETIREE_SPORTS.has(s))) return null;
    if (!LEISURE_FACILITY_NAME.test(name) && !e.opening_hours && !e.fee) return null;
  }
  // Plenty of OSM gardens are private or communal courtyards, and many "castles"
  // are private houses; only keep ones with some public footprint.
  if (type === "garden" || type === "castle") {
    const e = place.extratags ?? {};
    // Not wikidata: that says a place is notable, not that anyone can walk in.
    if (!(e.website || e["contact:website"] || e.opening_hours || e.fee)) return null;
  }
  if (type === "sports_centre" && YOGA_LIKE.test(name)) type = "yoga";
  return type;
}

function websiteOf(place: NominatimPlace): string | null {
  const raw = place.extratags?.website ?? place.extratags?.["contact:website"];
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

function osmUrl(place: NominatimPlace): string {
  return `https://www.openstreetmap.org/${place.osm_type ?? "node"}/${place.osm_id}`;
}

function qualityScore(place: NominatimPlace, distanceKm: number): number {
  const e = place.extratags ?? {};
  const quality =
    (e.wikidata ? 2 : 0) + (e.wikipedia ? 1 : 0) + (websiteOf(place) ? 1.5 : 0) + (e.opening_hours ? 1 : 0) + (place.importance ?? 0) * 4;
  return quality - distanceKm * 0.25;
}

function describe(type: PlaceType, place: NominatimPlace, area: string): string {
  const cfg = TYPES[type];
  const hours = place.extratags?.opening_hours;
  const parts = [`${cfg.label}${area ? ` in ${area}` : ""}.`];
  if (hours && hours.length <= 120) parts.push(`Opening hours: ${hours}.`);
  parts.push("A place to visit rather than a scheduled event — check opening times and any charges before you go.");
  return parts.join(" ");
}

function areaOf(place: NominatimPlace, fallback: string): string {
  const a = place.address ?? {};
  return a.suburb || a.neighbourhood || a.town || a.city || a.village || a.city_district || fallback;
}

function addressOf(place: NominatimPlace, fallback: string): string {
  const a = place.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const parts = [street, a.suburb || a.town || a.city || a.village, a.postcode].filter(Boolean);
  return parts.length ? parts.join(", ") : fallback;
}

/** True when an equivalent place is already in the database (e.g. Claude's search found the same museum). */
export function isDuplicate(name: string, coords: Coordinates, existing: ExistingPlace[]): boolean {
  const mine = normalizeName(name);
  if (!mine) return false;
  return existing.some((e) => {
    const theirs = normalizeName(e.title);
    if (!theirs) return false;
    const sameName = theirs === mine || (Math.min(theirs.length, mine.length) >= 8 && (theirs.includes(mine) || mine.includes(theirs)));
    if (!sameName) return false;
    if (e.location_lat == null || e.location_lng == null) return theirs === mine;
    return haversineKm(coords, { lat: e.location_lat, lng: e.location_lng }) <= DUPLICATE_DISTANCE_KM;
  });
}

/**
 * Pure selection step: classify, filter, de-duplicate and keep the best few of
 * each type. Takes the raw search results so it can be tested against saved
 * real responses without touching the network.
 */
export function selectPlaces(
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
      if (!type) continue;
      const coords = { lat: parseFloat(place.lat!), lng: parseFloat(place.lon!) };
      if (Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) continue;
      const distance = haversineKm(centre, coords);
      if (distance > radiusKm) continue;
      if (isDuplicate(place.name!, coords, existing)) continue;
      seen.add(key);
      all.push({ place, type, coords, score: qualityScore(place, distance) });
    }
  }

  // Best first, so when one venue turns up twice (a leisure centre and its own
  // pool, say) the better-described entry is the one that survives.
  all.sort((a, b) => b.score - a.score);
  const accepted: ExistingPlace[] = [];
  const keptCount = new Map<PlaceType, number>();
  const kept: Scored[] = [];
  for (const item of all) {
    const count = keptCount.get(item.type) ?? 0;
    if (count >= TYPES[item.type].keep) continue;
    if (isDuplicate(item.place.name!, item.coords, accepted)) continue;
    accepted.push({ title: item.place.name!, location_lat: item.coords.lat, location_lng: item.coords.lng });
    keptCount.set(item.type, count + 1);
    kept.push(item);
  }

  // Several branches of one chain often share a single website; using it as the
  // booking link for all of them would make them look identical, so a website
  // is only used when it is unique within this batch.
  const websiteCounts = new Map<string, number>();
  for (const { place } of kept) {
    const site = websiteOf(place);
    if (site) websiteCounts.set(site, (websiteCounts.get(site) ?? 0) + 1);
  }

  return kept.map(({ place, type, coords }): RawActivityCandidate => {
    const cfg = TYPES[type];
    const site = websiteOf(place);
    const useSite = site && websiteCounts.get(site) === 1;
    const fee = place.extratags?.fee;
    const free = fee === "no" || (cfg.freeByDefault && fee !== "yes");
    const tags = [...cfg.tags];
    if (place.extratags?.wheelchair === "yes") tags.push("wheelchair-accessible");
    const area = areaOf(place, regionLabel);
    return {
      title: place.name!.trim(),
      description: describe(type, place, area),
      category: cfg.category,
      address: addressOf(place, regionLabel),
      locationLat: coords.lat,
      locationLng: coords.lng,
      dateTime: null,
      priceEstimate: free ? 0 : null,
      bookingUrl: useSite ? site : osmUrl(place),
      bookingUrlVerified: true,
      tags,
      status: "active",
      adminNotes: `${OSM_NOTE_PREFIX} (© OpenStreetMap contributors, ODbL) — a venue listing, not a scheduled event.`,
    };
  });
}

const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "YourNextChapter/1.0 (retirement concierge app)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  return res.json();
};

async function loadExisting(supabase: SupabaseClient, centre: Coordinates): Promise<ExistingPlace[]> {
  const dLat = FAR_RADIUS_KM / 111 + 0.05;
  const dLng = FAR_RADIUS_KM / (111 * Math.cos((centre.lat * Math.PI) / 180)) + 0.05;
  const box =
    `and(location_lat.gte.${centre.lat - dLat},location_lat.lte.${centre.lat + dLat},` +
    `location_lng.gte.${centre.lng - dLng},location_lng.lte.${centre.lng + dLng})`;
  const { data, error } = await supabase
    .from("activities")
    .select("title, location_lat, location_lng")
    .or(`location_lat.is.null,${box}`)
    .limit(1000);
  // Without this a failed read would look like "nothing exists yet" and insert duplicates.
  if (error) throw new Error(`Couldn't check existing activities: ${error.message}`);
  return (data ?? []) as ExistingPlace[];
}

export type OpenStreetMapDeps = {
  fetchJson?: FetchJson;
  sleep?: (ms: number) => Promise<void>;
};

export function createOpenStreetMapSource(
  supabase: SupabaseClient,
  centre: Coordinates,
  regionLabel: string,
  deps: OpenStreetMapDeps = {}
): DiscoverySource {
  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const wait = deps.sleep ?? sleep;

  return {
    name: "openstreetmap",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      let lastRequestAt = 0;
      let requests = 0;
      let failures = 0;

      const search = async (term: string, radiusKm: number): Promise<NominatimPlace[]> => {
        const gap = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
        if (gap > 0) await wait(gap);
        lastRequestAt = Date.now();
        requests += 1;
        const url = new URL(NOMINATIM_SEARCH);
        url.searchParams.set("q", term);
        url.searchParams.set("viewbox", viewboxAround(centre, radiusKm));
        url.searchParams.set("bounded", "1");
        url.searchParams.set("countrycodes", "gb");
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("limit", "40");
        url.searchParams.set("extratags", "1");
        url.searchParams.set("addressdetails", "1");
        try {
          const body = await fetchJson(url.toString());
          if (!Array.isArray(body)) {
            failures += 1;
            return [];
          }
          return body as NominatimPlace[];
        } catch {
          failures += 1;
          return [];
        }
      };

      const existing = await loadExisting(supabase, centre);
      const results: { term: string; places: NominatimPlace[] }[] = [];

      for (const term of SEARCH_TERMS) {
        let places = await search(term, NEAR_RADIUS_KM);
        const usable = places.filter((p) => classifyPlace(p, term) !== null).length;
        // A tight box finds the nearest places in a city, but would find nothing
        // in a village — so widen only when it came back thin.
        if (usable < SPARSE_THRESHOLD) places = [...places, ...(await search(term, FAR_RADIUS_KM))];
        results.push({ term, places });
      }

      // Individual misses are fine (a type may simply not exist nearby), but if
      // the service is down we must say so rather than report "found nothing".
      if (requests > 0 && failures === requests) {
        throw new Error(`OpenStreetMap place search failed for "${regionLabel}" (all ${requests} requests failed)`);
      }
      return selectPlaces(results, centre, FAR_RADIUS_KM, existing, regionLabel);
    },
  };
}
