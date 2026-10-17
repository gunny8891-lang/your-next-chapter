import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDayTripSource,
  DAY_TRIP_SOURCE_RADIUS_KM,
  gridBoxes,
  isWellKnown,
  MAX_DAY_TRIP_REQUESTS,
  OSM_DAYTRIPS_NOTE_PREFIX,
  quarters,
  selectLandmarks,
} from "@/lib/discovery/sources/dayTrips";
import type { NominatimPlace } from "@/lib/discovery/sources/openStreetMap";

vi.mock("@/lib/discovery/run", () => ({ persistDiscovery: vi.fn(), geocodePending: vi.fn() }));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const BARNET = { lat: 51.653, lng: -0.2 };
let n = 0;
const place = (over: Partial<NominatimPlace> & { name: string }, extra: Record<string, string> = {}, at = { lat: 51.5194, lng: -0.127 }): NominatimPlace => ({
  osm_type: "node",
  osm_id: ++n,
  category: "tourism",
  type: "museum",
  lat: String(at.lat),
  lon: String(at.lng),
  importance: 0.6,
  extratags: { wikidata: "Q1", website: "https://example.org", ...extra },
  address: { road: "Great Russell Street", suburb: "Bloomsbury", postcode: "WC1B 3DG" },
  ...over,
});

const select = (places: NominatimPlace[], term = "museum", existing: { title: string; location_lat: number | null; location_lng: number | null }[] = []) =>
  selectLandmarks([{ term, places }], BARNET, DAY_TRIP_SOURCE_RADIUS_KM, existing, "Barnet");

describe("what counts as well known", () => {
  it("is something the map itself calls notable: a page of its own and a high importance", () => {
    expect(isWellKnown(place({ name: "British Museum" }))).toBe(true);
    expect(isWellKnown(place({ name: "Barnet Museum", importance: 0.35 }))).toBe(false);
    expect(isWellKnown(place({ name: "Village Museum", extratags: { website: "https://x.org" } }))).toBe(false);
    expect(isWellKnown(place({ name: "Wikipedia only", extratags: { wikipedia: "en:Thing", website: "https://x.org" } }))).toBe(true);
  });
});

describe("choosing the day trips", () => {
  it("keeps the famous places, tagged as day trips, with what a visitor needs", () => {
    const [bm] = select([place({ name: "British Museum" }, { fee: "no", opening_hours: "Mo-Su 10:00-17:00" })]);
    expect(bm.title).toBe("British Museum");
    expect(bm.tags).toContain("day-trip");
    expect(bm.priceEstimate).toBe(0);
    expect(bm.openingHours).toBe("Mo-Su 10:00-17:00");
    expect(bm.bookingUrl).toBe("https://example.org/");
    expect(bm.durationMinutes).toBeGreaterThanOrEqual(120);
    expect(bm.status).toBe("active");
    expect(bm.adminNotes).toContain(OSM_DAYTRIPS_NOTE_PREFIX);
    expect(bm.description).toMatch(/worth a day out/);
  });

  it("leaves out what is not well known, not open to visitors, or not a place to go", () => {
    const out = select([
      place({ name: "Local Museum", importance: 0.3 }),
      place({ name: "Hidden Museum" }, { access: "private" }),
      place({ name: "Notable But Unusable" }, { website: "" }),
      place({ name: "Carnaby Street" }),
      place({ name: "Bank of England" }),
      place({ name: "Real Museum" }),
    ]);
    expect(out.map((c) => c.title)).toEqual(["Real Museum"]);
  });

  it("leaves out anything too far, and anything already in the catalogue", () => {
    const far = place({ name: "Faraway Museum" }, {}, { lat: 53.4, lng: -1.5 });
    const have = { title: "British Museum", location_lat: 51.5194, location_lng: -0.127 };
    expect(select([far, place({ name: "British Museum" })], "museum", [have])).toEqual([]);
  });

  it("puts the best known first, and each place once however many searches find it", () => {
    const a = place({ name: "Lesser Museum", importance: 0.45 });
    const b = place({ name: "Greater Museum", importance: 0.7 });
    const out = selectLandmarks(
      [
        { term: "museum", places: [a, b] },
        { term: "attraction", places: [b] },
      ],
      BARNET,
      DAY_TRIP_SOURCE_RADIUS_KM,
      [],
      "Barnet"
    );
    expect(out.map((c) => c.title)).toEqual(["Greater Museum", "Lesser Museum"]);
  });

  it("keeps only a few of each kind", () => {
    const many = Array.from({ length: 30 }, (_, i) => place({ name: `Famous Museum ${i}`, importance: 0.9 - i * 0.01 }, {}, { lat: 51.5 + i * 0.01, lng: -0.1 }));
    expect(select(many)).toHaveLength(12);
  });

  it("treats a historic house, a castle and a garden as places to visit, and a statue as not", () => {
    const house = place({ name: "Ham House", category: "tourism", type: "attraction" });
    const castle = place({ name: "Windsor Castle", category: "historic", type: "castle" }, { opening_hours: "Mo-Su 10:00-16:00" });
    const statue = place({ name: "Victoria Statue", category: "tourism", type: "attraction" });
    const out = selectLandmarks([{ term: "attraction", places: [house, castle, statue] }], BARNET, DAY_TRIP_SOURCE_RADIUS_KM, [], "Barnet");
    expect(out.map((c) => c.title).sort()).toEqual(["Ham House", "Windsor Castle"]);
    expect(out.every((c) => c.tags.includes("day-trip"))).toBe(true);
  });
});

describe("searching the area", () => {
  it("covers the square around a centre with nine boxes, and cuts a box into four", () => {
    const boxes = gridBoxes(BARNET, 45);
    expect(boxes).toHaveLength(9);
    expect(Math.min(...boxes.map((b) => b.west))).toBeLessThan(BARNET.lng);
    expect(Math.max(...boxes.map((b) => b.east))).toBeGreaterThan(BARNET.lng);
    const q = quarters(boxes[0]);
    expect(q).toHaveLength(4);
    expect(Math.max(...q.map((b) => b.east))).toBeCloseTo(boxes[0].east, 6);
    expect(Math.min(...q.map((b) => b.south))).toBeCloseTo(boxes[0].south, 6);
  });

  const fakeDb = { from: () => ({ select: () => ({ or: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) } as unknown as SupabaseClient;

  it("looks closer at a box that came back full, and never spends more than it is allowed", async () => {
    const full = Array.from({ length: 40 }, (_, i) => place({ name: `Place ${i}` }));
    const urls: string[] = [];
    const fetchJson = vi.fn(async (url: string) => (urls.push(url), [...full]));
    await createDayTripSource(fakeDb, BARNET, "Barnet", { fetchJson, sleep: async () => {} }).fetchCandidates();
    expect(fetchJson.mock.calls.length).toBeGreaterThan(9 * 7);
    expect(fetchJson.mock.calls.length).toBeLessThanOrEqual(MAX_DAY_TRIP_REQUESTS);
    expect(urls[0]).toContain("bounded=1");
    expect(urls[0]).toContain("extratags=1");
  });

  it("does not look closer at a box that was not full", async () => {
    const fetchJson = vi.fn(async () => [place({ name: "Only One" })]);
    await createDayTripSource(fakeDb, BARNET, "Barnet", { fetchJson, sleep: async () => {} }).fetchCandidates();
    expect(fetchJson).toHaveBeenCalledTimes(9 * 7);
  });

  it("says so, rather than reporting 'found nothing', when the service is down", async () => {
    await expect(createDayTripSource(fakeDb, BARNET, "Barnet", { fetchJson: async () => null, sleep: async () => {} }).fetchCandidates()).rejects.toThrow(/failed/);
  });

  it("is spaced out like every other request to the service", async () => {
    const waits: number[] = [];
    await createDayTripSource(fakeDb, BARNET, "Barnet", { fetchJson: async () => [], sleep: async (ms) => void waits.push(ms) }).fetchCandidates();
    expect(waits.length).toBeGreaterThan(0);
    expect(Math.min(...waits)).toBeGreaterThan(0);
  });
});

describe("making sure a region has them", () => {
  type Marker = { last_attempt_at?: string; last_success_at?: string } | null;
  function db(opts: { marker?: Marker; nearby?: number }) {
    const upserts: Record<string, unknown>[] = [];
    const client = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "like", "gte", "lte"]) chain[m] = () => chain;
        if (table === "discovery_regions") {
          chain.maybeSingle = async () => ({ data: opts.marker ?? null, error: null });
          chain.upsert = async (row: Record<string, unknown>) => (upserts.push(row), { error: null });
        } else {
          chain.limit = async () => ({ data: Array.from({ length: opts.nearby ?? 0 }, () => ({ location_lat: 51.6, location_lng: -0.2 })), error: null });
        }
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, upserts };
  }
  const deps = { geocode: async () => BARNET, sleep: async () => {}, now: new Date("2026-10-16T03:00:00Z") };

  it("does not do a region twice, and puts a mark in the table the paid searches use", async () => {
    const { ensureDayTrips, DAY_TRIPS_KEY } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockResolvedValue({ results: [{ source: "openstreetmap-daytrips", found: 30, inserted: 28, insertedActive: 28, errors: [] }], pending: [] } as never);

    const first = db({});
    expect(await ensureDayTrips(first.client, "Near Barnet", deps)).toEqual({ region: "Near Barnet", status: "added", inserted: 28 });
    expect(first.upserts).toHaveLength(1);
    expect(first.upserts[0]).toMatchObject({ region_key: `barnet#${DAY_TRIPS_KEY}`, last_success_at: "2026-10-16T03:00:00.000Z" });

    const second = db({ marker: { last_success_at: "2026-10-01T03:00:00Z" } });
    expect((await ensureDayTrips(second.client, "Barnet", deps)).status).toBe("already_covered");
    expect(second.upserts).toHaveLength(0);
  });

  it("recognises the same city under another name by the places already near it", async () => {
    const { ensureDayTrips } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockClear();
    const d = db({ nearby: 20 });
    expect((await ensureDayTrips(d.client, "EN5", deps)).status).toBe("already_covered");
    expect(persistDiscovery).not.toHaveBeenCalled();
    expect(d.upserts[0]).toMatchObject({ last_success_at: expect.any(String) });
  });

  it("leaves a failed region alone for a few days, then tries again, without marking it done", async () => {
    const { ensureDayTrips } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockResolvedValue({ results: [{ source: "x", found: 0, inserted: 0, insertedActive: 0, errors: ["all requests failed"] }], pending: [] } as never);

    const recent = db({ marker: { last_attempt_at: "2026-10-15T03:00:00Z" } });
    expect((await ensureDayTrips(recent.client, "Barnet", deps)).status).toBe("already_covered");

    const old = db({ marker: { last_attempt_at: "2026-10-10T03:00:00Z" } });
    const outcome = await ensureDayTrips(old.client, "Barnet", deps);
    expect(outcome.status).toBe("failed");
    expect(old.upserts[0]).not.toHaveProperty("last_success_at");
  });

  it("only searches as many regions in a run as it is allowed to", async () => {
    const { ensureDayTripsForRegions } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockClear();
    vi.mocked(persistDiscovery).mockResolvedValue({ results: [{ source: "x", found: 1, inserted: 1, insertedActive: 1, errors: [] }], pending: [] } as never);
    const d = db({});
    const outcomes = await ensureDayTripsForRegions(d.client, ["A", "B", "C"], { ...deps, maxFetches: 1 });
    expect(outcomes).toHaveLength(1);
    expect(persistDiscovery).toHaveBeenCalledTimes(1);
  });

  it("is a job of its own with its own time limit, one region a run, not part of the nightly job", () => {
    const route = read("src/app/api/discovery/day-trips/route.ts");
    expect(route).toContain("if (!isCronRequest(request))");
    expect(route).toContain("export const maxDuration = 300;");
    expect(route).toContain("MAX_DAY_TRIP_FETCHES_PER_RUN = 1");
    expect(read("src/app/api/discovery/run/route.ts")).not.toContain("ensureDayTripsForRegions");
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: "/api/discovery/day-trips", schedule: "0 4 * * *" });
  });

  it("only looks for day trips around a place that was found on a map", () => {
    expect(read("src/app/api/discovery/day-trips/route.ts")).toContain(".filter((p) => p.location_lat != null && p.location_lng != null)");
  });
});
