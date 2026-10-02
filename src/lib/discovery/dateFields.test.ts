import { describe, expect, it } from "vitest";
import { isValidIso, parseAvailableUntil } from "@/lib/discovery/dateFields";

describe("isValidIso", () => {
  it.each(["2026-10-20", "2026-10-20T10:30:00", "2026-10-20T10:30:00Z", "2026-10-20T10:30:00+01:00", "2026-10-20 10:30"])(
    "accepts %s",
    (value) => expect(isValidIso(value)).toBe(true)
  );

  it.each([
    "through to 1 November",
    "1 November 2026",
    "next Thursday",
    "2026-02-31", // not a real day
    "2026-13-01",
    "",
    "2026-10",
  ])("rejects %j", (value) => expect(isValidIso(value)).toBe(false));

  it("rejects non-strings", () => {
    expect(isValidIso(null)).toBe(false);
    expect(isValidIso(undefined)).toBe(false);
    expect(isValidIso(20261020)).toBe(false);
  });
});

describe("parseAvailableUntil", () => {
  it("reads a bare date as the end of that day", () => {
    expect(parseAvailableUntil("2026-11-01")).toBe("2026-11-01T23:59:59.000Z");
  });

  it("keeps an explicit time", () => {
    expect(parseAvailableUntil("2026-11-01T17:00:00Z")).toBe("2026-11-01T17:00:00.000Z");
  });

  it("never turns prose into a plausible wrong date", () => {
    // JavaScript's Date alone reads this as 1 November 2001.
    expect(parseAvailableUntil("through to 1 November")).toBeNull();
  });

  it("returns null for missing input", () => {
    expect(parseAvailableUntil(undefined)).toBeNull();
    expect(parseAvailableUntil(null)).toBeNull();
  });
});
