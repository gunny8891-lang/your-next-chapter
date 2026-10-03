import { describe, expect, it } from "vitest";
import { clockLabel, durationLabel, londonClock, resolveWindow } from "@/lib/someTime/window";

// Friday 2 October 2026 is in British Summer Time (UTC+1), so 12:07 UTC is 13:07 London.
const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-02T12:07:00Z");

describe("londonClock", () => {
  it("reads the clock in London, not UTC", () => {
    expect(londonClock(NOW)).toEqual({ date: "2026-10-02", minutes: 13 * 60 + 7 });
  });

  it("rolls the date over at London midnight", () => {
    expect(londonClock(at("2026-10-02T23:30:00Z")).date).toBe("2026-10-03");
  });
});

describe("resolveWindow", () => {
  it("starts 'now' at the next five minutes", () => {
    const r = resolveWindow({ start: "now", duration: "1-2h" }, NOW);
    expect(r.ok && r.window.startMin).toBe(13 * 60 + 10);
  });

  it("gives a fixed length for fixed choices", () => {
    const length = (duration: "30m" | "1-2h" | "half_day") => {
      const r = resolveWindow({ start: "now", duration }, NOW);
      return r.ok ? r.window.availableMinutes : null;
    };
    expect(length("30m")).toBe(30);
    expect(length("1-2h")).toBe(120);
    expect(length("half_day")).toBe(240);
  });

  it("makes 'rest of day' run to the end of a sensible evening", () => {
    const r = resolveWindow({ start: "now", duration: "rest_of_day" }, NOW);
    expect(r.ok && r.window.endMin).toBe(22 * 60 + 30);
  });

  it("starts a later part of the day no earlier than that part", () => {
    const afternoon = resolveWindow({ start: "afternoon", duration: "1-2h" }, at("2026-10-02T08:00:00Z")); // 09:00
    expect(afternoon.ok && afternoon.window.startMin).toBe(14 * 60);
    const evening = resolveWindow({ start: "evening", duration: "1-2h" }, at("2026-10-02T08:00:00Z"));
    expect(evening.ok && evening.window.startMin).toBe(18 * 60);
  });

  it("never starts in the past: 'this afternoon' asked at 4pm starts at 4pm", () => {
    const r = resolveWindow({ start: "afternoon", duration: "1-2h" }, at("2026-10-02T15:00:00Z")); // 16:00
    expect(r.ok && r.window.startMin).toBe(16 * 60);
  });

  it("clips to the end of the day rather than planning past it", () => {
    const evening = resolveWindow({ start: "evening", duration: "half_day" }, NOW); // 18:00 + 4h would be 22:00 — fits
    expect(evening.ok && evening.window.endMin).toBeLessThanOrEqual(22 * 60 + 30);
    const late = resolveWindow({ start: "now", duration: "half_day" }, at("2026-10-02T19:30:00Z")); // 20:30
    expect(late.ok && late.window.availableMinutes).toBe(120);
  });

  it("says plainly when it is too late for anything", () => {
    const r = resolveWindow({ start: "now", duration: "1-2h" }, at("2026-10-02T21:50:00Z")); // 22:50
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/too late/);
  });

  it("carries the date, and a floor below which a suggestion is not worth making", () => {
    const r = resolveWindow({ start: "now", duration: "half_day" }, NOW);
    expect(r.ok && r.window.date).toBe("2026-10-02");
    expect(r.ok && r.window.minUsefulMinutes).toBe(120);
    const short = resolveWindow({ start: "now", duration: "30m" }, NOW);
    expect(short.ok && short.window.minUsefulMinutes).toBe(15);
  });
});

describe("labels", () => {
  it("formats clock times and durations", () => {
    expect(clockLabel(14 * 60 + 5)).toBe("14:05");
    expect(clockLabel(25 * 60)).toBe("01:00");
    expect(durationLabel(30)).toBe("30 min");
    expect(durationLabel(60)).toBe("1 hour");
    expect(durationLabel(90)).toBe("1 hour 30 min");
    expect(durationLabel(120)).toBe("2 hours");
  });
});

describe("resolveWindow — until the next plan", () => {
  // 13:07 London on Friday 2 October 2026; starts 13:10.
  const NOW_BST = new Date("2026-10-02T12:07:00Z");

  it("is the time up to the next thing, ready to be back for it", () => {
    const r = resolveWindow({ start: "now", duration: "until_next", untilMin: 17 * 60 }, NOW_BST);
    expect(r.ok && r.window.endMin).toBe(17 * 60);
    expect(r.ok && r.window.availableMinutes).toBe(17 * 60 - (13 * 60 + 10));
  });

  it("says plainly when there is no real gap before the next plan", () => {
    const r = resolveWindow({ start: "now", duration: "until_next", untilMin: 13 * 60 + 25 }, NOW_BST);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not enough time before your next plan/);
  });

  it("never runs past a sensible end of day, or beyond ten hours", () => {
    const late = resolveWindow({ start: "now", duration: "until_next", untilMin: 23 * 60 + 30 }, NOW_BST);
    expect(late.ok && late.window.endMin).toBeLessThanOrEqual(22 * 60 + 30);
    const morning = resolveWindow({ start: "now", duration: "until_next", untilMin: 22 * 60 }, new Date("2026-10-02T06:00:00Z"));
    expect(morning.ok && morning.window.availableMinutes).toBeLessThanOrEqual(600);
  });
});
