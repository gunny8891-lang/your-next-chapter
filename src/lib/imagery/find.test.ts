import { describe, expect, it } from "vitest";
import { findPlaceImage, type FetchJson } from "@/lib/imagery/find";

const place = { title: "Red Lion", lat: 51.6513, lng: -0.2008, radiusKm: 0.35, locality: ["barnet"] };

const page = {
  title: "File:Red Lion, High Barnet, EN5.jpg",
  coordinates: [{ lat: 51.6514, lon: -0.2009 }],
  imageinfo: [
    {
      width: 2400,
      height: 1600,
      mime: "image/jpeg",
      thumburl: "https://upload.wikimedia.org/thumb/1280px-Red_Lion.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Red_Lion,_High_Barnet,_EN5.jpg",
      extmetadata: { LicenseShortName: { value: "CC BY-SA 2.0" }, Artist: { value: "Ewan-M" } },
    },
  ],
};

const answer = (pages: unknown[]) => ({ query: { pages } });

describe("findPlaceImage", () => {
  it("finds a photograph from either search, and asks for both", async () => {
    const urls: string[] = [];
    const fetchJson: FetchJson = async (url) => {
      urls.push(url);
      return url.includes("generator=geosearch") ? answer([page]) : answer([]);
    };
    const result = await findPlaceImage(place, fetchJson);
    expect(result.status).toBe("found");
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes("generator=search"))).toBe(true);
    expect(urls.some((u) => u.includes("generator=geosearch") && u.includes("ggscoord=51.6513%7C-0.2008"))).toBe(true);
    if (result.status === "found") expect(result.image.credit).toBe("Photo: Ewan-M · CC BY-SA 2.0");
  });

  it("counts the same file from both searches once", async () => {
    const result = await findPlaceImage(place, async () => answer([page]));
    expect(result.status).toBe("found");
  });

  it("says 'none' when searched properly and nothing qualifies", async () => {
    const result = await findPlaceImage(place, async () => answer([]));
    expect(result).toEqual({ status: "none", rejected: [] });
  });

  it("says 'error', not 'none', when Commons is busy, so the place is tried again soon", async () => {
    const busy: FetchJson = async () => ({ error: { code: "cirrussearch-too-busy-error" } });
    const result = await findPlaceImage(place, busy);
    expect(result.status).toBe("error");
  });

  it("says 'error' when the request itself fails", async () => {
    const down: FetchJson = async () => {
      throw new Error("The operation was aborted due to timeout");
    };
    expect(await findPlaceImage(place, down)).toEqual({ status: "error", error: "The operation was aborted due to timeout" });
  });
});
