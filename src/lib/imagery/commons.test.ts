import { describe, expect, it } from "vitest";
import {
  assess,
  hasDistinctiveName,
  licenceAllowed,
  localityWords,
  parseCommonsPages,
  pickBest,
  placeRadiusKm,
  toPlaceImage,
  type CommonsCandidate,
  type Place,
} from "@/lib/imagery/commons";

const redLion: Place = { title: "Red Lion", lat: 51.6513, lng: -0.2008, radiusKm: 0.35, locality: ["barnet"] };

function file(overrides: Partial<CommonsCandidate> = {}): CommonsCandidate {
  return {
    fileTitle: "File:Red Lion, High Barnet, EN5.jpg",
    width: 2400,
    height: 1600,
    mime: "image/jpeg",
    thumbUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Red_Lion.jpg/1280px-Red_Lion.jpg",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Red_Lion,_High_Barnet,_EN5.jpg",
    license: "CC BY-SA 2.0",
    nonFree: false,
    restricted: false,
    author: "Ewan-M",
    description: "",
    coords: { lat: 51.6514, lng: -0.2009 },
    ...overrides,
  };
}

describe("licenceAllowed", () => {
  it.each(["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain", "CC BY-SA 3.0 de"])("accepts %s", (l) => {
    expect(licenceAllowed(l)).toBe(true);
  });
  it.each(["CC BY-NC 4.0", "CC BY-ND 2.0", "CC BY-NC-SA 3.0", "GFDL 1.2", "No restrictions", "OGL v1.0", "", "Licence Ouverte"])("refuses %s", (l) => {
    expect(licenceAllowed(l)).toBe(false);
  });
});

describe("assess: the file itself", () => {
  it("accepts a landscape, free, well-named, nearby photograph", () => {
    expect(assess(redLion, file()).ok).toBe(true);
  });

  it.each([
    ["a PDF or scan", { mime: "application/pdf" }],
    ["a small image", { width: 640, height: 480 }],
    ["a portrait image", { width: 1600, height: 2400 }],
    ["a thin panorama", { width: 5000, height: 1000 }],
    ["a restricted file", { restricted: true }],
    ["a non-free file", { nonFree: true }],
    ["a non-commercial licence", { license: "CC BY-NC 4.0" }],
    ["a map", { fileTitle: "File:Red Lion, High Barnet map.jpg" }],
    ["a logo", { fileTitle: "File:Red Lion logo.png", mime: "image/png" }],
  ])("refuses %s", (_what, overrides) => {
    expect(assess(redLion, file(overrides)).ok).toBe(false);
  });
});

describe("assess: is it a photograph of this place", () => {
  it("requires the name as a phrase in the file's title, not scattered through it", () => {
    const barnetCafe: Place = { title: "Barnet Cafe", lat: 51.65, lng: -0.2, radiusKm: 0.35, locality: ["barnet"] };
    const angel = file({ fileTitle: "File:Angel Cafe, Mount Parade, New Barnet.jpg", coords: { lat: 51.6501, lng: -0.2001 } });
    expect(assess(barnetCafe, angel)).toEqual({ ok: false, reason: "name not in the file's title" });
  });

  it("does not accept a name that appears only in the description", () => {
    const cask: Place = { title: "Cask and Stillage", lat: 51.7, lng: -0.17, radiusKm: 0.35, locality: ["potters"] };
    const generic = file({ fileTitle: "File:High Street, Potters Bar.jpg", description: "The Cask and Stillage is on the left", coords: { lat: 51.7, lng: -0.17 } });
    expect(assess(cask, generic).ok).toBe(false);
  });

  it("refuses a street scene that only mentions a small venue's name", () => {
    const arkley: Place = { title: "The Arkley", lat: 51.65, lng: -0.22, radiusKm: 0.35, locality: ["barnet"] };
    const street = file({ fileTitle: "File:Houses on Galley Lane, Arkley - geograph.org.uk - 2665134.jpg", coords: { lat: 51.65, lng: -0.22 } });
    expect(assess(arkley, street)).toEqual({ ok: false, reason: "name is not what the photograph is titled" });
    expect(assess(arkley, file({ fileTitle: "File:The Arkley pub.jpg", coords: { lat: 51.65, lng: -0.22 } })).ok).toBe(true);
  });

  it("lets a large place's name turn up anywhere in the title", () => {
    const richmond: Place = { title: "Richmond Park", lat: 51.44, lng: -0.27, radiusKm: 1.5 };
    expect(assess(richmond, file({ fileTitle: "File:Deer in Richmond Park.jpg", coords: { lat: 51.44, lng: -0.27 } })).ok).toBe(true);
  });

  it("refuses a photograph geotagged too far from a small place", () => {
    const farAway = file({ coords: { lat: 51.5, lng: -0.1 } });
    expect(assess(redLion, farAway)).toEqual({ ok: false, reason: "photographed somewhere else" });
  });

  it("allows a larger distance across a park", () => {
    const park: Place = { title: "Trent Park", lat: 51.6454, lng: -0.1536, radiusKm: placeRadiusKm(["outdoors", "walking"]) };
    const across = file({ fileTitle: "File:Trent Park - lake.jpg", coords: { lat: 51.6454, lng: -0.1636 } });
    expect(assess(park, across).ok).toBe(true);
    expect(assess({ ...park, radiusKm: 0.35 }, across).ok).toBe(false);
  });

  it("refuses a photograph of something else that shares the name", () => {
    const oakmere: Place = { title: "The Oakmere", lat: 51.7, lng: -0.17, radiusKm: 0.35, locality: ["potters"] };
    const parkPool = file({ fileTitle: "File:Oakmere Park - Western pool - geograph.org.uk - 2688405.jpg", coords: { lat: 51.7, lng: -0.17 } });
    expect(assess(oakmere, parkPool)).toEqual({ ok: false, reason: "a photograph of something else nearby" });
  });

  it("is happy with the other subject when the place's own name has it", () => {
    const lake: Place = { title: "Darlands Lake", lat: 51.63, lng: -0.19, radiusKm: 1.5 };
    expect(assess(lake, file({ fileTitle: "File:Darlands Lake 1.JPG", coords: { lat: 51.63, lng: -0.19 } })).ok).toBe(true);
  });

  describe("with no location on the file", () => {
    const noGeo = { coords: null };

    it("needs the town as well as a multi-word name", () => {
      expect(assess(redLion, file(noGeo)).ok).toBe(true); // "Red Lion, High Barnet": two words and the town
      expect(assess(redLion, file({ ...noGeo, fileTitle: "File:Red Lion, Somewhere Else.jpg" }))).toEqual({
        ok: false,
        reason: "no location and the town is not mentioned",
      });
    });

    it("refuses a one-word name, however well it matches", () => {
      const browns: Place = { title: "Browns", lat: 51.6, lng: -0.2, radiusKm: 0.35, locality: ["barnet"] };
      expect(assess(browns, file({ ...noGeo, fileTitle: "File:Browns Barnet.jpg" }))).toEqual({
        ok: false,
        reason: "one-word name and no location to confirm it",
      });
    });
  });

  it("refuses a name too generic to recognise", () => {
    const library: Place = { title: "Public Library", lat: 51.6, lng: -0.2, radiusKm: 0.35 };
    expect(assess(library, file({ fileTitle: "File:Public Library.jpg", coords: { lat: 51.6, lng: -0.2 } }))).toEqual({
      ok: false,
      reason: "name too generic to match",
    });
    expect(hasDistinctiveName("Muswell Hill Library")).toBe(true);
    expect(hasDistinctiveName("The Park")).toBe(false);
  });

  it("matches despite apostrophes and accents", () => {
    const bulls: Place = { title: "The Bull's Head", lat: 51.47, lng: -0.24, radiusKm: 0.35 };
    expect(assess(bulls, file({ fileTitle: "File:The Bulls Head, Barnes.jpg", coords: { lat: 51.47, lng: -0.24 } })).ok).toBe(true);
  });
});

describe("pickBest", () => {
  it("prefers the file that is most about the place, and nearest", () => {
    const exact = file({ fileTitle: "File:Red Lion, High Barnet, EN5.jpg" });
    const busy = file({ fileTitle: "File:Red Lion, High Barnet, with a view along the high street and the church spire in April.jpg" });
    expect(pickBest(redLion, [busy, exact]).best?.fileTitle).toBe(exact.fileTitle);
  });

  it("returns nothing, with reasons, when nothing qualifies", () => {
    const { best, rejected } = pickBest(redLion, [file({ width: 400, height: 300 }), file({ license: "CC BY-NC 2.0" })]);
    expect(best).toBeNull();
    expect(rejected.map((r) => r.reason)).toEqual(["too small", "licence CC BY-NC 2.0"]);
  });
});

describe("credit", () => {
  it("names the author and the licence and links to the file", () => {
    const image = toPlaceImage(redLion, file());
    expect(image.credit).toBe("Photo: Ewan-M · CC BY-SA 2.0");
    expect(image.sourceUrl).toBe("https://commons.wikimedia.org/wiki/File:Red_Lion,_High_Barnet,_EN5.jpg");
    expect(image.alt).toBe("A photograph of Red Lion");
  });

  it("copes with a missing or very long author", () => {
    expect(toPlaceImage(redLion, file({ author: "" })).credit).toBe("Photo: Wikimedia Commons · CC BY-SA 2.0");
    expect(toPlaceImage(redLion, file({ author: "A".repeat(100) })).credit.length).toBeLessThan(90);
  });
});

describe("localityWords", () => {
  it("takes the town or suburb, not the street or postcode", () => {
    expect(localityWords("12 High Street, High Barnet, EN5 5UW")).toEqual(["high", "barnet"]);
    expect(localityWords("Fortis Green Road, Muswell Hill, N10 3HP")).toEqual(["muswell", "hill"]);
    expect(localityWords("Cockfosters")).toEqual(["cockfosters"]);
    expect(localityWords(null)).toEqual([]);
  });
});

describe("parseCommonsPages", () => {
  it("reads the API's response, with HTML in the author and licence cleaned", () => {
    const json = {
      query: {
        pages: [
          {
            title: "File:Ye Olde Mitre Inne.jpg",
            coordinates: [{ lat: 51.5, lon: -0.1 }],
            imageinfo: [
              {
                width: 3000,
                height: 2000,
                mime: "image/jpeg",
                thumburl: "https://upload.wikimedia.org/x/1280px-Mitre.jpg?utm_source=commons.wikimedia.org",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Ye_Olde_Mitre_Inne.jpg",
                extmetadata: {
                  LicenseShortName: { value: "CC BY 2.0" },
                  Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Matt">Matt Brown</a>' },
                  ImageDescription: { value: "<p>The pub</p>" },
                },
              },
            ],
          },
          { title: "File:Broken.jpg" }, // no image info: skipped
        ],
      },
    };
    const [only, ...rest] = parseCommonsPages(json);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({
      fileTitle: "File:Ye Olde Mitre Inne.jpg",
      license: "CC BY 2.0",
      author: "Matt Brown",
      thumbUrl: "https://upload.wikimedia.org/x/1280px-Mitre.jpg",
      coords: { lat: 51.5, lng: -0.1 },
    });
  });

  it("serves resized copies from upload.wikimedia.org, the one host that is allowed", () => {
    const page = {
      title: "File:Ye Olde Mitre Inne.jpg",
      imageinfo: [
        {
          width: 3000,
          height: 2000,
          mime: "image/jpeg",
          thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Ye_Olde_Mitre_Inne.jpg/1280px-Ye_Olde_Mitre_Inne.jpg?utm_source=commons.wikimedia.org",
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Ye_Olde_Mitre_Inne.jpg",
        },
      ],
    };
    expect(parseCommonsPages({ query: { pages: [page] } })[0].thumbUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Ye_Olde_Mitre_Inne.jpg/1280px-Ye_Olde_Mitre_Inne.jpg"
    );
  });

  it("returns nothing for a response it does not understand", () => {
    expect(parseCommonsPages(null)).toEqual([]);
    expect(parseCommonsPages({ error: { code: "busy" } })).toEqual([]);
  });
});
