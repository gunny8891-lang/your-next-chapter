import { describe, expect, it } from "vitest";
import { estimateTravel, estimateTravelMinutes, type TravelProfile } from "@/lib/someTime/travel";
import { estimateDurationMinutes } from "@/lib/someTime/duration";
import { openStatus, parseOpeningHours } from "@/lib/someTime/openingHours";
import { mealLabel, suitsMealTime, typicalSpend } from "@/lib/someTime/food";

const NOBODY_KNOWN: TravelProfile = { drives: null, uses_public_transport: null, mobility_notes: null };

describe("estimateTravel", () => {
  it("walks short distances and never takes less than a few minutes", () => {
    const t = estimateTravel(0.2, NOBODY_KNOWN);
    expect(t.mode).toBe("walk");
    expect(t.minutes).toBe(4); // 0.26 km by road at 4.5 km/h is 3.5 min, rounded up
    expect(estimateTravel(0, NOBODY_KNOWN).minutes).toBe(3);
  });

  it("is faster by car than by public transport over the same distance", () => {
    const drive = estimateTravelMinutes(10, { ...NOBODY_KNOWN, drives: true });
    const transit = estimateTravelMinutes(10, { ...NOBODY_KNOWN, uses_public_transport: true });
    expect(drive).toBeLessThan(transit);
    expect(estimateTravel(10, { ...NOBODY_KNOWN, drives: true }).mode).toBe("drive");
    expect(estimateTravel(10, { ...NOBODY_KNOWN, uses_public_transport: true }).mode).toBe("public transport");
  });

  it("assumes a sensible blend when we do not know how they get about", () => {
    expect(estimateTravel(10, NOBODY_KNOWN).mode).toBe("mixed");
    const mixed = estimateTravelMinutes(10, NOBODY_KNOWN);
    expect(mixed).toBeGreaterThan(estimateTravelMinutes(10, { ...NOBODY_KNOWN, drives: true }));
    expect(mixed).toBeLessThan(estimateTravelMinutes(10, { ...NOBODY_KNOWN, uses_public_transport: true }));
  });

  it("takes mobility needs into account: a slower walk, and a shorter walkable distance", () => {
    const limited = { ...NOBODY_KNOWN, mobility_notes: "bad knee" };
    // Where both would walk, the slower pace takes longer.
    expect(estimateTravelMinutes(0.4, limited)).toBeGreaterThan(estimateTravelMinutes(0.4, NOBODY_KNOWN));
    // 1.1 km (1.4 km by road) is a walk for most people but not for someone with a bad knee,
    // who is assumed to go by vehicle instead.
    expect(estimateTravel(1.1, NOBODY_KNOWN).mode).toBe("walk");
    expect(estimateTravel(1.1, limited).mode).not.toBe("walk");
  });

  it("grows with distance", () => {
    expect(estimateTravelMinutes(20, NOBODY_KNOWN)).toBeGreaterThan(estimateTravelMinutes(5, NOBODY_KNOWN));
  });
});

describe("estimateDurationMinutes", () => {
  const base = { duration_minutes: null, tags: [] as string[], category: "Explore" };

  it("always prefers a stored duration", () => {
    expect(estimateDurationMinutes({ ...base, duration_minutes: 45, tags: ["theatre"] })).toBe(45);
  });

  it("keeps stored values within sensible limits", () => {
    expect(estimateDurationMinutes({ ...base, duration_minutes: 5 })).toBe(15);
    expect(estimateDurationMinutes({ ...base, duration_minutes: 9999 })).toBe(480);
  });

  it("guesses from what the thing is when nothing is stored", () => {
    expect(estimateDurationMinutes({ ...base, tags: ["theatre"] })).toBe(150);
    expect(estimateDurationMinutes({ ...base, tags: ["cafe", "coffee"] })).toBe(45);
    expect(estimateDurationMinutes({ ...base, tags: ["walking", "outdoors"] })).toBe(60);
  });

  it("falls back to the category, and then to an hour and a half", () => {
    expect(estimateDurationMinutes({ ...base, category: "Give Back" })).toBe(120);
    expect(estimateDurationMinutes({ ...base, category: "Something new" })).toBe(90);
  });
});

describe("parseOpeningHours", () => {
  it("reads ordinary weekly hours", () => {
    const week = parseOpeningHours("Mo-Fr 07:00-16:30; Sa 08:00-15:00")!;
    expect(week[0]).toEqual([[420, 990]]);
    expect(week[5]).toEqual([[480, 900]]);
    expect(week[6]).toEqual([]); // not mentioned = closed
  });

  it("reads split hours and lists of days", () => {
    const week = parseOpeningHours("Tu-Su 12:00-14:30,17:30-22:00; Mo off")!;
    expect(week[1]).toEqual([[720, 870], [1050, 1320]]);
    expect(week[0]).toEqual([]);
    expect(parseOpeningHours("Mo,We,Fr 09:00-12:00")!.map((d) => d.length)).toEqual([1, 0, 1, 0, 1, 0, 0]);
  });

  it("applies later rules over earlier ones", () => {
    const week = parseOpeningHours("Mo-Su 09:00-17:00; Su off")!;
    expect(week[6]).toEqual([]);
    expect(week[2]).toEqual([[540, 1020]]);
  });

  it("copes with the odd times real listings contain", () => {
    expect(parseOpeningHours("Mo-Su 12:00-00:00")![0]).toEqual([[720, 1440]]); // until midnight
    expect(parseOpeningHours("Mo-Th 16:30-32:00")![0]).toEqual([[990, 1920]]); // OSM allows hours past 24
    expect(parseOpeningHours("Mo-Th 17:00-25:00")![0]).toEqual([[1020, 1500]]);
    expect(parseOpeningHours("22:00-02:00")![3]).toEqual([[1320, 1560]]); // no days = every day
  });

  it("reads 24/7", () => {
    expect(parseOpeningHours("24/7")![3]).toEqual([[0, 1440]]);
  });

  it("ignores public-holiday rules rather than mistaking them for ordinary closures", () => {
    const week = parseOpeningHours("Mo-Fr 09:00-17:00; PH off")!;
    expect(week[0]).toEqual([[540, 1020]]);
  });

  it("keeps the days when a rule also names a holiday, rather than dropping the whole rule", () => {
    // Real listing (Hendon Kitchen): dropping this rule would make the place look shut at weekends.
    const week = parseOpeningHours("Mo-Fr 10:00-17:00; Sa-Su,SH 11:00-16:00")!;
    expect(week[5]).toEqual([[660, 960]]);
    expect(week[6]).toEqual([[660, 960]]);
    expect(parseOpeningHours("PH,Sa 10:00-12:00")![5]).toEqual([[600, 720]]);
  });

  it("skips a rule that is only about holidays", () => {
    const week = parseOpeningHours("Mo-Fr 09:00-17:00; SH 10:00-12:00; PH off")!;
    expect(week[0]).toEqual([[540, 1020]]);
    expect(week[6]).toEqual([]);
  });

  it("returns null — unknown, not closed — for anything it does not understand", () => {
    expect(parseOpeningHours("Su-Th 12:00-23:00; May-Sep Fr 11:30-16:30")).toBeNull(); // real listing with a month range
    expect(parseOpeningHours("unsigned")).toBeNull();
    expect(parseOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOpeningHours("Mo-Fr 09:00-late")).toBeNull();
    expect(parseOpeningHours("Jan-Mar Mo-Fr 09:00-17:00")).toBeNull();
    expect(parseOpeningHours("")).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
  });
});

describe("openStatus", () => {
  const CAFE = "Mo-Fr 07:00-16:30; Sa 08:00-15:00";
  const at = (h: number, m = 0) => h * 60 + m;

  it("is open on arrival within hours", () => {
    expect(openStatus(CAFE, "Fri", at(10), 45)).toEqual({ status: "open", closesAt: at(16, 30) });
  });

  it("is closed outside hours and on days not listed", () => {
    expect(openStatus(CAFE, "Fri", at(18), 45).status).toBe("closed");
    expect(openStatus(CAFE, "Fri", at(6), 45).status).toBe("closed");
    expect(openStatus(CAFE, "Sun", at(10), 45).status).toBe("closed");
  });

  it("is closed if it will shut within half an hour of arriving", () => {
    expect(openStatus(CAFE, "Fri", at(16, 15), 45).status).toBe("closed");
    expect(openStatus(CAFE, "Fri", at(15, 45), 45).status).toBe("open");
  });

  it("only needs to stay open for a short visit's whole length", () => {
    expect(openStatus("Mo-Su 10:00-10:20", "Mon", at(10), 15).status).toBe("open");
  });

  it("is open after midnight for a place that opens late the night before", () => {
    const pub = "Fr 18:00-02:00";
    expect(openStatus(pub, "Fri", at(23), 60).status).toBe("open");
    expect(openStatus(pub, "Sat", at(0, 30), 60).status).toBe("open"); // Friday's hours, after midnight
    expect(openStatus(pub, "Sat", at(3), 60).status).toBe("closed");
  });

  it("is unknown — never closed — when the hours are missing or unreadable", () => {
    expect(openStatus(null, "Fri", at(10), 45)).toEqual({ status: "unknown" });
    expect(openStatus("unsigned", "Fri", at(10), 45)).toEqual({ status: "unknown" });
  });
});

describe("food timing", () => {
  const at = (h: number, m = 0) => h * 60 + m;

  it("suits each kind of place to the right part of the day", () => {
    expect(suitsMealTime("cafe", at(8))).toBe(true);
    expect(suitsMealTime("cafe", at(19))).toBe(false);
    expect(suitsMealTime("restaurant", at(13))).toBe(true);
    expect(suitsMealTime("restaurant", at(16))).toBe(false);
    expect(suitsMealTime("restaurant", at(19))).toBe(true);
    expect(suitsMealTime("tea_room", at(15))).toBe(true);
    expect(suitsMealTime("tea_room", at(11))).toBe(false);
    expect(suitsMealTime("pub", at(12))).toBe(true);
    expect(suitsMealTime("pub", at(10))).toBe(false);
  });

  it("names the meal for the time", () => {
    expect(mealLabel("restaurant", at(13))).toBe("lunch");
    expect(mealLabel("restaurant", at(19))).toBe("dinner");
    expect(mealLabel("tea_room", at(15))).toBe("afternoon tea");
    expect(mealLabel("cafe", at(16))).toBe("coffee and cake");
    expect(mealLabel("pub", at(16))).toBe("a drink");
  });

  it("orders typical spend sensibly, for judging a budget", () => {
    expect(typicalSpend("cafe")).toBeLessThan(typicalSpend("pub"));
    expect(typicalSpend("pub")).toBeLessThan(typicalSpend("restaurant"));
  });
});
