import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  engagementCounts,
  hostOf,
  isOrganiserHost,
  ORGANISER_POOL,
  ORGANISERS_PER_RUN,
  rankOrganisers,
  refreshOrganisers,
  type Organiser,
  type OrganiserRow,
} from "@/lib/discovery/organisers";
import { candidatesFromAnswer, organiserSystemPrompt, uniqueUrls } from "@/lib/discovery/sources/organiserPage";
import { searchRegionsThrottled } from "@/lib/discovery/regional";
import { ORGANISER_THEME, refreshDaysFor, THEME_REFRESH_DAYS } from "@/lib/discovery/themes";
import type { RegionState } from "@/lib/discovery/throttle";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const NOW = new Date("2026-10-17T05:00:00Z");
const DAY = 86_400_000;

const row = (id: string, url: string, over: Partial<OrganiserRow> = {}): OrganiserRow => ({ id, booking_url: url, date_time: null, expires_at: null, admin_notes: "Auto-discovered by Claude web search", ...over });

describe("which site a link belongs to", () => {
  it("is the host without www, and nothing for what is not an address", () => {
    expect(hostOf("https://www.stevenage.gov.uk/events/walk")).toBe("stevenage.gov.uk");
    expect(hostOf("http://barnet.u3asite.uk/")).toBe("barnet.u3asite.uk");
    for (const bad of ["not a link", "", null, undefined, "https://localhost/x"]) expect(hostOf(bad as never), String(bad)).toBeNull();
  });

  it("is not an organiser when it is a map, a social network, an encyclopaedia or our own fallback link", () => {
    for (const host of ["openstreetmap.org", "www.google.com".replace("www.", ""), "maps.google.com", "facebook.com", "m.facebook.com", "instagram.com", "x.com", "wikipedia.org", "en.wikipedia.org", "search.local"]) {
      expect(isOrganiserHost(host), host).toBe(false);
    }
    for (const host of ["stevenage.gov.uk", "ageuk.org.uk", "nationaltrust.org.uk", "barnet.u3asite.uk"]) expect(isOrganiserHost(host), host).toBe(true);
    expect(isOrganiserHost(null)).toBe(false);
  });
});

describe("what members have shown an interest in", () => {
  it("counts a save, a plan and an outing gone to, and nothing else", () => {
    const counts = engagementCounts([
      { activity_id: "a", event_type: "saved" },
      { activity_id: "a", event_type: "planned" },
      { activity_id: "a", event_type: "completed" },
      { activity_id: "a", event_type: "shown" },
      { activity_id: "a", event_type: "dismissed" },
      { activity_id: "b", event_type: "saved" },
      { activity_id: null, event_type: "saved" },
    ]);
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("which organisers are worth rereading", () => {
  const future = new Date(NOW.getTime() + 10 * DAY).toISOString();
  const past = new Date(NOW.getTime() - 10 * DAY).toISOString();

  it("puts the one members have been interested in first, then the one that gives us the most events", () => {
    const rows = [
      row("1", "https://www.stevenage.gov.uk/events/a", { date_time: future }),
      row("2", "https://www.stevenage.gov.uk/events/b", { date_time: future }),
      row("3", "https://www.stevenage.gov.uk/events/c", { date_time: future }),
      row("4", "https://www.ageuk.org.uk/herts/volunteer"),
      row("5", "https://barnet.u3asite.uk/talks", { date_time: future }),
    ];
    const ranked = rankOrganisers(rows, new Map([["5", 2]]), NOW);
    expect(ranked.map((o) => o.host)).toEqual(["barnet.u3asite.uk", "stevenage.gov.uk", "ageuk.org.uk"]);
    expect(ranked[0]).toMatchObject({ engaged: 2, upcoming: 1 });
    expect(ranked[1]).toMatchObject({ engaged: 0, upcoming: 3, rows: 3 });
  });

  it("starts from the page of the event they liked best, else the latest event, and never from a made-up address", () => {
    const liked = rankOrganisers([row("1", "https://stevenage.gov.uk/events/old", { date_time: past }), row("2", "https://stevenage.gov.uk/events/liked#Walk 2026-10-20")], new Map([["2", 3]]), NOW);
    expect(liked[0].entryUrl).toBe("https://stevenage.gov.uk/events/liked");
    const latest = rankOrganisers([row("1", "https://stevenage.gov.uk/events/earlier", { date_time: past }), row("2", "https://stevenage.gov.uk/events/later", { date_time: future })], new Map(), NOW);
    expect(latest[0].entryUrl).toBe("https://stevenage.gov.uk/events/later");
  });

  it("leaves out venue listings from the map and links that are not an organiser's own", () => {
    const ranked = rankOrganisers(
      [
        row("1", "https://www.openstreetmap.org/node/1", { admin_notes: "Place data from OpenStreetMap (things" }),
        row("2", "https://www.britishgardencentres.com/enfield", { admin_notes: "Place data from OpenStreetMap (garden centres" }),
        row("3", "https://www.facebook.com/somegroup"),
        row("4", "https://search.local/Barnet#Thing"),
        row("5", "https://www.nationaltrust.org.uk/visit/ham-house"),
      ],
      new Map(),
      NOW
    );
    expect(ranked.map((o) => o.host)).toEqual(["nationaltrust.org.uk"]);
  });

  it("puts forward only a dozen at a time", () => {
    const many = Array.from({ length: 30 }, (_, i) => row(String(i), `https://site${i}.example.org/events`));
    expect(rankOrganisers(many, new Map(), NOW)).toHaveLength(ORGANISER_POOL);
    expect(ORGANISER_POOL).toBe(12);
  });
});

describe("rereading them through the same throttle", () => {
  const organisers: Organiser[] = [
    { host: "barnet.u3asite.uk", entryUrl: "https://barnet.u3asite.uk/talks", engaged: 2, upcoming: 1, rows: 3, score: 7 },
    { host: "stevenage.gov.uk", entryUrl: "https://stevenage.gov.uk/events/a", engaged: 0, upcoming: 3, rows: 3, score: 3.6 },
  ];

  it("asks for each organiser by its site name, not as a place, and reads from the page it knows", async () => {
    const searchRegions = vi.fn(async (_db: unknown, requests: { label: string; theme?: string; nameOnly?: boolean }[], options: { runSearch?: (r: string, t?: string) => Promise<unknown>; maxSearches?: number }) => {
      expect(requests).toEqual([
        { label: "barnet.u3asite.uk", theme: ORGANISER_THEME, nameOnly: true },
        { label: "stevenage.gov.uk", theme: ORGANISER_THEME, nameOnly: true },
      ]);
      expect(options.maxSearches).toBe(ORGANISERS_PER_RUN);
      await options.runSearch!("stevenage.gov.uk", ORGANISER_THEME);
      return { searched: [], skipped: [], deferred: [] };
    });
    const source = vi.fn((host: string, entry: string) => ({ name: `organiser:${host}`, fetchCandidates: async () => [{ entry }] as never }));
    const persist = vi.fn(async () => ({ results: [], pending: [] }));
    await refreshOrganisers({} as SupabaseClient, { load: async () => organisers, searchRegions: searchRegions as never, source: source as never, persist: persist as never, now: NOW });
    expect(source).toHaveBeenCalledWith("stevenage.gov.uk", "https://stevenage.gov.uk/events/a");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("leaves one alone that was reread recently, and rereads one that is due, a few a night at most", async () => {
    const state = (host: string, daysAgo: number): RegionState => ({
      region_key: `${host}#${ORGANISER_THEME}`,
      region_label: host,
      last_attempt_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
      last_success_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
      empty_runs: 0,
      consecutive_failures: 0,
    });
    const upserts: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        select: () => Promise.resolve({ data: [state("barnet.u3asite.uk", 3), state("stevenage.gov.uk", 20)], error: null }),
        upsert: (v: Record<string, unknown>) => (upserts.push(v), Promise.resolve({ error: null })),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    } as unknown as SupabaseClient;
    const read: string[] = [];
    const { summary } = await refreshOrganisers(db, {
      load: async () => organisers,
      searchRegions: searchRegionsThrottled,
      source: ((host: string) => ({ name: host, fetchCandidates: async () => (read.push(host), []) })) as never,
      persist: (async (_a: unknown, sources: { fetchCandidates: () => Promise<unknown[]> }[]) => {
        await sources[0].fetchCandidates();
        return { results: [{ source: "x", found: 0, inserted: 0, insertedActive: 0, skippedExisting: 0, errors: [] }], pending: [] };
      }) as never,
      now: NOW,
    });
    expect(read).toEqual(["stevenage.gov.uk"]);
    expect(summary.skipped.map((s) => s.region)).toEqual(["barnet.u3asite.uk (organiser)"]);
    expect(upserts[0]).toMatchObject({ region_key: "stevenage.gov.uk#organiser" });
  });
});

describe("the throttle and how often things come round", () => {
  it("rereads events and organisers every two weeks, and the rest monthly", () => {
    expect(refreshDaysFor("events")).toBe(14);
    expect(refreshDaysFor(ORGANISER_THEME)).toBe(14);
    expect(refreshDaysFor("walking")).toBe(THEME_REFRESH_DAYS);
    expect(read("src/lib/discovery/regional.ts")).toContain("refreshDaysFor(w.theme)");
  });

  it("does not look up a site name as if it were a place", () => {
    const source = read("src/lib/discovery/regional.ts");
    expect(source).toContain("if (!point && !request.nameOnly) {");
  });
});

describe("what is read from an organiser's pages", () => {
  const entry = "https://stevenage.gov.uk/events";
  const answer = (items: unknown[]) => JSON.stringify({ items });
  const item = (over: Record<string, unknown> = {}) => ({ title: "History walk", description: "A guided walk", category: "Explore", address: "Stevenage Museum, SG1 3PQ", dateTime: "2026-11-09T10:00:00Z", sourceUrl: "https://stevenage.gov.uk/events/walk-nov", tags: ["history"], recurring: false, ...over });

  it("asks only to read pages, for events still to come, one entry each with its own page, and never to invent", () => {
    const prompt = organiserSystemPrompt();
    expect(prompt).toContain("web_fetch");
    expect(prompt).not.toContain("web_search");
    expect(prompt).toMatch(/never invented/);
    expect(prompt).toMatch(/next three months/);
    expect(prompt).toMatch(/Leave out anything already past/);
    expect(prompt).toMatch(/its own page as sourceUrl/);
    expect(prompt).toContain('{"items": []}');
  });

  it("keeps real entries, waiting to be checked unless their page and place are confirmed, and says where they came from", () => {
    const [c] = candidatesFromAnswer(answer([item()]), "stevenage.gov.uk", entry);
    expect(c).toMatchObject({ title: "History walk", category: "Explore", dateTime: "2026-11-09T10:00:00Z", bookingUrl: "https://stevenage.gov.uk/events/walk-nov", bookingUrlVerified: true, status: "needs_review" });
    expect(c.adminNotes).toContain("Refreshed from stevenage.gov.uk");
  });

  it("drops an entry with no title, or a category that does not exist, and a date that is not one", () => {
    const out = candidatesFromAnswer(answer([item({ title: "" }), item({ category: "Nonsense" }), item({ title: "Odd date", dateTime: "through to 1 November" })]), "h", entry);
    expect(out.map((c) => c.title)).toEqual(["Odd date"]);
    expect(out[0].dateTime).toBeNull();
  });

  it("tells events on a shared page apart, so a new one is never taken for a repeat", () => {
    const shared = [item({ title: "Talk A", dateTime: "2026-11-01T10:00:00Z", sourceUrl: entry }), item({ title: "Talk B", dateTime: "2026-11-08T10:00:00Z", sourceUrl: entry }), item({ title: "Own page", sourceUrl: "https://stevenage.gov.uk/events/own" })];
    const urls = uniqueUrls(shared, entry);
    expect(new Set(urls).size).toBe(3);
    expect(urls[0]).toBe(`${entry}#Talk%20A%202026-11-01`);
    expect(urls[2]).toBe("https://stevenage.gov.uk/events/own");
    expect(uniqueUrls([item({ sourceUrl: undefined })], entry)[0]).toMatch(/^https:\/\/stevenage\.gov\.uk\/events#History%20walk/);
  });

  it("is nothing for an empty answer, and a failure for prose with no answer in it", () => {
    expect(candidatesFromAnswer("", "h", entry)).toEqual([]);
    expect(candidatesFromAnswer('{"items": []}', "h", entry)).toEqual([]);
    expect(() => candidatesFromAnswer("Sorry, I ran out of fetches.", "h", entry)).toThrow(/No JSON/);
  });
});

describe("the job", () => {
  it("is protected like the others, stays within the daily search budget, and runs every morning", () => {
    const route = read("src/app/api/discovery/organisers/route.ts");
    expect(route).toContain("Bearer ${process.env.CRON_SECRET}");
    expect(route).toContain("searchAllowed(admin, null)");
    expect(route).toContain("refreshOrganisers(admin, { force })");
    const cron = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(cron).toContainEqual({ path: "/api/discovery/organisers", schedule: "0 5 * * *" });
  });
});
