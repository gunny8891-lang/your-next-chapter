import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unofferedRadiusLabel } from "@/components/AccountSettingsForm";

const source = readFileSync(join(process.cwd(), "src", "components", "AccountSettingsForm.tsx"), "utf8");

describe("a travel distance that is not one of the usual choices", () => {
  it("is shown in miles, like every other distance in the app", () => {
    expect(unofferedRadiusLabel(10)).toBe("About 6 miles");
    expect(unofferedRadiusLabel(25)).toBe("About 16 miles");
    expect(unofferedRadiusLabel(1.6)).toBe("About 1 mile");
    expect(unofferedRadiusLabel(0.2)).toBe("About 1 mile");
    expect(unofferedRadiusLabel(null)).toBe("Not set");
  });

  it("never says kilometres to the member", () => {
    expect(source).not.toMatch(/About \{radiusKm\} km/);
    expect(source).toContain("unofferedRadiusLabel(radiusKm)");
  });
});

describe("the plan section, before anything is for sale", () => {
  it("says it is free while testing, instead of 'You haven't subscribed'", () => {
    expect(source).toContain("Lark Hour is free while we're testing it.");
    expect(source).not.toContain("You haven't subscribed.");
  });

  it("still shows a real plan if there is one", () => {
    expect(source).toContain("${subscription.plan} plan, ${subscription.status}");
  });
});
