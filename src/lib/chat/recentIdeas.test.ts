import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { distinctRecentIds, loadRecentIdeas, recentIdeasText } from "@/lib/chat/recentIdeas";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const ev = (activity_id: string | null, at: string, event_type = "shown") => ({ activity_id, event_type, created_at: at });

describe("which ideas the concierge is told about", () => {
  it("takes the newest first, each once, up to the limit", () => {
    const events = [ev("a", "2026-10-07T10:00:00Z"), ev("b", "2026-10-07T12:00:00Z"), ev("a", "2026-10-07T13:00:00Z"), ev("c", "2026-10-07T11:00:00Z")];
    expect(distinctRecentIds(events)).toEqual(["a", "b", "c"]);
    expect(distinctRecentIds(events, new Set(), 2)).toEqual(["a", "b"]);
  });

  it("leaves out what is already in their plan, and rows with no activity", () => {
    const events = [ev("a", "2026-10-07T10:00:00Z"), ev(null, "2026-10-07T11:00:00Z"), ev("b", "2026-10-07T09:00:00Z")];
    expect(distinctRecentIds(events, new Set(["a"]))).toEqual(["b"]);
  });

  it("copes with nothing", () => {
    expect(distinctRecentIds([])).toEqual([]);
  });
});

describe("how they are listed", () => {
  it("gives the name, kind, price and address, and says plainly when there is nothing", () => {
    const text = recentIdeasText([
      { id: "1", title: "Chickenshed", category: "Joy", address: "Cockfosters", price_estimate: null },
      { id: "2", title: "Arts Depot", category: "Learn", address: null, price_estimate: 0 },
      { id: "3", title: "Southgate Leisure Centre", category: "Move", address: "Southgate", price_estimate: 6 },
    ]);
    expect(text).toContain("- Chickenshed | Joy | Cockfosters");
    expect(text).toContain("- Arts Depot | Learn | Free | location TBC");
    expect(text).toContain("- Southgate Leisure Centre | Move | £6 | Southgate");
    expect(recentIdeasText([])).toBe("They have not been shown or saved anything recently.");
  });
});

/** A stand-in for the database that answers each table's query with canned rows (any chain of filters). */
function fakeDb(tables: Record<string, unknown[]>, failOn?: string) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "not", "gte", "order", "limit"]) chain[method] = () => chain;
      chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => (table === failOn ? reject(new Error("db down")) : resolve({ data: rows, error: null }));
      return chain;
    },
  } as never;
}

describe("reading what they have recently seen", () => {
  const activities = [
    { id: "chicken", title: "Chickenshed", category: "Joy", address: "Cockfosters", price_estimate: null },
    { id: "arts", title: "Arts Depot", category: "Learn", address: "North Finchley", price_estimate: 0 },
  ];

  it("combines what they were shown with what they saved, newest first, as real entries", async () => {
    const db = fakeDb({
      experience_events: [ev("chicken", "2026-10-07T12:00:00Z"), ev("chicken", "2026-10-07T12:05:00Z", "opened")],
      saved_ideas: [{ activity_id: "arts", created_at: "2026-10-07T13:00:00Z" }],
      activities,
    });
    const ideas = await loadRecentIdeas(db, "member-1");
    expect(ideas.map((i) => i.title)).toEqual(["Arts Depot", "Chickenshed"]);
  });

  it("drops anything no longer in the catalogue, and anything excluded", async () => {
    const db = fakeDb({ experience_events: [ev("chicken", "2026-10-07T12:00:00Z"), ev("gone", "2026-10-07T12:30:00Z")], saved_ideas: [], activities });
    expect((await loadRecentIdeas(db, "member-1")).map((i) => i.title)).toEqual(["Chickenshed"]);
    expect(await loadRecentIdeas(db, "member-1", new Set(["chicken"]))).toEqual([]);
  });

  it("returns nothing, rather than failing the chat, if it cannot read", async () => {
    const db = fakeDb({ experience_events: [ev("chicken", "2026-10-07T12:00:00Z")] }, "experience_events");
    await expect(loadRecentIdeas(db, "member-1")).resolves.toEqual([]);
  });

  it("is given to the concierge, with a rule that lets it talk about them and no more than the line says", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain("await loadRecentIdeas(supabase, memberId, scheduledActivityIds)");
    expect(agent).toContain("IDEAS THEY HAVE RECENTLY SEEN OR SAVED ON TODAY AND EXPLORE");
    expect(agent).toContain("you only know what is on each line");
    expect(agent).toContain("appears verbatim in one of the lists above");
  });
});
