import { describe, expect, it } from "vitest";
import { slotsForWindow } from "@/lib/someTime/slots";

const at = (h: number, m = 0) => h * 60 + m;

describe("slotsForWindow", () => {
  it("is the one part of the day a short outing sits in", () => {
    expect(slotsForWindow({ startMin: at(14), endMin: at(16) })).toEqual(["afternoon"]);
    expect(slotsForWindow({ startMin: at(9), endMin: at(10, 30) })).toEqual(["morning"]);
    expect(slotsForWindow({ startMin: at(18), endMin: at(20) })).toEqual(["evening"]);
  });

  it("covers every part of the day a longer stretch spans, in order", () => {
    expect(slotsForWindow({ startMin: at(13), endMin: at(17, 10) })).toEqual(["afternoon", "evening"]);
    expect(slotsForWindow({ startMin: at(9), endMin: at(22) })).toEqual(["morning", "afternoon", "evening"]);
  });

  it("does not spill into the next slot when the window ends exactly on the boundary", () => {
    expect(slotsForWindow({ startMin: at(15), endMin: at(17) })).toEqual(["afternoon"]);
  });

  it("puts a one-off event in the part of the day it happens in, whatever the window", () => {
    expect(slotsForWindow({ startMin: at(9), endMin: at(22) }, at(19, 30))).toEqual(["evening"]);
    expect(slotsForWindow({ startMin: at(9), endMin: at(22) }, at(10))).toEqual(["morning"]);
  });
});
