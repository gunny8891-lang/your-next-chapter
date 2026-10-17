import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanAddress, DEFAULT_START, hasNoTime, startOf, TIME_NOT_GIVEN_NOTE } from "@/lib/discovery/cleanFields";
import { candidatesFromAnswer } from "@/lib/discovery/sources/organiserPage";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("an address a model could not give", () => {
  it("is nothing when it says it does not know, rather than a word the map would look up", () => {
    for (const placeholder of ["unknown", "Unknown", "TBC", "tba", "n/a", "N/A", "none", "various", "Various locations", "see website", "See the page", "online", "not stated", "Not known.", "  unknown  ", ""]) {
      expect(cleanAddress(placeholder), placeholder).toBeNull();
    }
    expect(cleanAddress(null)).toBeNull();
    expect(cleanAddress(42)).toBeNull();
  });

  it("is kept when it is one", () => {
    expect(cleanAddress("Ewen Hall, Wellington Road, Barnet")).toBe("Ewen Hall, Wellington Road, Barnet");
    expect(cleanAddress(" Stevenage Museum, SG1 3PQ ")).toBe("Stevenage Museum, SG1 3PQ");
    expect(cleanAddress("Unknown Pleasures Road, Barnet")).toBe("Unknown Pleasures Road, Barnet");
  });
});

describe("a day with no time", () => {
  it("is a midnight start however it is written", () => {
    for (const iso of ["2026-11-10T00:00:00", "2026-11-10T00:00", "2026-11-10T00:00:00Z", "2026-11-10T00:00:00+00:00", "2026-11-10T00:00:00.000Z"]) {
      expect(hasNoTime(iso), iso).toBe(true);
    }
    for (const iso of ["2026-11-10T10:30:00", "2026-11-10T00:30:00Z", "2026-11-10T12:00:00+00:00", "2026-11-10", "", null]) {
      expect(hasNoTime(iso as never), String(iso)).toBe(false);
    }
  });

  it("is put at a morning start so it can be reached, and flagged, while a real time is left alone", () => {
    expect(startOf("2026-11-10T00:00:00")).toEqual({ dateTime: `2026-11-10T${DEFAULT_START}Z`, timeGiven: false });
    expect(startOf("2026-11-05T10:30:00")).toEqual({ dateTime: "2026-11-05T10:30:00", timeGiven: true });
    expect(startOf(null)).toEqual({ dateTime: null, timeGiven: false });
    expect(TIME_NOT_GIVEN_NOTE).toMatch(/check it before going/);
  });
});

describe("what an organiser's page gives, tidied", () => {
  const entry = "https://barnet.u3asite.uk/events/";
  const answer = (item: Record<string, unknown>) => JSON.stringify({ items: [{ title: "Trip", description: "A coach trip", category: "Explore", sourceUrl: "https://barnet.u3asite.uk/u3a_events/trip/", ...item }] });

  it("puts a day with no time at ten in the morning and says to check it", () => {
    const [c] = candidatesFromAnswer(answer({ dateTime: "2026-11-10T00:00:00", address: "unknown" }), "barnet.u3asite.uk", entry);
    expect(c.dateTime).toBe("2026-11-10T10:00:00Z");
    expect(c.description).toBe(`A coach trip ${TIME_NOT_GIVEN_NOTE}`);
    expect(c.address).toBeNull();
  });

  it("leaves a real time and a real address as they are", () => {
    const [c] = candidatesFromAnswer(answer({ dateTime: "2026-11-05T10:30:00", address: "Ewen Hall", description: "A talk" }), "barnet.u3asite.uk", entry);
    expect(c).toMatchObject({ dateTime: "2026-11-05T10:30:00", address: "Ewen Hall", description: "A talk" });
  });

  it("is applied to the general and focused searches too", () => {
    const source = read("src/lib/discovery/sources/claudeWebSearch.ts");
    expect(source).toContain("address: cleanAddress(item.address)");
    expect(source).toContain("startOf(isValidIso(item.dateTime)");
  });
});
