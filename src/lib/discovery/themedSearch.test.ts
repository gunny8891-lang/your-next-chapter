import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchRegionsThrottled, themedRequests } from "@/lib/discovery/regional";
import { createClaudeWebSearchSource, themedSystemPrompt } from "@/lib/discovery/sources/claudeWebSearch";
import { DISCOVERY_THEMES, isThemedKey, THEME_REFRESH_DAYS, themeByKey, themedKey } from "@/lib/discovery/themes";
import { BASE_REFRESH_DAYS, decideSearch, nearestRegion, type RegionState } from "@/lib/discovery/throttle";

const STEVENAGE = { lat: 51.9017, lng: -0.2027 };
const DAY = 86_400_000;
const NOW = new Date("2026-10-09T20:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const state = (key: string, label: string, over: Partial<RegionState> = {}): RegionState & { lat?: number | null; lng?: number | null } => ({
  region_key: key,
  region_label: label,
  last_attempt_at: ago(2 * DAY),
  last_success_at: ago(2 * DAY),
  empty_runs: 0,
  consecutive_failures: 0,
  ...over,
});

function fakeDb(rows: ReturnType<typeof state>[]) {
  const upserts: Record<string, unknown>[] = [];
  const updates: { value: Record<string, unknown> }[] = [];
  const db = {
    from: () => ({
      select: () => Promise.resolve({ data: rows, error: null }),
      upsert: (value: Record<string, unknown>) => (upserts.push(value), Promise.resolve({ error: null })),
      update: (value: Record<string, unknown>) => (updates.push({ value }), { eq: () => Promise.resolve({ error: null }) }),
    }),
  } as unknown as SupabaseClient;
  return { db, upserts, updates };
}

const found = { results: [{ source: "x", found: 4, inserted: 4, insertedActive: 2, skippedExisting: 0, errors: [] as string[] }], pending: [] };

describe("the focused searches", () => {
  it("each ask for one kind of thing, and between them cover groups, walking, fitness, creative, volunteering and events", () => {
    expect(DISCOVERY_THEMES.map((t) => t.key)).toEqual(["groups", "walking", "fitness", "creative", "volunteering", "entertainment", "events"]);
    expect(themeByKey("groups")?.focus).toMatch(/U3A/);
    expect(themeByKey("walking")?.focus).toMatch(/Walking for Health/);
    expect(themeByKey("fitness")?.focus).toMatch(/walking football/);
    expect(themeByKey("volunteering")?.focus).toMatch(/befriending/);
    expect(themeByKey("nope")).toBeUndefined();
  });

  it("name no place, so the same searches serve every town", () => {
    for (const t of DISCOVERY_THEMES) expect(`${t.label} ${t.focus}`).not.toMatch(/stevenage|barnet|hertfordshire|richmond/i);
  });

  it("ask the model to read the organiser's own page, to never invent, and to leave unknowns unknown", () => {
    const prompt = themedSystemPrompt(themeByKey("groups")!);
    expect(prompt).toContain("web_fetch");
    expect(prompt).toMatch(/never invented/);
    expect(prompt).toMatch(/rather than guessing/);
    expect(prompt).toContain("sourceUrl");
    expect(prompt).toContain('{"items": []}');
    // A group that meets weekly is not one dated event.
    expect(prompt).toMatch(/leave dateTime null/);
  });

  it("is refused for a theme that does not exist, rather than silently searching generally for a lot of money", () => {
    expect(() => createClaudeWebSearchSource(["Stevenage"], { theme: "nonsense" })).toThrow(/Unknown discovery theme/);
    expect(createClaudeWebSearchSource(["Stevenage"], { theme: "walking" }).name).toBe("claude-web-search:walking");
    expect(createClaudeWebSearchSource(["Stevenage"]).name).toBe("claude-web-search");
  });
});

describe("how often a focused search is repeated", () => {
  it("is less often than the general search, since groups change slowly", () => {
    expect(THEME_REFRESH_DAYS).toBeGreaterThan(BASE_REFRESH_DAYS);
    const searched = state("stevenage#groups", "Stevenage", { last_success_at: ago(10 * DAY), last_attempt_at: ago(10 * DAY) });
    expect(decideSearch(searched, NOW).due).toBe(true); // general: due after a week
    expect(decideSearch(searched, NOW, THEME_REFRESH_DAYS).due).toBe(false); // focused: not for a month
    expect(decideSearch({ ...searched, last_success_at: ago(31 * DAY), last_attempt_at: ago(31 * DAY) }, NOW, THEME_REFRESH_DAYS).due).toBe(true);
  });

  it("still backs off after a search that found nothing", () => {
    const empty = state("stevenage#groups", "Stevenage", { last_success_at: ago(35 * DAY), last_attempt_at: ago(35 * DAY), empty_runs: 1 });
    expect(decideSearch(empty, NOW, THEME_REFRESH_DAYS).due).toBe(false); // doubled to 60 days
  });
});

describe("asking for focused searches of a place", () => {
  it("is one request per theme, for the same place", () => {
    const requests = themedRequests({ label: "Stevenage", ...STEVENAGE });
    expect(requests.map((r) => r.theme)).toEqual(DISCOVERY_THEMES.map((t) => t.key));
    expect(requests.every((r) => r.label === "Stevenage" && r.lat === STEVENAGE.lat)).toBe(true);
  });

  it("is searched once for each theme, by the place's name, and each is remembered on its own", async () => {
    const { db, upserts, updates } = fakeDb([{ ...state("stevenage", "Stevenage"), ...STEVENAGE }]);
    const asked: [string, string | undefined][] = [];
    const summary = await searchRegionsThrottled(db, themedRequests({ label: "SG1 1XX", ...STEVENAGE }), {
      runSearch: async (region, theme) => (asked.push([region, theme]), found),
      now: NOW,
      maxSearches: 10,
    });
    expect(asked).toEqual(DISCOVERY_THEMES.map((t) => ["Stevenage", t.key]));
    expect(summary.searched).toHaveLength(DISCOVERY_THEMES.length);
    expect(upserts.map((u) => u.region_key)).toEqual(DISCOVERY_THEMES.map((t) => `stevenage#${t.key}`));
    expect(updates.every((u) => u.value.last_success_at)).toBe(true);
  });

  it("does not record a position for a focused search, which would let it be taken for the place itself", async () => {
    const { db, upserts } = fakeDb([{ ...state("stevenage", "Stevenage"), ...STEVENAGE }]);
    await searchRegionsThrottled(db, themedRequests({ label: "Stevenage", ...STEVENAGE }).slice(0, 1), {
      runSearch: async () => found,
      now: NOW,
    });
    expect(upserts[0]).not.toHaveProperty("lat");
    expect(upserts[0]).not.toHaveProperty("lng");
  });

  it("never leaves the place's own throttle in the hands of a focused search", () => {
    const rows = [{ ...state("stevenage", "Stevenage"), ...STEVENAGE }, { ...state("stevenage#groups", "Stevenage"), ...STEVENAGE }];
    const places = rows.filter((r) => !isThemedKey(r.region_key));
    expect(nearestRegion(places, STEVENAGE)?.region_key).toBe("stevenage");
  });

  it("skips a focused search done recently, and runs only the ones due", async () => {
    const rows = [
      { ...state("stevenage", "Stevenage"), ...STEVENAGE },
      state("stevenage#groups", "Stevenage", { last_success_at: ago(5 * DAY), last_attempt_at: ago(5 * DAY) }),
      state("stevenage#walking", "Stevenage", { last_success_at: ago(40 * DAY), last_attempt_at: ago(40 * DAY) }),
    ];
    const { db } = fakeDb(rows);
    const asked: (string | undefined)[] = [];
    const summary = await searchRegionsThrottled(db, themedRequests({ label: "Stevenage", ...STEVENAGE }), {
      runSearch: async (_r, theme) => (asked.push(theme), found),
      now: NOW,
      maxSearches: 10,
    });
    expect(asked).not.toContain("groups");
    expect(asked).toContain("walking");
    expect(summary.skipped.map((s) => s.region)).toContain("Stevenage (groups)");
  });

  it("is limited by maxSearches, with the rest deferred and named", async () => {
    const { db } = fakeDb([{ ...state("stevenage", "Stevenage"), ...STEVENAGE }]);
    const summary = await searchRegionsThrottled(db, themedRequests({ label: "Stevenage", ...STEVENAGE }), { runSearch: async () => found, now: NOW, maxSearches: 2 });
    expect(summary.searched).toHaveLength(2);
    expect(summary.deferred).toHaveLength(DISCOVERY_THEMES.length - 2);
    expect(summary.deferred[0]).toMatch(/^Stevenage \(/);
  });

  it("keeps its key apart from the place's", () => {
    expect(themedKey("stevenage", "groups")).toBe("stevenage#groups");
    expect(isThemedKey("stevenage#groups")).toBe(true);
    expect(isThemedKey("stevenage")).toBe(false);
  });
});
