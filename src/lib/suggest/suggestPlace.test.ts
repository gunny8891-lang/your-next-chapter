import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSuggestion, submitSuggestion, suggestionCandidate, suggestionMessage, SUGGEST_KINDS } from "@/lib/suggest/suggestPlace";
import { cleanPage } from "@/lib/feedbackSubmit";
import { ensurePlacesNearHome, THIN_RESULT_IDEAS } from "@/lib/discovery/hereNow";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const BARNET = { lat: 51.653, lng: -0.2 };

const raw = { name: "The Garden Cafe", kind: "place", where: "12 High Street, Barnet", when: "", link: "", notes: "" };

describe("what a member writes", () => {
  it("is tidied and kept", () => {
    expect(cleanSuggestion({ ...raw, name: "  The   Garden Cafe ", when: "Tuesdays 10 to 12", notes: "Step-free." })).toEqual({
      name: "The Garden Cafe",
      kind: "place",
      where: "12 High Street, Barnet",
      when: "Tuesdays 10 to 12",
      link: null,
      notes: "Step-free.",
    });
  });

  it("is refused without a name, a place it is, or a kind that exists", () => {
    for (const bad of [{ ...raw, name: "x" }, { ...raw, name: "" }, { ...raw, where: "ab" }, { ...raw, kind: "party" }, null, "text", 5]) {
      expect(cleanSuggestion(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("keeps a web address, adds https to a bare one, and drops anything that is not one", () => {
    expect(cleanSuggestion({ ...raw, link: "www.example.org/cafe" })?.link).toBe("https://www.example.org/cafe");
    expect(cleanSuggestion({ ...raw, link: "https://example.org" })?.link).toBe("https://example.org/");
    for (const bad of ["javascript:alert(1)", "not a link", "ftp://example.org", "localhost"]) {
      expect(cleanSuggestion({ ...raw, link: bad })?.link, bad).toBeNull();
    }
  });

  it("has no control characters, and is kept to a sensible length", () => {
    const s = cleanSuggestion({ ...raw, name: "Cafe\u0000\u0007 Nero", notes: "n".repeat(900) })!;
    expect(s.name).toBe("Cafe Nero");
    expect(s.notes).toHaveLength(500);
  });

  it("is told to whoever runs the app in plain lines", () => {
    const text = suggestionMessage(cleanSuggestion({ ...raw, when: "Saturdays", link: "example.org", notes: "Lovely" })!);
    expect(text).toBe("Suggested: The Garden Cafe (A place to visit)\nWhere: 12 High Street, Barnet\nWhen: Saturdays\nLink: https://example.org/\nNotes: Lovely");
  });
});

describe("the entry it becomes", () => {
  const s = cleanSuggestion(raw)!;

  it("waits to be checked and is never made live by itself", () => {
    const c = suggestionCandidate(s, BARNET);
    expect(c.status).toBe("needs_review");
    expect(c.bookingUrlVerified).toBe(false);
    expect(c.tags).toContain("member-suggested");
    expect(c.adminNotes).toMatch(/Suggested by a member\. Not checked/);
    expect(c.description).toMatch(/suggested by a member and not yet checked/);
  });

  it("carries where it is, and a map search to point at when there is no link of their own", () => {
    const c = suggestionCandidate(s, BARNET);
    expect(c).toMatchObject({ title: "The Garden Cafe", address: "12 High Street, Barnet", locationLat: BARNET.lat, locationLng: BARNET.lng, category: "Explore", dateTime: null, priceEstimate: null });
    expect(c.bookingUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?/);
    expect(decodeURIComponent(c.bookingUrl.replaceAll("+", " "))).toContain("The Garden Cafe 12 High Street, Barnet");
    expect(suggestionCandidate({ ...s, link: "https://example.org/" }, null)).toMatchObject({ bookingUrl: "https://example.org/", locationLat: null, locationLng: null });
  });

  it("is filed by its kind", () => {
    const by = (kind: string) => suggestionCandidate({ ...s, kind }, null);
    expect(by("group")).toMatchObject({ category: "Connect", tags: ["member-suggested", "social"] });
    expect(by("class")).toMatchObject({ category: "Learn", tags: ["member-suggested", "classes"] });
    expect(by("event").category).toBe("Joy");
    expect(SUGGEST_KINDS.map((k) => k.value)).toEqual(["place", "group", "event", "class", "other"]);
  });
});

describe("sending it", () => {
  /** An admin client where the member has sent `today` messages today. */
  function admin(today = 0) {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ gte: async () => ({ count: today, error: null }) }) }),
        insert: async () => ({ error: null }),
      }),
    } as unknown as SupabaseClient;
  }
  const recipients = async () => ["owner@example.com"];
  function setup(over: { today?: number; existing?: unknown[]; inserted?: number; geocode?: typeof Object; persistThrows?: boolean } = {}) {
    const send = vi.fn(async () => {});
    const persist = vi.fn(async (_a: unknown, sources: { fetchCandidates: () => Promise<unknown[]> }[]) => {
      if (over.persistThrows) throw new Error("db down");
      await sources[0].fetchCandidates();
      return { results: [{ source: "member-suggestion", found: 1, inserted: over.inserted ?? 1, insertedActive: 0, skippedExisting: 0, errors: [] }], pending: [] };
    });
    const deps = {
      admin: admin(over.today),
      recipients,
      send,
      geocode: (over.geocode as never) ?? (async () => BARNET),
      persist: persist as never,
      existing: async () => (over.existing as never) ?? [],
    };
    return { deps, send, persist };
  }
  const input = { memberId: "m1", memberEmail: "grace@example.com", raw };

  it("is added to the entries waiting to be checked, and sent to whoever runs the app", async () => {
    const { deps, send, persist } = setup();
    expect(await submitSuggestion(input, deps)).toBe("added");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown as [string[], { text: string; replyTo?: string }])[1].text).toContain("Suggested: The Garden Cafe");
    expect((send.mock.calls[0] as unknown as [string[], { replyTo?: string }])[1].replyTo).toBe("grace@example.com");
  });

  it("says thank you, and adds nothing, for somewhere already in the catalogue close by", async () => {
    const { deps, send, persist } = setup({ existing: [{ title: "The Garden Cafe", location_lat: BARNET.lat, location_lng: BARNET.lng }] });
    expect(await submitSuggestion(input, deps)).toBe("already_have");
    expect(persist).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("says the same when the link is already there", async () => {
    expect(await submitSuggestion(input, setup({ inserted: 0 }).deps)).toBe("already_have");
  });

  it("still goes in, with no position, when the address cannot be found", async () => {
    const { deps, persist } = setup({ geocode: (async () => null) as never });
    expect(await submitSuggestion(input, deps)).toBe("added");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("is refused when it is empty, and when they have sent a few today already", async () => {
    const empty = setup();
    expect(await submitSuggestion({ ...input, raw: { ...raw, name: "" } }, empty.deps)).toBe("invalid");
    expect(empty.send).not.toHaveBeenCalled();
    const many = setup({ today: 5 });
    expect(await submitSuggestion(input, many.deps)).toBe("too_many");
    expect(many.persist).not.toHaveBeenCalled();
  });

  it("is still counted as sent when it cannot be added, since whoever runs the app has it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await submitSuggestion(input, setup({ persistThrows: true }).deps)).toBe("added");
    warn.mockRestore();
  });
});

describe("how it is built into the app", () => {
  it("is for signed-in members, with the shell around it, and its action asks who is asking", () => {
    expect(read("src/app/suggest/page.tsx")).toContain('redirect("/login")');
    expect(read("src/components/shell.ts")).toContain('"/suggest"');
    expect(read("src/app/suggest/actions.ts")).toContain("auth.getUser()");
  });

  it("is offered on Explore and to the concierge, which cannot add anything itself", () => {
    expect(read("src/components/ExploreView.tsx")).toContain('<Link href="/suggest">Tell us about it</Link>');
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain("/suggest");
    expect(agent).toContain("You cannot add it yourself");
  });

  it("is a source feedback can say it came from", () => {
    expect(cleanPage("Suggest a place")).toBe("Suggest a place");
  });
});

describe("filling in a thin home area", () => {
  function db(profile: unknown, recentlyDone = false) {
    const inserts: unknown[] = [];
    const client = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "gte", "limit"]) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: profile, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: table === "ai_usage_logs" && recentlyDone ? [{ id: 1 }] : [], error: null });
        chain.insert = async (row: unknown) => (inserts.push(row), { error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, inserts };
  }
  const ensure = () => vi.fn(async () => ({ region: "this area", status: "added" as const, inserted: 3 }));

  it("fetches the area around their home when few places are known, once", async () => {
    const e = ensure();
    const d = db({ location_lat: 51.65, location_lng: -0.2 });
    expect(await ensurePlacesNearHome("m1", { admin: d.client, count: async () => 4, ensure: e as never })).toBe("fetched");
    expect(e).toHaveBeenCalledTimes(1);
    expect(d.inserts).toHaveLength(1);
  });

  it("does nothing where plenty is known, where it was done today, or where home is not known", async () => {
    const e = ensure();
    expect(await ensurePlacesNearHome("m1", { admin: db({ location_lat: 51.65, location_lng: -0.2 }).client, count: async () => 500, ensure: e as never })).toBe("known");
    expect(await ensurePlacesNearHome("m1", { admin: db({ location_lat: 51.65, location_lng: -0.2 }, true).client, count: async () => 4, ensure: e as never })).toBe("limited");
    expect(await ensurePlacesNearHome("m1", { admin: db({ location_lat: null, location_lng: null }).client, ensure: e as never })).toBe("known");
    expect(e).not.toHaveBeenCalled();
  });

  it("runs after a thin answer from home, in the background, and not for a day trip or a search from where they are", () => {
    const actions = read("src/app/today/timeActions.ts");
    expect(actions).toContain('if (!request.here && request.mood !== "daytrip" && result.options.length < THIN_RESULT_IDEAS)');
    expect(actions).toContain("after(() => ensurePlacesNearHome(user.id))");
    expect(THIN_RESULT_IDEAS).toBe(3);
  });
});
