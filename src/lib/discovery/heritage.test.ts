import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyPlace, type NominatimPlace } from "@/lib/discovery/sources/openStreetMap";
import { createHeritageSource, HERITAGE_RADIUS_KM, MAX_HERITAGE_REQUESTS, OSM_HERITAGE_NOTE_PREFIX, operatorOf, scoreOf, selectHeritage } from "@/lib/discovery/sources/heritage";
import { heritageLine, pickHeritage, wantsHeritage } from "@/lib/chat/heritage";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import { themeByKey } from "@/lib/discovery/themes";

vi.mock("@/lib/discovery/run", () => ({ persistDiscovery: vi.fn(), geocodePending: vi.fn() }));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const STEVENAGE = { lat: 51.9017, lng: -0.2027 };

let n = 0;
const place = (name: string, category: string, type: string, extra: Record<string, string> = {}, at = { lat: 51.95, lng: -0.15 }, importance = 0.2): NominatimPlace => ({
  osm_type: "node",
  osm_id: ++n,
  category,
  type,
  name,
  lat: String(at.lat),
  lon: String(at.lng),
  importance,
  extratags: extra,
  address: { road: "High Street", town: "Hitchin", postcode: "SG5 1AA" },
});

const select = (places: NominatimPlace[], term = "museum", existing: { title: string; location_lat: number | null; location_lng: number | null }[] = []) =>
  selectHeritage([{ term, places }], STEVENAGE, HERITAGE_RADIUS_KM, existing, "Stevenage");

describe("who runs a place", () => {
  it("is the National Trust or English Heritage when the map says so", () => {
    expect(operatorOf(place("Shaw's Corner", "historic", "manor", { operator: "National Trust" }))).toBe("national-trust");
    expect(operatorOf(place("Berkhamsted Castle", "historic", "castle", { operator: "English Heritage" }))).toBe("english-heritage");
    expect(operatorOf(place("A", "tourism", "museum", { owner: "The National Trust for England" }))).toBe("national-trust");
    expect(operatorOf(place("B", "tourism", "museum", { operator: "St Albans Museums" }))).toBeNull();
    expect(operatorOf(place("C", "tourism", "museum"))).toBeNull();
  });

  it("counts as open to visitors even with no website or hours recorded, where a castle or garden would otherwise be left out", () => {
    expect(classifyPlace(place("Wimpole Hall", "historic", "castle", { operator: "National Trust" }), "castle")).toBe("castle");
    expect(classifyPlace(place("Walled Garden", "leisure", "garden", { operator: "National Trust" }), "garden")).toBe("garden");
    expect(classifyPlace(place("Private Castle", "historic", "castle", {}), "castle")).toBeNull();
    expect(classifyPlace(place("Private Garden", "leisure", "garden", {}), "garden")).toBeNull();
  });

  it("ranks the big two, then the well described, above a bare entry", () => {
    const trust = place("Trust House", "tourism", "attraction", { operator: "National Trust", website: "https://x.org" });
    const plain = place("Plain Museum", "tourism", "museum", { website: "https://x.org" });
    const bare = place("Bare Museum", "tourism", "museum", {}, undefined, 0);
    expect(scoreOf(trust, 10)).toBeGreaterThan(scoreOf(plain, 10));
    expect(scoreOf(plain, 10)).toBeGreaterThan(scoreOf(bare, 10));
    expect(scoreOf(plain, 5)).toBeGreaterThan(scoreOf(plain, 30));
  });
});

describe("choosing what to keep", () => {
  it("keeps the places a visitor could go to, with what the map says, and says who runs them", () => {
    const [shaws, museum] = select(
      [place("Shaw's Corner", "historic", "manor", { operator: "National Trust", website: "https://nt.org.uk/shaws" }), place("Hitchin Museum", "tourism", "museum", { website: "https://museum.org", opening_hours: "Tu-Sa 10:00-16:00", fee: "no" })],
      "museum"
    );
    const [first, second] = [shaws, museum].sort((a, b) => a.title.localeCompare(b.title));
    expect(second.title).toBe("Shaw's Corner");
    expect(second.tags).toEqual(expect.arrayContaining(["national-trust", "heritage"]));
    expect(second.description).toMatch(/Run by the National Trust\./);
    expect(first).toMatchObject({ title: "Hitchin Museum", priceEstimate: 0, openingHours: "Tu-Sa 10:00-16:00", status: "active", bookingUrlVerified: true, category: "Explore" });
    expect(first.adminNotes).toContain(OSM_HERITAGE_NOTE_PREFIX);
  });

  it("finds a stately home mapped as a building and an estate mapped as a park when the National Trust or English Heritage runs it, but not an ordinary park", () => {
    const out = select([
      place("Audley End House", "building", "stately_home", { operator: "English Heritage" }),
      place("Wimpole Estate", "leisure", "park", { operator: "National Trust" }),
      place("Town Park", "leisure", "park", { website: "https://council.gov.uk" }),
      place("Private Pile", "building", "stately_home", {}),
    ]);
    expect(out.map((c) => c.title).sort()).toEqual(["Audley End House", "Wimpole Estate"]);
    expect(out.find((c) => c.title === "Wimpole Estate")?.tags).toEqual(expect.arrayContaining(["national-trust", "heritage"]));
  });

  it("leaves out a car park, toilets, a visitor centre, a café or a statue, and a place that says nothing a visitor could use", () => {
    const out = select([
      place("Parking - National Trust Wimpole Hall", "tourism", "attraction", { operator: "National Trust" }),
      place("National Trust Visitor Centre", "tourism", "attraction", { operator: "National Trust", website: "https://x.org" }),
      place("Hall Cafe", "tourism", "attraction", { website: "https://x.org" }),
      place("Queen Victoria Statue", "tourism", "attraction", { website: "https://x.org" }),
      place("Nothing Known Museum", "tourism", "museum", {}),
      place("Real Museum", "tourism", "museum", { website: "https://x.org" }),
    ]);
    expect(out.map((c) => c.title)).toEqual(["Real Museum"]);
  });

  it("leaves out what is too far, and what is already in the catalogue", () => {
    const far = place("Far Museum", "tourism", "museum", { website: "https://x.org" }, { lat: 53.4, lng: -1.5 });
    const have = { title: "Hitchin Museum", location_lat: 51.95, location_lng: -0.15 };
    expect(select([far, place("Hitchin Museum", "tourism", "museum", { website: "https://x.org" })], "museum", [have])).toEqual([]);
  });

  it("keeps the best known first when there are more than are kept, and each place once", () => {
    const many = Array.from({ length: 40 }, (_, i) => place(`Museum ${i}`, "tourism", "museum", { website: "https://x.org" }, { lat: 51.9 + i * 0.005, lng: -0.2 }, 0.5 - i * 0.01));
    const kept = select([...many, many[0]]);
    expect(kept).toHaveLength(30);
    expect(new Set(kept.map((k) => k.title)).size).toBe(30);
    expect(kept[0].title).toBe("Museum 0");
  });

  it("keeps theatres, arts centres and galleries as local culture, and archaeological sites that say how to visit", () => {
    const out = [
      ...select([place("Town Theatre", "amenity", "theatre", { website: "https://x.org" })], "theatre"),
      ...select([place("Arts Base", "amenity", "arts_centre", { website: "https://x.org" })], "arts centre"),
      ...select([place("Roman Baths", "historic", "archaeological_site", { website: "https://x.org" })], "archaeological site"),
      ...select([place("Unsigned Earthwork", "historic", "archaeological_site", {})], "archaeological site"),
    ];
    expect(out.map((c) => c.title).sort()).toEqual(["Arts Base", "Roman Baths", "Town Theatre"]);
    expect(out.find((c) => c.title === "Roman Baths")?.tags).toEqual(expect.arrayContaining(["heritage", "history"]));
  });
});

describe("searching a county", () => {
  const fakeDb = { from: () => ({ select: () => ({ or: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) } as unknown as SupabaseClient;

  it("asks for each kind of place, and for the National Trust and English Heritage by name, within the furthest a member can travel", async () => {
    const queries = new Set<string>();
    const fetchJson = vi.fn(async (url: string) => (queries.add(new URL(url).searchParams.get("q") ?? ""), []));
    await createHeritageSource(fakeDb, STEVENAGE, "Stevenage", { fetchJson, sleep: async () => {} }).fetchCandidates();
    for (const q of ["[tourism=museum]", "[tourism=gallery]", "[tourism=attraction]", "[historic=castle]", "[historic=manor]", "[leisure=garden]", "[tourism=zoo]", "[historic=archaeological_site]", "[amenity=theatre]", "[amenity=arts_centre]", "National Trust", "English Heritage"]) {
      expect(queries.has(q), q).toBe(true);
    }
    expect(HERITAGE_RADIUS_KM).toBe(40);
    expect(fetchJson.mock.calls.length).toBeLessThanOrEqual(MAX_HERITAGE_REQUESTS);
  });

  it("is a bounded run, and says so when the service is down rather than 'found nothing'", async () => {
    expect(MAX_HERITAGE_REQUESTS).toBeLessThanOrEqual(150);
    await expect(createHeritageSource(fakeDb, STEVENAGE, "Stevenage", { fetchJson: async () => null, sleep: async () => {} }).fetchCandidates()).rejects.toThrow(/failed/);
  });
});

describe("making sure a region has it", () => {
  type Marker = { last_attempt_at?: string; last_success_at?: string } | null;
  function db(marker: Marker) {
    const upserts: Record<string, unknown>[] = [];
    const client = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "like", "gte", "lte"]) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: marker, error: null });
        chain.upsert = async (row: Record<string, unknown>) => (upserts.push(row), { error: null });
        chain.limit = async () => ({ data: [], error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, upserts };
  }
  const NOW = new Date("2026-10-18T06:00:00Z");
  const deps = { geocode: async () => STEVENAGE, sleep: async () => {}, now: NOW };

  it("is done once, remembered under a key of its own, and looked at again after six months", async () => {
    const { ensureHeritage } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockResolvedValue({ results: [{ source: "openstreetmap-heritage", found: 100, inserted: 98, insertedActive: 98, errors: [] }], pending: [] } as never);

    const first = db(null);
    expect(await ensureHeritage(first.client, "Near Stevenage", deps)).toEqual({ region: "Near Stevenage", status: "added", inserted: 98 });
    expect(first.upserts[0]).toMatchObject({ region_key: "stevenage#osm-heritage", last_success_at: NOW.toISOString() });

    vi.mocked(persistDiscovery).mockClear();
    const recent = db({ last_attempt_at: "2026-09-01T06:00:00Z", last_success_at: "2026-09-01T06:00:00Z" });
    expect((await ensureHeritage(recent.client, "Stevenage", deps)).status).toBe("already_covered");
    expect(persistDiscovery).not.toHaveBeenCalled();

    const old = db({ last_attempt_at: "2026-02-01T06:00:00Z", last_success_at: "2026-02-01T06:00:00Z" });
    expect((await ensureHeritage(old.client, "Stevenage", deps)).status).toBe("added");
    expect(persistDiscovery).toHaveBeenCalledTimes(1);
  });

  it("is left alone for a few days after a failure, and a place that cannot be found is remembered as tried", async () => {
    const { ensureHeritage } = await import("@/lib/discovery/osmPlaces");
    const { persistDiscovery } = await import("@/lib/discovery/run");
    vi.mocked(persistDiscovery).mockClear();
    const tried = db({ last_attempt_at: "2026-10-17T06:00:00Z" });
    expect((await ensureHeritage(tried.client, "Stevenage", deps)).status).toBe("already_covered");
    expect(persistDiscovery).not.toHaveBeenCalled();

    const lost = db(null);
    const outcome = await ensureHeritage(lost.client, "Nowhereville", { ...deps, geocode: async () => null });
    expect(outcome.status).toBe("failed");
    expect(lost.upserts[0]).not.toHaveProperty("last_success_at");
  });

  it("is a job of its own, run once a day after the others that ask the map service, one region a run, for places found on a map", () => {
    const route = read("src/app/api/discovery/heritage/route.ts");
    expect(route).toContain("if (!isCronRequest(request))");
    expect(route).toContain("export const maxDuration = 300;");
    expect(route).toContain("MAX_HERITAGE_FETCHES_PER_RUN = 1");
    expect(route).toContain(".filter((p) => p.location_lat != null && p.location_lng != null)");
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: "/api/discovery/heritage", schedule: "0 6 * * *" });
  });
});

describe("a search for what no map lists", () => {
  it("covers the National Trust and English Heritage and what they have on, museums, houses, galleries and local history, the same for every town", () => {
    const theme = themeByKey("heritage");
    expect(theme?.focus).toMatch(/National Trust and English Heritage/);
    expect(theme?.focus).toMatch(/museums/);
    expect(theme?.focus).toMatch(/local history society talks/);
    expect(`${theme?.label} ${theme?.focus}`).not.toMatch(/stevenage|hertfordshire|barnet|richmond/i);
  });
});

describe("the concierge and heritage", () => {
  const venue = (title: string, tags: string[], over: Partial<OpportunityCandidate> = {}): OpportunityCandidate =>
    ({ id: title, title, tags, address: "High Street", price_estimate: null, recurrence_rule: null, date_time: null, location_lat: 51.9, location_lng: -0.2, ...over }) as unknown as OpportunityCandidate;
  const HOME = { lat: 51.9017, lng: -0.2027 };

  it("hears a question about the National Trust, a museum or a historic house, and not other questions", () => {
    for (const yes of ["Any National Trust places near me?", "somewhere with English Heritage", "a stately home to visit", "what museums are there", "is there a castle nearby", "historic houses open to visitors", "roman ruins"]) {
      expect(wantsHeritage(yes), yes).toBe(true);
    }
    for (const no of ["What's on today?", "somewhere for lunch", "a walk in the park", "find a yoga class"]) expect(wantsHeritage(no), no).toBe(false);
  });

  it("lists the nearest, the big two first among near equals, never food, a dated event or a group", () => {
    const picked = pickHeritage(
      [
        venue("Far Museum", ["museum"], { location_lat: 52.3 }),
        venue("Near Museum", ["museum"], { location_lat: 51.925 }),
        venue("Trust House", ["national-trust", "heritage"], { location_lat: 51.93 }),
        venue("Heritage Cafe", ["food-venue", "cafe", "heritage"]),
        venue("History Talk", ["history", "talk"], { date_time: "2026-11-01T10:00:00Z" }),
        venue("Yoga", ["yoga"]),
      ],
      HOME
    );
    expect(picked.map((p) => p.venue.title)).toEqual(["Trust House", "Near Museum", "Far Museum"]);
  });

  it("gives only the National Trust's own when asked for them", () => {
    const list = [venue("Trust House", ["national-trust", "heritage"]), venue("Castle", ["english-heritage", "heritage"]), venue("Museum", ["museum"])];
    expect(pickHeritage(list, HOME, "any National Trust places?").map((p) => p.venue.title)).toEqual(["Trust House"]);
    expect(pickHeritage(list, HOME, "English Heritage castles").map((p) => p.venue.title)).toEqual(["Castle"]);
  });

  it("says who runs it, what it costs if known, how far, and what is not known", () => {
    expect(heritageLine(venue("Shaw's Corner", ["national-trust"], { price_estimate: null, recurrence_rule: "Tu-Su 11:00-17:00" }), 9.2)).toBe(
      "- id=Shaw's Corner | Shaw's Corner | run by the National Trust | price not known | High Street | 9 km from home | hours: Tu-Su 11:00-17:00"
    );
    expect(heritageLine(venue("Museum", ["museum"], { price_estimate: 0 }), null)).toBe("- id=Museum | Museum | free | High Street | distance not known | opening hours not known");
  });

  it("is given only when asked, with a rule against inventing prices, collections or what is on", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain('wantsHeritage(question) ? await heritageText(supabase, memberId, question) : ""');
    expect(agent).toContain("HERITAGE, MUSEUMS AND HISTORIC PLACES WITHIN THEIR DISTANCE");
    expect(agent).toContain("never state a price, a collection, an exhibition or what is on that is not in a line");
  });
});
