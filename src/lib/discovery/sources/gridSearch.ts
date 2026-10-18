import { sleep, type Coordinates } from "@/lib/geo/geocode";
import { defaultFetchJson, MIN_REQUEST_GAP_MS, NOMINATIM_SEARCH, type FetchJson, type NominatimPlace } from "@/lib/discovery/sources/openStreetMap";

/**
 * Searching a wide area on OpenStreetMap's search service, which returns at most 40 results a search however many places there
 * are. The area is cut into a grid and each box searched, then any box that came back full is cut into four and searched
 * again, within a fixed number of requests for each kind of place (so one kind cannot use up what the others need). Shared by
 * the day-trip and heritage searches.
 */

export type Box = { west: number; north: number; east: number; south: number };

export const FULL_SEARCH = 40;
const MAX_DEPTH = 2;

const viewbox = (b: Box) => [b.west, b.north, b.east, b.south].map((n) => n.toFixed(4)).join(",");

/** The square around a centre, cut into n by n boxes. Pure. */
export function gridBoxes(centre: Coordinates, radiusKm: number, n: number = 3): Box[] {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((centre.lat * Math.PI) / 180));
  const west = centre.lng - dLng;
  const north = centre.lat + dLat;
  const w = (2 * dLng) / n;
  const h = (2 * dLat) / n;
  const boxes: Box[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) boxes.push({ west: west + col * w, east: west + (col + 1) * w, north: north - row * h, south: north - (row + 1) * h });
  }
  return boxes;
}

/** A box cut into four. Pure. */
export function quarters(b: Box): Box[] {
  const midLng = (b.west + b.east) / 2;
  const midLat = (b.north + b.south) / 2;
  return [
    { west: b.west, north: b.north, east: midLng, south: midLat },
    { west: midLng, north: b.north, east: b.east, south: midLat },
    { west: b.west, north: midLat, east: midLng, south: b.south },
    { west: midLng, north: midLat, east: b.east, south: b.south },
  ];
}

export type GridSearch = { term: string; query: string; budget: number };

/** The most requests a set of searches can make. */
export const totalBudget = (searches: GridSearch[]) => searches.reduce((sum, s) => sum + s.budget, 0);

export async function runGridSearch(opts: {
  centre: Coordinates;
  radiusKm: number;
  searches: GridSearch[];
  gridSize?: number;
  fetchJson?: FetchJson;
  wait?: (ms: number) => Promise<void>;
}): Promise<{ results: { term: string; places: NominatimPlace[] }[]; requests: number; failures: number }> {
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const wait = opts.wait ?? sleep;
  let lastRequestAt = 0;
  let requests = 0;
  let failures = 0;
  // Requests made for the search in hand and the most it may make.
  let spent = 0;
  let allowed = 0;
  const grid = gridBoxes(opts.centre, opts.radiusKm, opts.gridSize);

  const searchBox = async (query: string, box: Box): Promise<NominatimPlace[]> => {
    const gap = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (gap > 0) await wait(gap);
    lastRequestAt = Date.now();
    requests += 1;
    spent += 1;
    const url = new URL(NOMINATIM_SEARCH);
    url.searchParams.set("q", query);
    url.searchParams.set("viewbox", viewbox(box));
    url.searchParams.set("bounded", "1");
    url.searchParams.set("countrycodes", "gb");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(FULL_SEARCH));
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

  /**
   * Every box of the grid first, so each part of the area is looked at; then the boxes that came back full are looked at
   * closer, in order, with whatever the search has left. (Going deep into the first box would leave the others, and in a
   * city the middle of the grid is where the famous places are, with nothing.)
   */
  const searchTerm = async (query: string): Promise<NominatimPlace[]> => {
    const places: NominatimPlace[] = [];
    const queue: { box: Box; depth: number }[] = [];
    for (const box of grid) {
      if (spent >= allowed) break;
      const found = await searchBox(query, box);
      places.push(...found);
      if (found.length >= FULL_SEARCH) queue.push({ box, depth: 0 });
    }
    while (queue.length > 0 && spent < allowed) {
      const { box, depth } = queue.shift()!;
      if (depth >= MAX_DEPTH) continue;
      for (const quarter of quarters(box)) {
        if (spent >= allowed) break;
        const found = await searchBox(query, quarter);
        places.push(...found);
        if (found.length >= FULL_SEARCH) queue.push({ box: quarter, depth: depth + 1 });
      }
    }
    return places;
  };

  const results: { term: string; places: NominatimPlace[] }[] = [];
  for (const { term, query, budget } of opts.searches) {
    spent = 0;
    allowed = budget;
    results.push({ term, places: await searchTerm(query) });
  }
  return { results, requests, failures };
}
