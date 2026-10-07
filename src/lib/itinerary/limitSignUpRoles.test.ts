import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSignUpRole, limitSignUpRoles } from "@/lib/itinerary/limitSignUpRoles";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const c = (id: string, category: string, date_time: string | null = null) => ({ id, category, date_time });
const ids = (list: { id: string }[]) => list.map((x) => x.id);

const ranked = [c("walk", "Move"), c("role1", "Give Back"), c("cafe", "Joy"), c("litter", "Give Back", "2026-10-10T10:00:00Z"), c("role2", "Give Back"), c("talk", "Learn")];

describe("which volunteering the weekly plan is offered", () => {
  it("tells a standing role from a one-off dated event", () => {
    expect(isSignUpRole(c("a", "Give Back"))).toBe(true);
    expect(isSignUpRole(c("b", "Give Back", "2026-10-10T10:00:00Z"))).toBe(false);
    expect(isSignUpRole(c("c", "Move"))).toBe(false);
  });

  it("offers no standing roles to someone whose goals are not about giving back", () => {
    expect(ids(limitSignUpRoles(ranked, ["staying_active"]))).toEqual(["walk", "cafe", "litter", "talk"]);
    expect(ids(limitSignUpRoles(ranked, []))).toEqual(["walk", "cafe", "litter", "talk"]);
  });

  it("offers one, the best ranked, to someone who wants to give back", () => {
    expect(ids(limitSignUpRoles(ranked, ["give_back"]))).toEqual(["walk", "role1", "cafe", "litter", "talk"]);
  });

  it("never touches anything that is not a standing role, and keeps the order", () => {
    const other = [c("x", "Move"), c("y", "Joy"), c("z", "Give Back", "2026-10-11T09:00:00Z")];
    expect(limitSignUpRoles(other, [])).toEqual(other);
  });

  it("copes with nothing", () => {
    expect(limitSignUpRoles([], ["give_back"])).toEqual([]);
  });
});

describe("how the weekly plan uses it", () => {
  it("applies it to the candidates before the balanced selection, with the member's goals", () => {
    const agent = read("src/lib/itinerary/agent.ts");
    // The limit sits inside the call that picks the balanced shortlist, so it runs first.
    expect(agent).toMatch(/selectBalanced\(\s*limitSignUpRoles\(/);
    expect(agent).toContain("profile?.goals ?? []");
  });
});
