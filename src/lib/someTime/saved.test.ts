import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSavedIdeas, toSavedIdeas } from "@/lib/someTime/saved";

const activity = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  title: "Kenwood House",
  category: "Explore",
  address: "Hampstead Lane, Hampstead, NW3 7JR",
  price_estimate: 0,
  tags: ["heritage", "walking", "outdoors"],
  status: "active",
  ...over,
});

describe("toSavedIdeas", () => {
  it("maps a saved row, working out indoors or outdoors from its tags", () => {
    expect(toSavedIdeas([{ activities: activity() }])).toEqual([
      { id: "a1", title: "Kenwood House", category: "Explore", address: "Hampstead Lane, Hampstead, NW3 7JR", priceEstimate: 0, setting: "outdoors" },
    ]);
  });

  it("accepts the joined activity as a one-item array, as the database client can return it", () => {
    expect(toSavedIdeas([{ activities: [activity({ id: "b2" })] }]).map((i) => i.id)).toEqual(["b2"]);
  });

  it("drops ideas that can no longer be done, and rows whose activity is gone", () => {
    const rows = [{ activities: activity({ id: "keep" }) }, { activities: activity({ id: "gone", status: "removed" }) }, { activities: null }];
    expect(toSavedIdeas(rows).map((i) => i.id)).toEqual(["keep"]);
  });

  it("keeps the order it was given (newest first)", () => {
    const rows = [{ activities: activity({ id: "new" }) }, { activities: activity({ id: "old" }) }];
    expect(toSavedIdeas(rows).map((i) => i.id)).toEqual(["new", "old"]);
  });
});

describe("loadSavedIdeas", () => {
  function client(result: { data?: unknown; error?: { message: string } | null }) {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "order", "limit"]) chain[op] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null });
    return { from: () => chain } as unknown as SupabaseClient;
  }

  it("returns the list", async () => {
    const ideas = await loadSavedIdeas(client({ data: [{ activities: activity() }] }), "m1");
    expect(ideas).toHaveLength(1);
  });

  it("returns an empty list, rather than failing, when the read fails (the table not there yet)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadSavedIdeas(client({ error: { message: 'relation "saved_ideas" does not exist' } }), "m1")).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
