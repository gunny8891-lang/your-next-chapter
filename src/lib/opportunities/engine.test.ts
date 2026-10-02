import { describe, expect, it } from "vitest";
import { selectBalanced } from "@/lib/opportunities/engine";

const item = (category: string, rank: number) => ({ category, rank });

describe("selectBalanced", () => {
  it("lets every category in even when one dominates the ranking", () => {
    const ranked = [...Array.from({ length: 20 }, (_, i) => item("Joy", i)), item("Move", 20), item("Learn", 21)];
    const picked = selectBalanced(ranked, 8, 2);
    expect(picked).toHaveLength(8);
    expect(picked.some((x) => x.category === "Move")).toBe(true);
    expect(picked.some((x) => x.category === "Learn")).toBe(true);
  });

  it("keeps the original rank order", () => {
    const ranked = [item("Joy", 0), item("Joy", 1), item("Move", 2), item("Joy", 3), item("Learn", 4)];
    const picked = selectBalanced(ranked, 4, 1);
    const ranks = picked.map((x) => x.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("returns a short list whole", () => {
    expect(selectBalanced([item("Joy", 0), item("Move", 1)], 8, 2)).toHaveLength(2);
  });

  it("never exceeds the limit, even if the per-category floors would", () => {
    const ranked = ["A", "B", "C", "D", "E"].flatMap((c) => [item(c, 0), item(c, 1), item(c, 2)]);
    expect(selectBalanced(ranked, 6, 3)).toHaveLength(6);
  });
});
