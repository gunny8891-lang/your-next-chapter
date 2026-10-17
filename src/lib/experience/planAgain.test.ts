import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planAgain, PLAN_AGAIN_RATIONALE, type PlanAgainDeps } from "@/lib/experience/planAgain";
import { loadMemberLife, memberLifeText } from "@/lib/chat/memberContext";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Friday 16 October 2026. Last Tuesday was the 13th, so "again" is Tuesday the 20th.
const NOW = new Date("2026-10-16T10:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";

const row = (over: Record<string, unknown>) => ({
  id: ID,
  title: "Craft Group",
  category: "Learn",
  address: "Hall",
  date_time: null,
  expires_at: null,
  recurrence_rule: "Tu 14:00-16:00",
  duration_minutes: 120,
  price_estimate: 4,
  booking_url: null,
  description: null,
  ...over,
});

function deps(activity: Record<string, unknown> | null, over: Partial<PlanAgainDeps> = {}) {
  const member = {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: activity, error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
  const place = vi.fn(async () => ({ error: null }));
  const recordPlanned = vi.fn(async () => {});
  const d: PlanAgainDeps = { member, admin: {} as SupabaseClient, memberId: "m1", now: NOW, place: place as unknown as PlanAgainDeps["place"], recordPlanned, ...over };
  return { d, place, recordPlanned };
}

describe("planning it again next week", () => {
  it("puts it a week later in the same part of the day, through the shared placement", async () => {
    const { d, place, recordPlanned } = deps(row({}));
    const result = await planAgain(d, { activityId: ID, date: "2026-10-13", slot: "afternoon" });
    expect(result).toEqual({ error: null, when: "Tuesday afternoon" });
    expect(place).toHaveBeenCalledWith(d.member, d.admin, "m1", ID, "afternoon", NOW, PLAN_AGAIN_RATIONALE, "2026-10-20");
    expect(recordPlanned).toHaveBeenCalledWith(ID);
  });

  it("does not repeat a one-off event", async () => {
    const { d, place } = deps(row({ recurrence_rule: null, date_time: "2026-10-13T14:00:00Z" }));
    const result = await planAgain(d, { activityId: ID, date: "2026-10-13", slot: "afternoon" });
    expect(result.error).toMatch(/on Tuesday 13 October, not Tuesday 20 October/);
    expect(place).not.toHaveBeenCalled();
  });

  it("does not put a group on a day it does not meet", async () => {
    const { d, place } = deps(row({ recurrence_rule: "Th 14:00-16:00" }));
    const result = await planAgain(d, { activityId: ID, date: "2026-10-13", slot: "afternoon" });
    expect(result.error).toMatch(/does not meet/);
    expect(place).not.toHaveBeenCalled();
  });

  it("says plainly when that time already has something in it", async () => {
    const { d } = deps(row({}), { place: vi.fn(async () => ({ error: "Something is already planned for that time." })) as unknown as PlanAgainDeps["place"] });
    const result = await planAgain(d, { activityId: ID, date: "2026-10-13", slot: "afternoon" });
    expect(result.error).toMatch(/already planned/);
    expect(result.when).toBeUndefined();
  });

  it("is not caught out by nonsense, a date that is not recent, or an activity that has gone", async () => {
    const { d, place } = deps(row({}));
    for (const bad of [
      { activityId: "x", date: "2026-10-13", slot: "afternoon" },
      { activityId: ID, date: "last Tuesday", slot: "afternoon" },
      { activityId: ID, date: "2026-10-13", slot: "midnight" },
      { activityId: ID, date: "2026-10-30", slot: "afternoon" },
      { activityId: ID, date: "2026-09-01", slot: "afternoon" },
      { activityId: null, date: null, slot: null },
    ]) {
      expect((await planAgain(d, bad)).error, JSON.stringify(bad)).toBeTruthy();
    }
    expect((await planAgain(deps(null).d, { activityId: ID, date: "2026-10-13", slot: "afternoon" })).error).toMatch(/isn't available/);
    expect(place).not.toHaveBeenCalled();
  });

  it("keeps the plan if learning from it fails", async () => {
    const { d } = deps(row({}), { recordPlanned: vi.fn(async () => { throw new Error("no"); }) });
    expect((await planAgain(d, { activityId: ID, date: "2026-10-13", slot: "afternoon" })).error).toBeNull();
  });
});

describe("on the Today screen", () => {
  it("is offered only after 'Loved it', and only for something that can be repeated", () => {
    const card = read("src/components/Reflections.tsx");
    expect(card).toContain('done[item.activityId] === "loved" && item.canRepeat && item.slot');
    expect(card).toContain("Plan it again next week");
  });

  it("is a server action that checks who is asking and refreshes My Week and Today", () => {
    const action = read("src/app/today/experienceActions.ts");
    const body = action.slice(action.indexOf("export async function planAgainAction"));
    expect(body).toContain("if (!user) return");
    expect(body).toContain('revalidatePath("/week")');
    expect(read("src/app/today/page.tsx")).toContain("loadReflections(supabase, user.id, londonToday(), londonClock(new Date()).minutes)");
    expect(read("src/app/today/page.tsx")).toContain("onPlanAgain={planAgainAction}");
  });
});

describe("what the concierge knows of their life", () => {
  const life = {
    wishes: ["Learn to paint", "Walk the coast path"],
    people: [
      { relationship: "Granddaughter", interests: ["animals", "baking"], wantsToSeeMore: true, daysSinceSeen: 21 },
      { relationship: null, interests: [], wantsToSeeMore: false, daysSinceSeen: null },
    ],
    planned: 3,
    went: 1,
  };

  it("gives wishes, the kinds of people and how the week has gone", () => {
    const text = memberLifeText(life);
    expect(text).toContain('"Learn to paint"; "Walk the coast path"');
    expect(text).toContain("Granddaughter, shares: animals, baking; last seen 21 days ago; they want to see more of them");
    expect(text).toContain("someone close; not yet logged a visit");
    expect(text).toContain("3 outings accepted in their plan; they said they went to 1 in the last seven days");
  });

  it("says plainly when they have told us nothing", () => {
    const text = memberLifeText({ wishes: [], people: [], planned: 0, went: 0 });
    expect(text).toContain("have not told us");
    expect(text).toContain("0 outings");
  });

  it("is read with the member's own client, without names or notes", async () => {
    const asked: string[] = [];
    const member = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = (cols: string) => (asked.push(`${table}: ${cols}`), chain);
        for (const m of ["eq", "order", "limit", "gte"]) chain[m] = () => chain;
        chain.then = (resolve: (v: unknown) => void) =>
          resolve(
            table === "goals"
              ? { data: [{ text: "Learn to paint" }] }
              : table === "people"
                ? { data: [{ relationship: "Son", shared_interests: ["cycling"], wants_to_see_more: true, last_seen_date: "2026-10-09" }] }
                : { count: 2 }
          );
        return chain;
      },
    } as unknown as SupabaseClient;
    const out = await loadMemberLife(member, "m1", "2026-10-16", 4);
    expect(out).toEqual({ wishes: ["Learn to paint"], people: [{ relationship: "Son", interests: ["cycling"], wantsToSeeMore: true, daysSinceSeen: 7 }], planned: 4, went: 2, dates: [] });
    const people = asked.find((a) => a.startsWith("people"))!;
    expect(people).not.toMatch(/\bname\b|notes/);
  });

  it("knows less, rather than failing the chat, when it cannot read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { from: () => { throw new Error("db"); } } as unknown as SupabaseClient;
    expect(await loadMemberLife(broken, "m1", "2026-10-16", 2)).toEqual({ wishes: [], people: [], planned: 2, went: 0 });
    warn.mockRestore();
  });

  it("is in the concierge's instructions, with a rule against guessing names", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain("WHAT THEY HAVE TOLD US ABOUT THEIR LIFE");
    expect(agent).toContain("never guess names");
    expect(agent).toContain("memberLifeText(await loadMemberLife(");
  });
});
