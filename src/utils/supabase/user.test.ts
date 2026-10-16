import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/utils/supabase/user";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const client = (result: unknown) => ({ auth: { getClaims: async () => result } }) as unknown as SupabaseClient;

describe("who is signed in, for the screens that only read", () => {
  it("is the person in the token: their id, email and first name", async () => {
    const user = await getSessionUser(client({ data: { claims: { sub: "u1", email: "grace@example.com", user_metadata: { first_name: "Grace" } } }, error: null }));
    expect(user).toEqual({ id: "u1", email: "grace@example.com", user_metadata: { first_name: "Grace" } });
  });

  it("is nobody when the token is missing, invalid, expired or has no subject", async () => {
    expect(await getSessionUser(client({ data: null, error: { message: "no session" } }))).toBeNull();
    expect(await getSessionUser(client({ data: { claims: null }, error: null }))).toBeNull();
    expect(await getSessionUser(client({ data: { claims: { email: "x@y.z" } }, error: null }))).toBeNull();
    expect(await getSessionUser(client({ data: { claims: { sub: "" } }, error: null }))).toBeNull();
    expect(await getSessionUser(client({ data: { claims: { sub: "u1" } }, error: { message: "bad signature" } }))).toBeNull();
  });

  it("copes with a token that carries no email or details", async () => {
    expect(await getSessionUser(client({ data: { claims: { sub: "u1" } }, error: null }))).toEqual({ id: "u1", email: null, user_metadata: {} });
  });
});

function files(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(process.cwd(), path)).isDirectory()) files(path, found);
    else found.push(path);
  }
  return found;
}

describe("keeping the tabs quick without loosening who may change what", () => {
  it("runs the server code in London, beside the database", () => {
    expect(JSON.parse(read("vercel.json")).regions).toEqual(["lhr1"]);
  });

  it("holds a screen seen in the last half minute, and anything that changes it clears that", () => {
    expect(read("next.config.ts")).toMatch(/staleTimes:\s*\{\s*dynamic:\s*30/);
  });

  it("checks the sign-in token on the server in the proxy and on the screens that only read", () => {
    expect(read("src/utils/supabase/middleware.ts")).toContain("await getSessionUser(supabase)");
    expect(read("src/utils/supabase/middleware.ts")).not.toContain("auth.getUser()");
    for (const page of ["today", "week", "explore", "chapter", "people", "chat"]) {
      const source = read(`src/app/${page}/page.tsx`);
      expect(source, page).toContain("await getSessionUser(supabase)");
      expect(source, page).not.toContain("auth.getUser()");
    }
  });

  it("still asks the sign-in service wherever something is changed, deleted or sent", () => {
    const actions = files("src/app").filter((f) => /(^|\/)[A-Za-z]*[aA]ctions\.ts$/.test(f) && read(f).includes('"use server"'));
    expect(actions.length).toBeGreaterThan(10);
    for (const file of actions) expect(read(file), file).not.toContain("getSessionUser");
    for (const route of ["src/app/api/calendar/file/route.ts", "src/app/api/calendar/connect/route.ts", "src/app/api/calendar/callback/route.ts"]) {
      expect(read(route), route).not.toContain("getSessionUser");
    }
  });

  it("asks the sign-in service for Account, where a changed name must show at once, and for the admin screens", () => {
    for (const page of ["account", "feedback", "admin/members", "admin/activities", "admin/ai-costs"]) {
      expect(read(`src/app/${page}/page.tsx`), page).not.toContain("getSessionUser");
    }
  });

  it("issues a new token when the first name changes, so Today greets by the new name", () => {
    expect(read("src/app/account/actions.ts")).toMatch(/updateUser\(\{ data: \{ first_name: firstName \} \}\);[\s\S]{0,200}refreshSession\(\)/);
    expect(read("src/app/onboarding/actions.ts")).toMatch(/updateUser\(\{ data: \{ first_name: firstName \} \}\);[\s\S]{0,200}refreshSession\(\)/);
  });
});

describe("Today is sent in two parts", () => {
  const page = read("src/app/today/page.tsx");

  it("asks for the plan, the profile, how they feel and the questions together", () => {
    expect(page).toMatch(/const \[\{ data: profile \}, \{ data: itinerary \}, dailyState, reflections\] = await Promise\.all/);
  });

  it("does not wait for the idea of the day, which fills in when it is ready", () => {
    expect(page).not.toContain("await getFeaturedOption");
    expect(page).not.toMatch(/getFeaturedOption\(/);
    expect(page).toContain("<Suspense fallback={<FeaturedFallback />}>");
    expect(page).toContain("featuredSlot=");
    expect(read("src/app/today/FeaturedForYou.tsx")).toContain("await getFeaturedOption(supabase, userId)");
    expect(read("src/components/TodayView.tsx")).toContain("{featuredSlot}");
  });

  it("still says so when there is nothing to suggest, and shows without the idea if it cannot be made", () => {
    const section = read("src/app/today/FeaturedForYou.tsx");
    expect(section).toContain("Nothing more to suggest for today");
    expect(section).toMatch(/\.catch\(\(err\) => \{[\s\S]*return null;/);
  });

  it("asks My Week's four independent questions together", () => {
    expect(read("src/app/week/page.tsx")).toMatch(/const \[\{ data: profile \}, \{ data: plans \}, \{ data: recentLikedSignals \}, \{ data: surpriseCard \}\] = await Promise\.all/);
  });
});
