import { describe, expect, it } from "vitest";
import {
  classifyPlace,
  createOpenStreetMapSource,
  OSM_FOOD_NOTE_PREFIX,
  OSM_PLACES_NOTE_PREFIX,
  OSM_THINGS_NOTE_PREFIX,
  selectPlaces,
  type NominatimPlace,
} from "@/lib/discovery/sources/openStreetMap";

const STEVENAGE = { lat: 51.9017, lng: -0.2027 };

/** Shaped like what OpenStreetMap really returned for these places in Stevenage. */
const place = (name: string, category: string, type: string, extratags: Record<string, string> = {}, at = { lat: "51.903", lon: "-0.205" }): NominatimPlace => ({
  osm_type: "way",
  osm_id: Math.abs(name.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)),
  category,
  type,
  name,
  ...at,
  extratags,
  address: { road: "High Street", town: "Stevenage" },
});

const SWIMMING_CENTRE = place("Stevenage Swimming Centre", "leisure", "sports_centre", {
  fee: "yes", sport: "swimming", access: "customers", covered: "yes", building: "swimming_pool", location: "indoor",
});
const HOLLYWOOD_BOWL = place("Hollywood Bowl", "leisure", "bowling_alley", { sport: "10pin", website: "https://www.hollywoodbowl.co.uk/stevenage/" });
const MULLIGANS = place("Mr Mulligan's Lost World Golf", "leisure", "miniature_golf", { website: "https://www.mrmulligan.com/stevenage" });
const KNEBWORTH = place("Knebworth House", "tourism", "attraction", { website: "https://knebworthhouse.com/" });

describe("the things-to-do layer finds what the places layer never asked for", () => {
  it("keeps a paying leisure facility, which OpenStreetMap marks 'customers', but only in this layer", () => {
    expect(classifyPlace(SWIMMING_CENTRE, "swimming centre")).toBe("leisure_centre");
    // The places layer still leaves out 'customers': that is how it avoids a café inside a shop.
    expect(classifyPlace(SWIMMING_CENTRE, "sports centre")).toBeNull();
  });

  it("recognises bowling and adventure golf", () => {
    expect(classifyPlace(HOLLYWOOD_BOWL, "bowling alley")).toBe("bowling_alley");
    expect(classifyPlace(MULLIGANS, "miniature golf")).toBe("mini_golf");
  });

  it("calls an attraction named as a house a historic house, so it is told apart from a day out at a farm or a grotto", () => {
    expect(classifyPlace(KNEBWORTH, "attraction")).toBe("heritage_house");
    expect(classifyPlace(place("Church Farm", "tourism", "attraction", { website: "https://www.churchfarmardeley.co.uk/" }), "attraction")).toBe("attraction");
  });

  it("leaves out an attraction that says nothing a visitor could use", () => {
    expect(classifyPlace(place("Scott's Grotto", "tourism", "attraction"), "attraction")).toBeNull();
  });

  it("leaves out things tagged as attractions that are not somewhere to spend a few hours", () => {
    for (const name of ["Wheathampstead Railway Station", "Old Whipping Post", "War Memorial", "Town Fountain", "Viewpoint over the valley"]) {
      expect(classifyPlace(place(name, "tourism", "attraction", { website: "https://example.org" }), "attraction"), name).toBeNull();
    }
  });

  it("is not caught out by a word inside a longer one (a Crossways Gallery is not a cross)", () => {
    expect(classifyPlace(place("Crossways Hall", "tourism", "attraction", { website: "https://example.org" }), "attraction")).toBe("heritage_house");
    expect(classifyPlace(place("Stonehouse Farm Park", "tourism", "attraction", { website: "https://example.org" }), "attraction")).toBe("attraction");
  });

  it("leaves out a school's own hall and a label that is not a name", () => {
    expect(classifyPlace(place("Heath Mount Sports Hall", "leisure", "sports_centre", { sport: "multi" }), "leisure centre")).toBeNull();
    expect(classifyPlace(place("Hitchin Boys Sports Centre", "leisure", "sports_centre", { sport: "multi" }), "leisure centre")).toBeNull();
    expect(classifyPlace(place("Sports: Swimming Pool", "leisure", "swimming_pool", { fee: "yes" }), "swimming centre")).toBeNull();
  });

  it("leaves out a golf club, which is for members, and keeps a pay-and-play centre", () => {
    expect(classifyPlace(place("Knebworth Golf Club", "leisure", "golf_course", { website: "https://example.org" }), "golf course")).toBeNull();
    expect(classifyPlace(place("Stevenage Golf Centre", "leisure", "golf_course", { website: "https://example.org" }), "golf course")).toBe("golf");
  });

  it("still leaves out what is private, whatever the layer", () => {
    expect(classifyPlace(place("Hollywood Bowl", "leisure", "bowling_alley", { access: "private" }), "bowling alley")).toBeNull();
    expect(classifyPlace(place("Hollywood Bowl", "leisure", "bowling_alley", { access: "permit" }), "bowling alley")).toBeNull();
  });
});

describe("what the layer saves", () => {
  const found = selectPlaces(
    [
      { term: "swimming centre", places: [SWIMMING_CENTRE] },
      { term: "bowling alley", places: [HOLLYWOOD_BOWL] },
      { term: "miniature golf", places: [MULLIGANS] },
      { term: "attraction", places: [KNEBWORTH] },
    ],
    STEVENAGE,
    20,
    [],
    "Stevenage",
    "things"
  );
  const byTitle = (title: string) => found.find((c) => c.title === title)!;

  it("is one entry per place, in the right category, with tags the recommender understands", () => {
    expect(found.map((c) => c.title).sort()).toEqual(["Hollywood Bowl", "Knebworth House", "Mr Mulligan's Lost World Golf", "Stevenage Swimming Centre"]);
    expect(byTitle("Stevenage Swimming Centre").category).toBe("Move");
    expect(byTitle("Hollywood Bowl").category).toBe("Joy");
    expect(byTitle("Knebworth House")).toMatchObject({ category: "Explore", tags: expect.arrayContaining(["heritage", "history"]) });
  });

  it("uses the venue's own website as the link when it has one, and never invents a price", () => {
    expect(byTitle("Hollywood Bowl").bookingUrl).toBe("https://www.hollywoodbowl.co.uk/stevenage/");
    expect(found.every((c) => c.priceEstimate === null)).toBe(true);
  });

  it("is a standing venue, not an event, and credits OpenStreetMap in its own note", () => {
    expect(found.every((c) => c.dateTime === null)).toBe(true);
    expect(found.every((c) => c.adminNotes?.startsWith(OSM_THINGS_NOTE_PREFIX))).toBe(true);
  });

  it("is recognised as its own layer, so a town that already has its places and food still gets it", () => {
    const prefixes = [OSM_PLACES_NOTE_PREFIX, OSM_FOOD_NOTE_PREFIX, OSM_THINGS_NOTE_PREFIX];
    expect(new Set(prefixes).size).toBe(3);
    for (const a of prefixes) for (const b of prefixes) if (a !== b) expect(a.startsWith(b)).toBe(false);
  });

  it("does not add a place the catalogue already has", () => {
    const again = selectPlaces([{ term: "bowling alley", places: [HOLLYWOOD_BOWL] }], STEVENAGE, 20, [{ title: "Hollywood Bowl", location_lat: 51.903, location_lng: -0.205 }], "Stevenage", "things");
    expect(again).toEqual([]);
  });
});

describe("asking OpenStreetMap", () => {
  it("asks for exactly that kind of place, because a plain phrase finds nothing (no 'bowling alley' in a town that has one)", async () => {
    const asked: string[] = [];
    const supabase = { from: () => ({ select: () => ({ or: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) } as never;
    await createOpenStreetMapSource(
      supabase,
      STEVENAGE,
      "Stevenage",
      {
        fetchJson: async (url) => {
          asked.push(new URL(url).searchParams.get("q") ?? "");
          return [];
        },
        sleep: async () => {},
      },
      "things"
    ).fetchCandidates().catch(() => []);
    for (const q of ["[leisure=sports_centre]", "[leisure=swimming_pool]", "[leisure=bowling_alley]", "[leisure=miniature_golf]", "[tourism=attraction]", "[historic=manor]", "[tourism=gallery]"]) {
      expect(asked, q).toContain(q);
    }
  });
});
