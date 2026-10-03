import { describe, expect, it } from "vitest";
import { activeTab, showsShell, TABS } from "@/components/shell";

describe("showsShell", () => {
  it.each(["/today", "/week", "/explore", "/chapter", "/people", "/chat", "/account", "/week/anything"])("shows the navigation on %s", (path) => {
    expect(showsShell(path)).toBe(true);
  });

  it.each(["/", "/login", "/signup", "/forgot-password", "/reset-password", "/onboarding", "/admin/activities", "/admin/ai-costs", "/auth/confirm"])(
    "leaves %s with its own full-page layout",
    (path) => {
      expect(showsShell(path)).toBe(false);
    }
  );

  it("does not mistake a similarly named route for a member screen", () => {
    expect(showsShell("/weekend")).toBe(false);
    expect(showsShell("/todayish")).toBe(false);
  });
});

describe("activeTab", () => {
  it("lights the matching destination", () => {
    expect(activeTab("/today")).toBe("today");
    expect(activeTab("/week")).toBe("week");
    expect(activeTab("/explore")).toBe("explore");
    expect(activeTab("/chapter")).toBe("chapter");
  });

  it("keeps My Chapter lit on People, which lives inside it", () => {
    expect(activeTab("/people")).toBe("chapter");
  });

  it("lights nothing on the concierge and account, which are header actions", () => {
    expect(activeTab("/chat")).toBeNull();
    expect(activeTab("/account")).toBeNull();
  });
});

describe("TABS", () => {
  it("is four simple destinations, each reachable by its own link", () => {
    expect(TABS.map((t) => t.label)).toEqual(["Today", "My Week", "Explore", "My Chapter"]);
    for (const tab of TABS) expect(showsShell(tab.href)).toBe(true);
  });
});
