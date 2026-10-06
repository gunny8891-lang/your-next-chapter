import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import manifest from "@/app/manifest";
import robots from "@/app/robots";

/** Whether the sign-in check runs for a path (Next's matcher is a path pattern; this one is a plain regular expression). */
function checked(path: string): boolean {
  return new RegExp(`^${config.matcher[0]}$`).test(path);
}

describe("which paths the sign-in check runs on", () => {
  it("skips the public files a browser, a phone or a search engine fetches with no session", () => {
    for (const path of ["/favicon.ico", "/icon", "/apple-icon", "/pwa-icon/192", "/pwa-icon/maskable", "/opengraph-image", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/images/fallback/woodland.jpg"]) {
      expect(checked(path), path).toBe(false);
    }
  });

  it("still runs on every screen and route a member or a job uses", () => {
    for (const path of ["/", "/today", "/week", "/explore", "/chapter", "/chat", "/account", "/admin/ai-costs", "/login", "/signup", "/auth/confirm", "/privacy", "/terms", "/unsubscribe", "/api/jobs/daily-nudges", "/api/calendar/connect"]) {
      expect(checked(path), path).toBe(true);
    }
  });
});

describe("the home-screen manifest", () => {
  const m = manifest();

  it("names the app and opens it on today's ideas, full screen", () => {
    expect(m.name).toBe("Lark Hour");
    expect(m.start_url).toBe("/today");
    expect(m.display).toBe("standalone");
  });

  it("offers an ordinary and a maskable icon at the sizes phones ask for, all on paths the sign-in check skips", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(checked(icon.src), icon.src).toBe(false);
  });
});

describe("robots rules", () => {
  it("keep search engines off members' own screens and the API", () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallowed = ([] as string[]).concat(rule.disallow ?? []);
    for (const path of ["/api/", "/account", "/today", "/week", "/admin/"]) expect(disallowed).toContain(path);
  });
});
