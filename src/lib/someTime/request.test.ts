import { describe, expect, it } from "vitest";
import { parseTimeRequest } from "@/lib/someTime/request";

const GOOD = { start: "now", duration: "1-2h", who: "partner", mood: "culture", exclude: [] };

describe("parseTimeRequest", () => {
  it("accepts a valid request", () => {
    expect(parseTimeRequest(GOOD)).toEqual({ ...GOOD, untilMin: null });
  });

  it("treats the mood as optional", () => {
    expect(parseTimeRequest({ ...GOOD, mood: undefined })?.mood).toBeNull();
    expect(parseTimeRequest({ ...GOOD, mood: null })?.mood).toBeNull();
    expect(parseTimeRequest({ ...GOOD, mood: "not-a-mood" })?.mood).toBeNull();
  });

  it("rejects an unknown start, duration or companion — the input comes from the browser", () => {
    expect(parseTimeRequest({ ...GOOD, start: "yesterday" })).toBeNull();
    expect(parseTimeRequest({ ...GOOD, duration: "forever" })).toBeNull();
    expect(parseTimeRequest({ ...GOOD, who: "stranger" })).toBeNull();
    expect(parseTimeRequest({ ...GOOD, who: undefined })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseTimeRequest(null)).toBeNull();
    expect(parseTimeRequest("now")).toBeNull();
    expect(parseTimeRequest(42)).toBeNull();
  });

  it("keeps only plausible ids in the exclusion list, and caps it", () => {
    const ok = "3f2a7c1e-9d4b-4a6e-8f10-2b5c7d9e0a11";
    const parsed = parseTimeRequest({ ...GOOD, exclude: [ok, "; drop table", 42, "x", ...Array(60).fill(ok)] });
    expect(parsed?.exclude[0]).toBe(ok);
    expect(parsed?.exclude.every((id) => id === ok)).toBe(true);
    expect(parsed?.exclude.length).toBe(40);
  });

  it("defaults a missing exclusion list to empty", () => {
    expect(parseTimeRequest({ ...GOOD, exclude: undefined })?.exclude).toEqual([]);
  });
});

describe("parseTimeRequest — the time before the next plan", () => {
  const base = { start: "now", who: "just_me", mood: null, exclude: [] };

  it("accepts it with a time to be back for", () => {
    expect(parseTimeRequest({ ...base, duration: "until_next", untilMin: 17 * 60 })?.untilMin).toBe(1020);
  });

  it("rejects it without a usable time, since it would mean nothing", () => {
    expect(parseTimeRequest({ ...base, duration: "until_next" })).toBeNull();
    expect(parseTimeRequest({ ...base, duration: "until_next", untilMin: -5 })).toBeNull();
    expect(parseTimeRequest({ ...base, duration: "until_next", untilMin: 5000 })).toBeNull();
    expect(parseTimeRequest({ ...base, duration: "until_next", untilMin: "17:00" })).toBeNull();
    expect(parseTimeRequest({ ...base, duration: "until_next", untilMin: 12.5 })).toBeNull();
  });

  it("ignores a stray time on any other duration", () => {
    expect(parseTimeRequest({ ...base, duration: "1-2h", untilMin: 600 })?.untilMin).toBeNull();
  });

  it("knows the outdoors mood", () => {
    expect(parseTimeRequest({ ...base, duration: "30m", mood: "outdoors" })?.mood).toBe("outdoors");
  });
});
