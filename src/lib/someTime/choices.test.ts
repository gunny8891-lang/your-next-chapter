import { describe, expect, it } from "vitest";
import { availableStarts, DURATION_OPTIONS, MOOD_OPTIONS, nextCommitment, startLabel, summaryLine, untilOption } from "@/lib/someTime/choices";

const at = (h: number, m = 0) => h * 60 + m;

describe("the questions", () => {
  it("offers the four lengths of time the brief names", () => {
    expect(DURATION_OPTIONS.map((d) => d.label)).toEqual(["30 mins", "1–2 hours", "Half a day", "Rest of today"]);
  });

  it("offers Surprise me first, then the ways to steer it", () => {
    expect(MOOD_OPTIONS.map((m) => m.label)).toEqual(["Surprise me", "Outdoors", "Food", "Culture", "Social", "Relaxed"]);
  });
});

describe("availableStarts", () => {
  it("only offers the parts of today that are still ahead", () => {
    expect(availableStarts(9).map((s) => s.value)).toEqual(["now", "afternoon", "evening"]);
    expect(availableStarts(17).map((s) => s.value)).toEqual(["now", "evening"]);
    expect(availableStarts(21).map((s) => s.value)).toEqual(["now"]);
  });
});

describe("nextCommitment", () => {
  const items = [
    { title: "Tennis", time: "17:00" },
    { title: "Coffee with David", time: "11:30" },
    { title: "Book club", time: "Evening" },
  ];

  it("is the earliest planned thing with a clock time that is still to come", () => {
    expect(nextCommitment(items, at(9))).toEqual({ title: "Coffee with David", startMin: at(11, 30) });
    expect(nextCommitment(items, at(12))).toEqual({ title: "Tennis", startMin: at(17) });
  });

  it("ignores things already under way or past", () => {
    expect(nextCommitment(items, at(17))).toBeNull();
  });

  it("ignores things with no clock time, and things the member skipped", () => {
    expect(nextCommitment([{ title: "Book club", time: "Evening" }], at(9))).toBeNull();
    expect(nextCommitment([{ title: "Tennis", time: "17:00", skipped: true }], at(9))).toBeNull();
  });

  it("is null for an empty day", () => {
    expect(nextCommitment([], at(9))).toBeNull();
  });
});

describe("untilOption", () => {
  const tennis = { title: "Tennis", startMin: at(17) };

  it("offers 'Until Tennis' when there is a sensible gap, with when to be back", () => {
    expect(untilOption(tennis, at(14))).toEqual({ label: "Until Tennis", hint: "Back by 17:00", untilMin: at(17) });
  });

  it("does not offer it when the gap is too short to do anything", () => {
    expect(untilOption(tennis, at(16, 30))).toBeNull();
  });

  it("does not offer it when the gap is so long that Rest of today says the same", () => {
    expect(untilOption({ title: "Dinner", startMin: at(21) }, at(9))).toBeNull();
  });

  it("is null with nothing to be back for", () => {
    expect(untilOption(null, at(9))).toBeNull();
  });

  it("shortens a very long title rather than overflowing a button", () => {
    const long = untilOption({ title: "An extremely long title for a planned thing", startMin: at(17) }, at(14))!;
    expect(long.label.length).toBeLessThanOrEqual("Until ".length + 28);
    expect(long.label.endsWith("…")).toBe(true);
  });
});

describe("summaryLine", () => {
  it("sums up the answers so far", () => {
    expect(summaryLine({ duration: "1-2h", start: "now" })).toBe("1–2 hours · Starting now");
    expect(summaryLine({ duration: "half_day", start: "afternoon", mood: "culture" })).toBe("Half a day · This afternoon · Culture");
  });

  it("does not mention a mood of 'surprise me' — that is the absence of one", () => {
    expect(summaryLine({ duration: "30m", start: "now", mood: "surprise" })).toBe("30 mins · Starting now");
  });

  it("says 'Until 17:00' for the time before the next plan", () => {
    expect(summaryLine({ duration: "until_next", untilMin: at(17), start: "now" })).toBe("Until 17:00 · Starting now");
  });

  it("names the start", () => {
    expect(startLabel("evening")).toBe("This evening");
  });
});
