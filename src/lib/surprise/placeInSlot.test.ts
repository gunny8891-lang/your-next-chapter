import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { placeOpenTimeChoice, resolveToday } from "@/lib/surprise/placeInSlot";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

/** Just enough of the Supabase query builder for the calls placeOpenTimeChoice makes. */
function fakeClient(store: Store, options: { failInsertOn?: string } = {}): SupabaseClient {
  let counter = 0;
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let pendingInsert: Row | null = null;
    const matching = () => (store[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const run = () => {
      if (pendingInsert) {
        if (options.failInsertOn === table) return { data: null, error: { message: `insert into ${table} failed` } };
        const row = { id: `${table}-${++counter}`, ...pendingInsert };
        (store[table] ??= []).push(row);
        return { data: [row], error: null };
      }
      return { data: matching(), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => (filters.push([c, v]), api),
      limit: () => api,
      insert: (row: Row) => ((pendingInsert = row), api),
      upsert: (row: Row, opts: { onConflict: string }) => {
        const keys = opts.onConflict.split(",");
        const existing = (store[table] ?? []).find((r) => keys.every((k) => r[k] === row[k]));
        if (existing) filters.push(...keys.map((k) => [k, row[k]] as [string, unknown]));
        else pendingInsert = row;
        return api;
      },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      single: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return api;
  };
  return { from: builder } as unknown as SupabaseClient;
}

const MEMBER = "member-1";
const ACTIVITY = "activity-1";
// Friday 2 October 2026 at midday: week of Mon 28 Sep.
const NOW = new Date("2026-10-02T12:00:00Z");

const newStore = (): Store => ({
  activities: [{ id: ACTIVITY, title: "Finchley Lido" }],
  itineraries: [],
  itinerary_items: [],
  preference_signals: [],
});

describe("resolveToday", () => {
  it("gives London's day and the Monday of its week", () => {
    expect(resolveToday(NOW)).toEqual({ weekStart: "2026-09-28", day: "Fri" });
  });

  it("is already Monday just after midnight in British Summer Time, while UTC is still Sunday", () => {
    // 23:30 UTC on Sunday 5 Jul is 00:30 on Monday 6 Jul in London.
    expect(resolveToday(new Date("2026-07-05T23:30:00Z"))).toEqual({ weekStart: "2026-07-06", day: "Mon" });
  });
});

describe("placeOpenTimeChoice", () => {
  it("puts the choice into today's slot as an accepted item, and records the signal", async () => {
    const store = newStore();
    store.itineraries.push({ id: "it-1", member_id: MEMBER, week_start_date: "2026-09-28" });
    const client = fakeClient(store);

    const result = await placeOpenTimeChoice(client, client, MEMBER, ACTIVITY, "afternoon", NOW);

    expect(result).toEqual({ error: null });
    expect(store.itinerary_items).toEqual([
      expect.objectContaining({ itinerary_id: "it-1", activity_id: ACTIVITY, day_of_week: "Fri", slot: "afternoon", member_action: "accepted" }),
    ]);
    expect(store.preference_signals).toEqual([
      expect.objectContaining({ member_id: MEMBER, activity_id: ACTIVITY, signal_type: "liked", source: "surprise_me_response" }),
    ]);
  });

  it("starts this week's plan when the member has none yet", async () => {
    const store = newStore();
    const client = fakeClient(store);

    const result = await placeOpenTimeChoice(client, client, MEMBER, ACTIVITY, "morning", NOW);

    expect(result.error).toBeNull();
    expect(store.itineraries).toEqual([expect.objectContaining({ member_id: MEMBER, week_start_date: "2026-09-28" })]);
    expect(store.itinerary_items).toHaveLength(1);
  });

  it("never overwrites a slot that already has something in it", async () => {
    const store = newStore();
    store.itineraries.push({ id: "it-1", member_id: MEMBER, week_start_date: "2026-09-28" });
    store.itinerary_items.push({ id: "x", itinerary_id: "it-1", day_of_week: "Fri", slot: "afternoon", activity_id: "other" });
    const client = fakeClient(store);

    const result = await placeOpenTimeChoice(client, client, MEMBER, ACTIVITY, "afternoon", NOW);

    expect(result.error).toMatch(/already planned/);
    expect(store.itinerary_items).toHaveLength(1);
    expect(store.preference_signals).toHaveLength(0);
  });

  it("uses a free slot on the same day even when another slot is taken", async () => {
    const store = newStore();
    store.itineraries.push({ id: "it-1", member_id: MEMBER, week_start_date: "2026-09-28" });
    store.itinerary_items.push({ id: "x", itinerary_id: "it-1", day_of_week: "Fri", slot: "morning", activity_id: "other" });
    const client = fakeClient(store);

    expect((await placeOpenTimeChoice(client, client, MEMBER, ACTIVITY, "evening", NOW)).error).toBeNull();
    expect(store.itinerary_items).toHaveLength(2);
  });

  it("refuses an activity the member can't see (not active, or doesn't exist)", async () => {
    const store = newStore();
    const client = fakeClient(store);

    const result = await placeOpenTimeChoice(client, client, MEMBER, "no-such-activity", "morning", NOW);

    expect(result.error).toMatch(/isn't available/);
    expect(store.itineraries).toHaveLength(0);
    expect(store.itinerary_items).toHaveLength(0);
  });

  it("only touches the requesting member's plan", async () => {
    const store = newStore();
    store.itineraries.push({ id: "someone-elses", member_id: "member-2", week_start_date: "2026-09-28" });
    const client = fakeClient(store);

    await placeOpenTimeChoice(client, client, MEMBER, ACTIVITY, "morning", NOW);

    expect(store.itinerary_items).toEqual([expect.not.objectContaining({ itinerary_id: "someone-elses" })]);
    expect(store.itineraries).toHaveLength(2);
  });

  it("reports a failed write rather than claiming success", async () => {
    const store = newStore();
    store.itineraries.push({ id: "it-1", member_id: MEMBER, week_start_date: "2026-09-28" });
    const client = fakeClient(store, { failInsertOn: "itinerary_items" });

    const result = await placeOpenTimeChoice(client, client, MEMBER, ACTIVITY, "morning", NOW);

    expect(result.error).toMatch(/failed/);
    expect(store.preference_signals).toHaveLength(0);
  });
});
