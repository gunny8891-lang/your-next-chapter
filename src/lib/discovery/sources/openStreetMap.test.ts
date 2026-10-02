import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/nominatim-barnet.json";
import {
  classifyPlace,
  isDuplicate,
  selectPlaces,
  viewboxAround,
  type NominatimPlace,
} from "@/lib/discovery/sources/openStreetMap";

// Real Nominatim responses for Barnet, including the junk it returns: bus stops
// called "Leisure Centre", a car park called "Sports Centre", a school building
// called "Swimming Pool".
const RESULTS = (() => {
  const byTerm = new Map<string, NominatimPlace[]>();
  for (const { term, place } of fixture as unknown as { term: string; place: NominatimPlace }[]) {
    byTerm.set(term, [...(byTerm.get(term) ?? []), place]);
  }
  return [...byTerm].map(([term, places]) => ({ term, places }));
})();

const BARNET = { lat: 51.65309, lng: -0.2002261 };
const place = (overrides: Partial<NominatimPlace>): NominatimPlace => ({
  name: "Example",
  category: "leisure",
  type: "sports_centre",
  lat: "51.6",
  lon: "-0.2",
  ...overrides,
});

describe("classifyPlace", () => {
  it("rejects things that merely share a facility's name", () => {
    expect(classifyPlace(place({ name: "Leisure Centre", category: "highway", type: "bus_stop" }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "Sports Centre", category: "amenity", type: "parking" }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "Swimming Pool", category: "building", type: "school" }), "swimming pool")).toBeNull();
  });

  it("rejects generic names that say what a place is but not which one", () => {
    expect(classifyPlace(place({ name: "Sports Centre" }), "sports centre")).toBeNull();
  });

  it("rejects private and members-only places", () => {
    const pool = place({ name: "Hilltop Pool Club", type: "swimming_pool" });
    expect(classifyPlace({ ...pool, extratags: { access: "private" } }, "swimming pool")).toBeNull();
    expect(classifyPlace({ ...pool, extratags: { access: "customers" } }, "swimming pool")).toBeNull();
  });

  it("rejects clubs, club grounds and combat gyms", () => {
    expect(classifyPlace(place({ name: "Hazelwood Sports Club", extratags: { club: "sport", opening_hours: "Mo-Su 08:00-23:00" } }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "Old Finchleians Memorial Ground", extratags: { website: "https://x.uk" } }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "Ballazhi", extratags: { sport: "boxing", website: "https://x.uk" } }), "sports centre")).toBeNull();
  });

  it("rejects venues for other age groups", () => {
    expect(classifyPlace(place({ name: "Greentop Young Persons Activity Centre", extratags: { opening_hours: "Mo-Fr 9-5" } }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "205 (Wembley) Detachment ACF", category: "amenity", type: "community_centre" }), "community centre")).toBeNull();
  });

  it("keeps real leisure facilities, including multi-sport ones", () => {
    expect(classifyPlace(place({ name: "Finchley Lido", extratags: { sport: "swimming;fitness;basketball" } }), "sports centre")).toBe("sports_centre");
    expect(classifyPlace(place({ name: "Park Road Lido", type: "swimming_pool", extratags: { fee: "yes", sport: "swimming" } }), "swimming pool")).toBe("swimming_pool");
  });

  it("classes yoga studios as wellness only for the yoga search", () => {
    const studio = place({ name: "Yoga Junction", type: "fitness_centre", extratags: { sport: "yoga" } });
    expect(classifyPlace(studio, "yoga")).toBe("yoga");
    expect(classifyPlace(place({ name: "Xcelerate Gym", type: "fitness_centre" }), "yoga")).toBeNull();
    // Plain gyms are deliberately not a place type.
    expect(classifyPlace(place({ name: "Xcelerate Gym", type: "fitness_centre" }), "sports centre")).toBeNull();
  });

  it("never offers saunas", () => {
    expect(classifyPlace(place({ name: "The Dolls House Sauna", type: "sauna" }), "sauna")).toBeNull();
  });

  it("needs a public footprint for gardens and castles (a Wikidata entry is not one)", () => {
    expect(classifyPlace(place({ name: "Some Gardens", type: "garden" }), "garden")).toBeNull();
    expect(classifyPlace(place({ name: "Hilfield Castle", category: "historic", type: "castle", extratags: { wikidata: "Q1" } }), "castle")).toBeNull();
    expect(classifyPlace(place({ name: "The Hill Garden", type: "garden", extratags: { website: "https://x.uk" } }), "garden")).toBe("garden");
  });
});

describe("isDuplicate", () => {
  const existing = [{ title: "Barnet Museum", location_lat: 51.6528, location_lng: -0.201 }];

  it("matches the same place under a slightly different name nearby", () => {
    expect(isDuplicate("The Barnet Museum", { lat: 51.6529, lng: -0.2011 }, existing)).toBe(true);
  });

  it("does not match the same name far away, or a different place nearby", () => {
    expect(isDuplicate("Barnet Museum", { lat: 51.4, lng: -0.3 }, existing)).toBe(false);
    expect(isDuplicate("Barnet Library", { lat: 51.6529, lng: -0.2011 }, existing)).toBe(false);
  });
});

describe("viewboxAround", () => {
  it("orders west, north, east, south as Nominatim expects", () => {
    const [west, north, east, south] = viewboxAround(BARNET, 8).split(",").map(Number);
    expect(west).toBeLessThan(east);
    expect(north).toBeGreaterThan(south);
  });
});

describe("selectPlaces (real Barnet responses)", () => {
  const selected = selectPlaces(RESULTS, BARNET, 20, [], "Barnet");
  const titles = selected.map((c) => c.title);

  it("keeps the good places and drops the junk", () => {
    expect(titles).toEqual(expect.arrayContaining(["Finchley Lido", "East Finchley Library", "Freehold Community Centre", "RAF Museum"]));
    expect(titles).not.toContain("Hazelwood Sports Club");
    expect(titles).not.toContain("Leisure Centre");
    expect(titles).not.toContain("Sports Centre");
    expect(titles).not.toContain("Swimming Pool");
    expect(titles.some((t) => /Triangle Children/.test(t))).toBe(false);
  });

  it("lists a venue once even when it appears as both a centre and a pool", () => {
    expect(titles.filter((t) => /Finchley Lido/.test(t))).toHaveLength(1);
  });

  it("produces standing, located, uniquely-linked entries", () => {
    for (const c of selected) {
      expect(c.dateTime).toBeNull();
      expect(c.locationLat).not.toBeNull();
      expect(c.status).toBe("active");
    }
    expect(new Set(selected.map((c) => c.bookingUrl)).size).toBe(selected.length);
  });

  it("marks free-by-default places free and leaves others unpriced", () => {
    expect(selected.find((c) => c.title === "Trent Park")?.priceEstimate).toBe(0);
    expect(selected.find((c) => c.title === "Finchley Lido")?.priceEstimate).toBeNull();
  });

  it("skips a place already in the database", () => {
    const existing = [{ title: "East Finchley Library", location_lat: 51.5939338, location_lng: -0.1675546 }];
    const again = selectPlaces(RESULTS, BARNET, 20, existing, "Barnet").map((c) => c.title);
    expect(again).not.toContain("East Finchley Library");
  });

  it("attributes OpenStreetMap in every entry", () => {
    expect(selected.every((c) => /OpenStreetMap contributors/.test(c.adminNotes ?? ""))).toBe(true);
  });
});
