import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("My Week shows the right week", () => {
  const page = read("src/app/week/page.tsx");

  it("asks for this week and next week only, and lets weekToShow choose between them", () => {
    expect(page).toContain('.in("week_start_date", [thisWeek, addDays(thisWeek, 7)])');
    expect(page).toContain("weekToShow(");
    expect(page).toContain("p.week_start_date === shownWeek");
  });

  it("no longer takes whichever plan is newest, which would put next week's days on this week", () => {
    expect(page).not.toMatch(/itineraries"\)[\s\S]{0,400}\.order\("week_start_date", \{ ascending: false \}\)\s*\.limit\(1\)/);
  });

  it("marks no day as today, and says 'Next week', when it is showing next week's plan", () => {
    expect(page).toContain('today={showingNextWeek ? "" : today}');
    expect(page).toContain("nextWeekLabel={showingNextWeek && !isDemo ? weekLabel(shownWeek) : null}");
    const view = read("src/components/ThisWeekView.tsx");
    expect(view).toContain('nextWeekLabel ? "Next week" : "My week"');
  });
});

describe("Today uses the week it is in", () => {
  const today = read("src/app/today/page.tsx");

  it("reads the plan for this London week, not the newest plan (on a Sunday evening that is next week's)", () => {
    expect(today).toContain('.eq("week_start_date", londonWeekStart())');
  });
});

describe("the Sunday job and the rest agree about which week is planned", () => {
  it("the job names next week; nothing else names a week, so it follows what the member is looking at", () => {
    const job = read("src/app/api/jobs/weekly-digest/route.ts");
    expect(job).toContain("const weekStart = nextLondonWeekStart();");
    expect(job).toContain("generateAndSaveItinerary(admin, member.user_id, { weekStart })");
    for (const caller of ["src/app/account/actions.ts", "src/app/onboarding/actions.ts", "src/app/week/itineraryActions.ts", "src/lib/discovery/regional.ts"]) {
      expect(read(caller), caller).not.toMatch(/generateAndSaveItinerary\([^)]*weekStart/);
    }
  });
});
