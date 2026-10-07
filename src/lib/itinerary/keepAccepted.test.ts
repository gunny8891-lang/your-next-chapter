import { describe, expect, it } from "vitest";
import { newItemsAround, splitForRebuild, type ExistingItem, type GeneratedItem } from "@/lib/itinerary/keepAccepted";

const existing = (id: string, activity: string, day: string, slot: string, action: string): ExistingItem => ({ id, activity_id: activity, day_of_week: day, slot, member_action: action });
const generated = (activity: string, day: string, slot: string): GeneratedItem => ({ activity_id: activity, day, slot, rationale: "why" });

describe("what a rebuild may replace", () => {
  it("keeps only what the member said yes to", () => {
    const { kept, replaceable } = splitForRebuild([
      existing("1", "a", "Mon", "morning", "accepted"),
      existing("2", "b", "Tue", "morning", "pending"),
      existing("3", "c", "Wed", "afternoon", "skipped"),
      existing("4", "d", "Thu", "morning", "swapped"),
      existing("5", "e", "Fri", "morning", "accepted"),
    ]);
    expect(kept.map((i) => i.id)).toEqual(["1", "5"]);
    expect(replaceable.map((i) => i.id)).toEqual(["2", "3", "4"]);
  });

  it("replaces everything when nothing has been agreed to, and nothing when everything has", () => {
    expect(splitForRebuild([existing("1", "a", "Mon", "morning", "pending")]).kept).toEqual([]);
    expect(splitForRebuild([existing("1", "a", "Mon", "morning", "accepted")]).replaceable).toEqual([]);
    expect(splitForRebuild([])).toEqual({ kept: [], replaceable: [] });
  });
});

describe("what may be added around the outings kept", () => {
  const kept = [existing("1", "ham-house", "Wed", "morning", "accepted")];

  it("never goes into a day and time of day a kept outing already holds", () => {
    const added = newItemsAround([generated("x", "Wed", "morning"), generated("y", "Wed", "afternoon"), generated("z", "Thu", "morning")], kept);
    expect(added.map((i) => i.activity_id)).toEqual(["y", "z"]);
  });

  it("never offers an outing the member already said yes to a second time", () => {
    const added = newItemsAround([generated("ham-house", "Fri", "morning"), generated("other", "Fri", "afternoon")], kept);
    expect(added.map((i) => i.activity_id)).toEqual(["other"]);
  });

  it("never puts the same activity in twice among the new ones", () => {
    const added = newItemsAround([generated("p", "Mon", "morning"), generated("p", "Tue", "morning"), generated("q", "Wed", "afternoon")], kept);
    expect(added.map((i) => i.activity_id)).toEqual(["p", "q"]);
  });

  it("with nothing kept, adds everything that was generated", () => {
    const all = [generated("a", "Mon", "morning"), generated("b", "Tue", "morning")];
    expect(newItemsAround(all, [])).toEqual(all);
  });

  it("with everything taken, adds nothing", () => {
    expect(newItemsAround([generated("a", "Wed", "morning")], kept)).toEqual([]);
  });
});
