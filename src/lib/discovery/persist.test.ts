import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistDiscovery } from "@/lib/discovery/run";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";

/**
 * A real batch of OpenStreetMap places lost every row because some carried a dog tag and some did not: rows in one
 * insert that have different columns are filled with null for the missing ones (not with the column's default), and
 * dog_access cannot be null. This stands in for the database and checks what would have been sent.
 */
function fakeDb(captured: { rows: Record<string, unknown>[] }) {
  return {
    from() {
      const select = {
        select: () => select,
        in: () => Promise.resolve({ data: [], error: null }),
      };
      return {
        ...select,
        insert: (rows: Record<string, unknown>[]) => {
          captured.rows = rows;
          return Promise.resolve({ error: null, count: rows.length });
        },
      };
    },
  } as unknown as SupabaseClient;
}

const candidate = (title: string, extra: Partial<RawActivityCandidate> = {}): RawActivityCandidate => ({
  title,
  description: null,
  category: "Explore",
  address: null,
  locationLat: 51.9,
  locationLng: -0.2,
  dateTime: null,
  priceEstimate: null,
  bookingUrl: `https://example.org/${title.replace(/\s+/g, "-")}`,
  tags: ["park"],
  status: "active",
  ...extra,
});

const source = (items: RawActivityCandidate[]): DiscoverySource => ({ name: "test", fetchCandidates: async () => items });

describe("saving discovered places", () => {
  it("sends every row with the same columns, whether or not a place said anything about dogs", async () => {
    const captured = { rows: [] as Record<string, unknown>[] };
    const dog = { access: "allowed" as const, restrictions: "on a lead", confidence: "reported" as const, source: "OpenStreetMap contributors (dog=leashed): https://www.openstreetmap.org/way/1" };
    await persistDiscovery(fakeDb(captured), [source([candidate("Knebworth Park", { dog }), candidate("Fairlands Valley Park"), candidate("Hitchin Lavender", { priceEstimate: 6 })])]);

    expect(captured.rows).toHaveLength(3);
    const keys = captured.rows.map((r) => Object.keys(r).sort().join(","));
    expect(new Set(keys).size).toBe(1);
  });

  it("says unknown, never null, where nothing was said about dogs, and keeps what was said where it was", async () => {
    const captured = { rows: [] as Record<string, unknown>[] };
    const dog = { access: "allowed" as const, restrictions: "on a lead", confidence: "reported" as const, source: "OpenStreetMap contributors (dog=leashed): https://www.openstreetmap.org/way/1" };
    await persistDiscovery(fakeDb(captured), [source([candidate("With Dogs", { dog }), candidate("Without")])]);
    const by = Object.fromEntries(captured.rows.map((r) => [r.title as string, r]));
    expect(by["With Dogs"]).toMatchObject({ dog_access: "allowed", dog_restrictions: "on a lead", dog_confidence: "reported" });
    expect(by["Without"]).toMatchObject({ dog_access: "unknown", dog_restrictions: null, dog_confidence: "unknown", dog_source: null });
  });

  it("records a price found by a search as an estimate and no price as unknown, in every row", async () => {
    const captured = { rows: [] as Record<string, unknown>[] };
    await persistDiscovery(fakeDb(captured), [source([candidate("Free One", { priceEstimate: 0 }), candidate("Paid One", { priceEstimate: 8 }), candidate("Unknown One")])]);
    const by = Object.fromEntries(captured.rows.map((r) => [r.title as string, r]));
    expect(by["Free One"]).toMatchObject({ price_type: "free", cost_confidence: "estimated" });
    expect(by["Paid One"]).toMatchObject({ price_type: "entry", cost_confidence: "estimated" });
    expect(by["Unknown One"]).toMatchObject({ price_type: "unknown", cost_confidence: "unknown" });
  });
});

describe("the paid regional search", () => {
  it("has room to finish its answer: 8,192 tokens ran out for Chelmsford, then Stevenage", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/discovery/sources/claudeWebSearch.ts"), "utf8");
    const limit = Number(source.match(/const MAX_TOKENS = (\d+);/)?.[1]);
    expect(limit).toBeGreaterThanOrEqual(16384);
    // Non-streaming calls are refused above roughly 21,000 tokens, so this is as high as it can go without changing how it is called.
    expect(limit).toBeLessThan(21000);
  });
});
