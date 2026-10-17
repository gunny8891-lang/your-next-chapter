import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyPlace,
  OSM_FOOD_NOTE_PREFIX,
  OSM_GARDEN_CENTRES_NOTE_PREFIX,
  OSM_PLACES_NOTE_PREFIX,
  OSM_THINGS_NOTE_PREFIX,
  selectPlaces,
  type NominatimPlace,
} from "@/lib/discovery/sources/openStreetMap";
import { gardenCentreLine, pickGardenCentres, wantsGardenCentres } from "@/lib/chat/gardenCentres";
import { fallbackImageFor } from "@/lib/imagery/fallback";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";

vi.mock("@/lib/discovery/run", () => ({ persistDiscovery: vi.fn(), geocodePending: vi.fn() }));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const BARNET = { lat: 51.653, lng: -0.2 };

let n = 0;
const centre = (name: string, extra: Record<string, string> = { website: "https://example.org" }, at = { lat: 51.66, lng: -0.19 }): NominatimPlace => ({
  osm_type: "node",
  osm_id: ++n,
  category: "shop",
  type: "garden_centre",
  name,
  lat: String(at.lat),
  lon: String(at.lng),
  importance: 0.2,
  extratags: extra,
  address: { road: "Cattlegate Road", suburb: "Crews Hill", postcode: "EN2 9DX" },
});

describe("what counts as a garden centre", () => {
  it("is a shop the map calls a garden centre, with something a visitor could use", () => {
    expect(classifyPlace(centre("Enfield Garden Centre"), "garden centre")).toBe("garden_centre");
    expect(classifyPlace(centre("Springtime Nurseries", { opening_hours: "Mo-Su 09:00-17:00" }), "garden centre")).toBe("garden_centre");
  });

  it("is not one that says nothing a visitor could use, or a trade supplier of sheds, fencing or landscaping", () => {
    expect(classifyPlace(centre("Mystery Plants", {}), "garden centre")).toBeNull();
    for (const name of ["Crews Hill Sheds", "Barnet Fencing Supplies", "Greenfield Landscaping", "Wholesale Plants Direct", "County Building Supplies"]) {
      expect(classifyPlace(centre(name), "garden centre"), name).toBeNull();
    }
  });

  it("is not one that is private or for members", () => {
    expect(classifyPlace(centre("Staff Garden Centre", { website: "https://x.org", access: "private" }), "garden centre")).toBeNull();
  });
});

describe("choosing them for an area", () => {
  const select = (places: NominatimPlace[]) => selectPlaces([{ term: "garden centre", places }], BARNET, 20, [], "Barnet", "gardencentres");

  it("keeps them as garden-centre places, free to wander round, tagged for gardening, with their own note", () => {
    const [row] = select([centre("Enfield Garden Centre", { website: "https://example.org", opening_hours: "Mo-Su 09:00-17:00" })]);
    expect(row.title).toBe("Enfield Garden Centre");
    expect(row.category).toBe("Joy");
    expect(row.tags).toEqual(expect.arrayContaining(["gardens", "gardening", "garden centre"]));
    expect(row.priceEstimate).toBe(0);
    expect(row.openingHours).toBe("Mo-Su 09:00-17:00");
    expect(row.durationMinutes).toBe(75);
    expect(row.adminNotes).toContain(OSM_GARDEN_CENTRES_NOTE_PREFIX);
    expect(row.description).toMatch(/Garden centre in Crews Hill/);
  });

  it("keeps the nearer ones when there are many, and each once", () => {
    const many = Array.from({ length: 10 }, (_, i) => centre(`Garden Centre ${i}`, { website: `https://example.org/${i}` }, { lat: 51.66 + i * 0.01, lng: -0.19 }));
    const kept = select([...many, many[0]]);
    expect(kept).toHaveLength(6);
    expect(new Set(kept.map((k) => k.title)).size).toBe(6);
  });

  it("is only for its own layer: the nearby-places layers do not take them", () => {
    expect(selectPlaces([{ term: "garden centre", places: [centre("Enfield Garden Centre")] }], BARNET, 20, [], "Barnet", "places")).toEqual([]);
    expect(selectPlaces([{ term: "garden centre", places: [centre("Enfield Garden Centre")] }], BARNET, 20, [], "Barnet", "things")).toEqual([]);
  });

  it("has a note of its own that is none of the other layers' prefixes", () => {
    for (const other of [OSM_PLACES_NOTE_PREFIX, OSM_FOOD_NOTE_PREFIX, OSM_THINGS_NOTE_PREFIX]) {
      expect(OSM_GARDEN_CENTRES_NOTE_PREFIX.startsWith(other)).toBe(false);
    }
  });

  it("gets the garden stand-in picture until it has a photograph of its own", () => {
    expect(fallbackImageFor(["gardens", "gardening", "garden centre"])?.src).toBe("/images/fallback/garden.jpg");
  });
});

describe("making sure a region has them", () => {
  /** A database where the layers named have rows near the centre, and the rest do not. */
  function db(covered: string[]) {
    const asked: string[] = [];
    const client = {
      from: () => {
        let prefix = "";
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.like = (_c: string, value: string) => ((prefix = value), chain);
        for (const m of ["gte", "lte"]) chain[m] = () => chain;
        chain.limit = async () => {
          asked.push(prefix);
          const has = covered.some((c) => prefix.startsWith(c));
          return { data: has ? [{ location_lat: 51.66, location_lng: -0.19 }] : [], error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, asked };
  }
  const deps = { geocode: async () => BARNET, sleep: async () => {}, fetchJson: async () => [] };
  const ALL_BUT_GARDEN = [`${OSM_PLACES_NOTE_PREFIX}`, `${OSM_FOOD_NOTE_PREFIX}`, `${OSM_THINGS_NOTE_PREFIX}`];

  it("fetches them for a region that already had its other layers, which is how regions from before get theirs", async () => {
    const { ensureOpenStreetMapPlaces } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockClear();
    vi.mocked(persistDiscovery).mockResolvedValue({ results: [{ source: "openstreetmap-garden-centres", found: 5, inserted: 5, insertedActive: 5, errors: [] }], pending: [] } as never);
    const d = db(ALL_BUT_GARDEN);
    expect(await ensureOpenStreetMapPlaces(d.client, "Barnet", deps)).toEqual({ region: "Barnet", status: "added", inserted: 5 });
    expect(persistDiscovery).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a region that has them", async () => {
    const { ensureOpenStreetMapPlaces } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockClear();
    const d = db([...ALL_BUT_GARDEN, OSM_GARDEN_CENTRES_NOTE_PREFIX]);
    expect((await ensureOpenStreetMapPlaces(d.client, "Barnet", deps)).status).toBe("already_covered");
    expect(persistDiscovery).not.toHaveBeenCalled();
  });

  it("does not spend a night's few fetches on a region with no garden centre near it", async () => {
    const { ensureOpenStreetMapPlaces } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockResolvedValue({ results: [{ source: "openstreetmap-garden-centres", found: 0, inserted: 0, insertedActive: 0, errors: [] }], pending: [] } as never);
    const d = db(ALL_BUT_GARDEN);
    expect((await ensureOpenStreetMapPlaces(d.client, "Central London", deps)).status).toBe("already_covered");
  });

  it("counts a centre up to twenty kilometres away as covering the region, since there are so few", () => {
    const source = read("src/lib/discovery/osmPlaces.ts");
    expect(source).toContain("GARDEN_CENTRES_COVERED_KM = 20");
    expect(source).toContain('layer: "gardencentres", notePrefix: OSM_GARDEN_CENTRES_NOTE_PREFIX, coveredKm: GARDEN_CENTRES_COVERED_KM');
  });
});

describe("the concierge and garden centres", () => {
  const venue = (title: string, lat: number, tags = ["gardens", "gardening", "garden centre"]): OpportunityCandidate =>
    ({ id: title, title, tags, address: "Cattlegate Road", location_lat: lat, location_lng: BARNET.lng, recurrence_rule: null }) as unknown as OpportunityCandidate;

  it("hears a question about one, and nothing else", () => {
    for (const yes of ["Is there a garden centre near me?", "good garden centres around here", "somewhere to buy plants", "I need to pick up some compost"]) {
      expect(wantsGardenCentres(yes), yes).toBe(true);
    }
    for (const no of ["What's on today?", "a day trip to Kew Gardens", "Is there a park nearby?", "I love gardening"]) {
      expect(wantsGardenCentres(no), no).toBe(false);
    }
  });

  it("lists the nearest garden centres first, and only garden centres", () => {
    const picked = pickGardenCentres([venue("Far", 51.9), venue("Near", 51.66), venue("A Museum", 51.655, ["museum"]), venue("Middle", 51.75)], BARNET);
    expect(picked.map((p) => p.venue.title)).toEqual(["Near", "Middle", "Far"]);
    expect(picked[0].km).toBeLessThan(picked[1].km!);
  });

  it("says plainly what is not known", () => {
    expect(gardenCentreLine(venue("Near", 51.66), null)).toContain("distance not known");
    expect(gardenCentreLine(venue("Near", 51.66), null)).toContain("opening hours not known");
    expect(gardenCentreLine({ ...venue("Near", 51.66), recurrence_rule: "Mo-Su 09:00-17:00" }, 1.4)).toContain("1 km from home | hours: Mo-Su 09:00-17:00");
  });

  it("is given only when asked, and the concierge is told not to claim what is not known", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain('wantsGardenCentres(question) ? await gardenCentresText(supabase, memberId) : ""');
    expect(agent).toContain("GARDEN CENTRES NEAR HOME");
    expect(agent).toContain("Do not say what a garden centre sells, whether it has a café, or what it charges");
  });
});
