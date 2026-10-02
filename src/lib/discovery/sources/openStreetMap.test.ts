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

// ---------------------------------------------------------------------------
// Food & drink layer — real Nominatim responses for Barnet, including the
// takeaways, members' clubs and chains it returns alongside the good places.
// ---------------------------------------------------------------------------
import foodFixture from "./__fixtures__/nominatim-barnet-food.json";
import { OSM_FOOD_NOTE_PREFIX, OSM_PLACES_NOTE_PREFIX, viewboxQuadrants } from "@/lib/discovery/sources/openStreetMap";

const FOOD_RESULTS = (() => {
  const byTerm = new Map<string, NominatimPlace[]>();
  for (const { term, place } of foodFixture as unknown as { term: string; place: NominatimPlace }[]) {
    byTerm.set(term, [...(byTerm.get(term) ?? []), place]);
  }
  return [...byTerm].map(([term, places]) => ({ term, places }));
})();

const foodPlace = (overrides: Partial<NominatimPlace>): NominatimPlace => ({
  name: "Example",
  category: "amenity",
  type: "cafe",
  lat: "51.6",
  lon: "-0.2",
  ...overrides,
});

describe("classifyPlace — food and drink", () => {
  it("accepts pubs, cafés and restaurants", () => {
    expect(classifyPlace(foodPlace({ name: "The Queens", type: "pub" }), "pub")).toBe("pub");
    expect(classifyPlace(foodPlace({ name: "Cafe Corso" }), "cafe")).toBe("cafe");
    expect(classifyPlace(foodPlace({ name: "Rossella", type: "restaurant" }), "restaurant")).toBe("restaurant");
  });

  it("does not treat bars as pubs (that is cocktail bars and members' clubs)", () => {
    expect(classifyPlace(foodPlace({ name: "No5 Dining and Lounge", type: "bar" }), "pub")).toBeNull();
    expect(classifyPlace(foodPlace({ name: "Langham Working Mens Club", type: "bar" }), "pub")).toBeNull();
  });

  it("rejects takeaways and fast food listed as restaurants", () => {
    expect(classifyPlace(foodPlace({ name: "Mohammedi Indian Takeaway", type: "restaurant" }), "restaurant")).toBeNull();
    expect(classifyPlace(foodPlace({ name: "Perfect Pizza", type: "restaurant", extratags: { takeaway: "only" } }), "restaurant")).toBeNull();
    expect(classifyPlace(foodPlace({ name: "McDonald's", type: "restaurant" }), "restaurant")).toBeNull();
  });

  it("rejects club bars and generic names", () => {
    expect(classifyPlace(foodPlace({ name: "Southgate Hockey Centre Bar" }), "cafe")).toBeNull();
    expect(classifyPlace(foodPlace({ name: "Cafe" }), "cafe")).toBeNull();
    expect(classifyPlace(foodPlace({ name: "The Pub", type: "pub" }), "pub")).toBeNull();
  });

  it("classes a tea room only through the tea room search, and a tea-named café as one", () => {
    const tea = foodPlace({ name: "The Willow Tea Rooms" });
    expect(classifyPlace(tea, "tea room")).toBe("tea_room");
    expect(classifyPlace(tea, "cafe")).toBe("tea_room");
    expect(classifyPlace(foodPlace({ name: "Cafe Corso" }), "tea room")).toBeNull();
    expect(classifyPlace(foodPlace({ name: "Oakmere Tea & Dining Room" }), "cafe")).toBe("tea_room");
  });
});

describe("selectPlaces — food layer (real Barnet responses)", () => {
  const selected = selectPlaces(FOOD_RESULTS, BARNET, 20, [], "Barnet", "food");
  const byTitle = (title: string) => selected.find((c) => c.title === title);

  it("keeps good independents and drops the junk", () => {
    const titles = selected.map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Cafe Corso", "The Queens", "Little Resham"]));
    expect(titles).not.toContain("Mohammedi Indian Takeaway");
    expect(titles).not.toContain("Southgate Hockey Centre Bar");
    expect(titles).not.toContain("Langham Working Mens Club");
    expect(titles).not.toContain("No5 Dining and Lounge");
  });

  it("marks every one as a food venue, with a visit length, and never as free", () => {
    for (const c of selected) {
      expect(c.tags).toContain("food-venue");
      expect(c.durationMinutes).toBeGreaterThan(0);
      expect(c.priceEstimate).toBeNull();
      expect(c.category).toBe("Joy");
      expect(c.adminNotes?.startsWith(OSM_FOOD_NOTE_PREFIX)).toBe(true);
    }
  });

  it("keeps opening hours in the rule field, and only real ones", () => {
    expect(byTitle("Cafe Corso")?.openingHours).toMatch(/^Mo-Fr 07:00-16:30/);
    expect(selected.every((c) => c.openingHours == null || /\d/.test(c.openingHours))).toBe(true);
    expect(selected.find((c) => c.openingHours === "unsigned")).toBeUndefined();
  });

  it("describes the kind of food and the diet it caters for", () => {
    const resham = byTitle("Little Resham")!;
    expect(resham.tags).toEqual(expect.arrayContaining(["indian", "vegetarian-options", "restaurant", "dinner"]));
    expect(resham.description).toMatch(/^Indian restaurant in /);
  });

  it("tags chains so they can rank lower, and ranks them below independents of the same type", () => {
    const costa = selected.filter((c) => c.title === "Costa" || c.title === "Starbucks");
    expect(costa.length).toBeGreaterThan(0);
    for (const c of costa) expect(c.tags).toContain("chain");
    const order = selected.map((c) => c.title);
    expect(order.indexOf("Cafe Corso")).toBeLessThan(order.indexOf("Costa"));
    expect(byTitle("Cafe Corso")?.tags).not.toContain("chain");
  });

  it("is never confused with the general places layer", () => {
    expect(selectPlaces(FOOD_RESULTS, BARNET, 20, [], "Barnet", "places")).toEqual([]);
    // ...and the places layer's own results never leak into food.
    expect(selectPlaces(RESULTS, BARNET, 20, [], "Barnet", "food")).toEqual([]);
  });

  it("uses a different note prefix per layer, so each layer's coverage can be checked separately", () => {
    const places = selectPlaces(RESULTS, BARNET, 20, [], "Barnet", "places");
    expect(places.every((c) => c.adminNotes?.startsWith(OSM_PLACES_NOTE_PREFIX))).toBe(true);
    expect(OSM_FOOD_NOTE_PREFIX).not.toBe(OSM_PLACES_NOTE_PREFIX);
  });

  it("gives every place type a visit length, so time-fit never has to guess for these", () => {
    const places = selectPlaces(RESULTS, BARNET, 20, [], "Barnet", "places");
    expect(places.every((c) => (c.durationMinutes ?? 0) > 0)).toBe(true);
  });
});

describe("viewboxQuadrants", () => {
  it("cuts the area into four boxes that together cover it", () => {
    const whole = viewboxAround(BARNET, 8).split(",").map(Number);
    const quads = viewboxQuadrants(BARNET, 8).map((q) => q.split(",").map(Number));
    expect(quads).toHaveLength(4);
    expect(Math.min(...quads.map((q) => q[0]))).toBeCloseTo(whole[0], 3);
    expect(Math.max(...quads.map((q) => q[2]))).toBeCloseTo(whole[2], 3);
    expect(Math.max(...quads.map((q) => q[1]))).toBeCloseTo(whole[1], 3);
    expect(Math.min(...quads.map((q) => q[3]))).toBeCloseTo(whole[3], 3);
    for (const [west, north, east, south] of quads) {
      expect(west).toBeLessThan(east);
      expect(north).toBeGreaterThan(south);
      expect(east - west).toBeLessThan(whole[2] - whole[0]);
    }
  });
});

describe("classifyPlace — outdoor pitches are not leisure centres", () => {
  // Real listing: offered to a member as "a leisure centre in Hornsey".
  it("rejects a multi-use games area even when it lists opening hours", () => {
    const muga = place({ name: "Wood Green Common Multi Use Game Area", extratags: { opening_hours: "24/7", fee: "no" } });
    expect(classifyPlace(muga, "sports centre")).toBeNull();
  });

  it("rejects pitches and courts, but keeps a real leisure centre", () => {
    expect(classifyPlace(place({ name: "Astro Turf Pitch", extratags: { opening_hours: "Mo-Su 09:00-21:00" } }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "Hendon Tennis Courts", extratags: { opening_hours: "Mo-Su 09:00-21:00" } }), "sports centre")).toBeNull();
    expect(classifyPlace(place({ name: "Southgate Leisure Centre", extratags: { fee: "yes" } }), "sports centre")).toBe("sports_centre");
  });
});
