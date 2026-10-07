import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGET_CHOICES, BUDGET_HEADING, MOBILITY_CHOICES, MOBILITY_HEADING, MOBILITY_INTRO, budgetBandFor, mobilityNoteFor } from "@/lib/onboarding/choices";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("what each answer about getting around means", () => {
  it("keeps nothing for 'I'm fine', and a plain note for each need", () => {
    expect(mobilityNoteFor("No, I'm fine to get around")).toBeNull();
    expect(mobilityNoteFor("I prefer shorter walks")).toBe("Prefers shorter walks");
    expect(mobilityNoteFor("I need step-free access or somewhere to sit")).toBe("Needs step-free access and somewhere to sit");
    expect(mobilityNoteFor("I use a stick, frame or wheelchair")).toBe("Uses a walking aid or wheelchair");
  });

  it("keeps nothing for an answer it does not recognise, or none", () => {
    expect(mobilityNoteFor("something else")).toBeNull();
    expect(mobilityNoteFor(undefined)).toBeNull();
    expect(mobilityNoteFor("")).toBeNull();
  });

  it("has a distinct label for every choice, and only the first is 'nothing to note'", () => {
    const labels = MOBILITY_CHOICES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(MOBILITY_CHOICES[0].note).toBeNull();
    expect(MOBILITY_CHOICES.slice(1).every((c) => c.note && c.note.length > 5)).toBe(true);
  });
});

describe("what each budget answer means", () => {
  it("maps to the same bands the Account page uses", () => {
    expect(budgetBandFor("Keep costs low")).toBe("low");
    expect(budgetBandFor("A moderate budget")).toBe("medium");
    expect(budgetBandFor("Happy to spend more")).toBe("high");
    expect(budgetBandFor("No preference")).toBeNull();
    expect(budgetBandFor("nonsense")).toBeNull();
    expect(budgetBandFor(undefined)).toBeNull();
  });

  it("uses exactly the wording and values of the Account page's budget choices", () => {
    const account = read("src/components/AccountSettingsForm.tsx");
    for (const choice of BUDGET_CHOICES.filter((c) => c.band)) {
      expect(account, choice.label).toContain(`{ value: "${choice.band}", label: "${choice.label}" }`);
    }
    expect(account).toContain("No preference");
  });
});

describe("the set-up asks them, at the right point", () => {
  const flow = read("src/components/OnboardingFlow.tsx");
  const order = (field: string) => flow.indexOf(`field: "${field}"`);

  it("asks about getting around and about budget after how far, and before the last questions", () => {
    expect(order("radius")).toBeGreaterThan(-1);
    expect(order("mobility")).toBeGreaterThan(order("radius"));
    expect(order("budget")).toBeGreaterThan(order("mobility"));
    expect(order("personality")).toBeGreaterThan(order("budget"));
    expect(order("goal")).toBeGreaterThan(order("personality"));
  });

  it("keeps the goal as the last question, since answering the last one is what finishes set-up", () => {
    const steps = flow.slice(flow.indexOf("const STEPS = ["), flow.indexOf("] as const;"));
    expect(steps.lastIndexOf("field:")).toBe(steps.indexOf('field: "goal"'));
  });

  it("takes the wording from the shared choices, so the question and what it saves cannot drift apart", () => {
    expect(flow).toContain("heading: MOBILITY_HEADING");
    expect(flow).toContain("MOBILITY_CHOICES.map((c) => c.label)");
    expect(flow).toContain("heading: BUDGET_HEADING");
    expect(flow).toContain("BUDGET_CHOICES.map((c) => c.label)");
    expect(flow).toContain("Seven short questions");
  });

  it("says the getting-around question is optional and why it is asked", () => {
    expect(MOBILITY_HEADING).toBe("Is there anything we should know about getting around?");
    expect(MOBILITY_INTRO).toMatch(/Optional/);
    expect(MOBILITY_INTRO).toMatch(/avoid ideas that wouldn't suit you/);
    expect(BUDGET_HEADING).toMatch(/comfortable budget/);
  });

  it("saves both answers with the profile, so the very first plan already respects them", () => {
    const action = read("src/app/onboarding/actions.ts");
    expect(action).toContain("mobility_notes: mobilityNoteFor(answers.mobility),");
    expect(action).toContain("budget_band: budgetBandFor(answers.budget),");
    // ...and they are saved before the first plan is made.
    expect(action.indexOf("mobility_notes:")).toBeLessThan(action.indexOf("generateAndSaveItinerary(admin, user.id)"));
  });

  it("uses the same words as the Account page for the getting-around question", () => {
    expect(read("src/components/AccountSettingsForm.tsx")).toContain("Anything we should know about getting around?");
  });
});
