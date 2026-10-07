import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCATION_HINT_ACCOUNT, LOCATION_HINT_SETUP, LOCATION_LABEL, LOCATION_PLACEHOLDER } from "@/lib/geo/locationCopy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("asking where a member lives", () => {
  it("says plainly what to type: a town or a postcode, not a full address", () => {
    expect(LOCATION_LABEL).toMatch(/town or postcode/);
    expect(LOCATION_HINT_SETUP).toMatch(/town or a postcode is enough/);
    expect(LOCATION_HINT_SETUP).toMatch(/full address/);
    expect(LOCATION_HINT_ACCOUNT).toMatch(/town or a postcode is enough/);
  });

  it("gives an example of each kind of answer", () => {
    expect(LOCATION_PLACEHOLDER).toMatch(/Bath/);
    expect(LOCATION_PLACEHOLDER).toMatch(/BA1 1AA/);
  });

  it("warns, in Account, that changing it builds a fresh plan for the week", () => {
    expect(LOCATION_HINT_ACCOUNT).toMatch(/fresh plan for this week/);
  });

  it("uses the same words when setting up and in Account", () => {
    const onboarding = read("src/components/OnboardingFlow.tsx");
    const account = read("src/components/AccountSettingsForm.tsx");
    for (const source of [onboarding, account]) {
      expect(source).toContain("LOCATION_LABEL");
      expect(source).toContain("LOCATION_PLACEHOLDER");
    }
    expect(onboarding).toContain("LOCATION_HINT_SETUP");
    expect(account).toContain("LOCATION_HINT_ACCOUNT");
  });

  it("keeps the old, vaguer wording out", () => {
    for (const source of [read("src/components/OnboardingFlow.tsx"), read("src/components/AccountSettingsForm.tsx")]) {
      expect(source).not.toContain("Where should we look?");
      expect(source).not.toContain("Your town or area");
      expect(source).not.toContain("e.g. Bath, Somerset");
    }
  });
});
