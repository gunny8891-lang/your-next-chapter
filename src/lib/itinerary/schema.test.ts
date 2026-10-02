import { describe, expect, it } from "vitest";
import { validateGeneratedItinerary } from "@/lib/itinerary/schema";

const candidates = [
  { id: "m1", category: "Move" },
  { id: "m2", category: "Move" },
  { id: "m3", category: "Move" },
  { id: "l1", category: "Learn" },
  { id: "c1", category: "Connect" },
  { id: "e1", category: "Explore" },
  { id: "j1", category: "Joy" },
];

const item = (activity_id: string, day = "Mon", slot = "morning") => ({ day, slot, activity_id, rationale: "Because." });

const goodWeek = [item("m1", "Mon"), item("l1", "Tue"), item("c1", "Wed"), item("e1", "Thu"), item("j1", "Fri")];

describe("validateGeneratedItinerary", () => {
  it("accepts a balanced week of real candidates", () => {
    expect(validateGeneratedItinerary({ items: goodWeek }, candidates).ok).toBe(true);
  });

  it("rejects the wrong number of items", () => {
    expect(validateGeneratedItinerary({ items: goodWeek.slice(0, 3) }, candidates).ok).toBe(false);
  });

  it("rejects an activity that was not a candidate", () => {
    const result = validateGeneratedItinerary({ items: [...goodWeek.slice(0, 4), item("invented")] }, candidates);
    expect(result.ok).toBe(false);
  });

  it("rejects more than two items from one category", () => {
    const heavy = [item("m1", "Mon"), item("m2", "Tue"), item("m3", "Wed"), item("l1", "Thu"), item("c1", "Fri")];
    expect(validateGeneratedItinerary({ items: heavy }, candidates).ok).toBe(false);
  });

  it("rejects a week covering fewer than four categories", () => {
    const narrow = [item("m1", "Mon"), item("m2", "Tue"), item("l1", "Wed"), item("l1", "Thu"), item("c1", "Fri")];
    expect(validateGeneratedItinerary({ items: narrow }, candidates).ok).toBe(false);
  });

  it("rejects an invalid day or slot", () => {
    expect(validateGeneratedItinerary({ items: [item("m1", "Funday"), ...goodWeek.slice(1)] }, candidates).ok).toBe(false);
    expect(validateGeneratedItinerary({ items: [item("m1", "Mon", "midnight"), ...goodWeek.slice(1)] }, candidates).ok).toBe(false);
  });
});
