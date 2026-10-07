import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_INPUT_FIELDS, changedPlanInputs, planInputsChanged, type PlanInputs } from "@/lib/account/planInputs";

const saved: PlanInputs = {
  location_text: "Richmond, London",
  travel_radius_km: "16.09", // the database may hand a number back as text
  budget_band: "medium",
  dietary_preferences: "vegetarian",
  mobility_notes: null,
  drives: false,
  uses_public_transport: true,
  interests: ["walking", "books"],
  goals: ["meet_people"],
};

const same = (): PlanInputs => ({ ...saved, travel_radius_km: 16.09 });

describe("did saving change anything that shapes the plan?", () => {
  it("says no when nothing changed, whatever form the values come in", () => {
    expect(planInputsChanged(saved, same())).toBe(false);
  });

  it("treats empty, missing and null as the same", () => {
    expect(planInputsChanged({ ...saved, mobility_notes: "" }, same())).toBe(false);
    expect(planInputsChanged({ ...saved, mobility_notes: undefined }, same())).toBe(false);
    expect(planInputsChanged({ ...saved, drives: null }, same())).toBe(false);
  });

  it("ignores a stray space, and a list written the same way", () => {
    expect(planInputsChanged(saved, { ...same(), location_text: " Richmond, London " })).toBe(false);
    expect(planInputsChanged(saved, { ...same(), interests: ["walking", " books "] })).toBe(false);
  });

  it("says yes for each thing that decides what goes in the week", () => {
    const edits: Partial<PlanInputs>[] = [
      { location_text: "York" },
      { travel_radius_km: 4.8 },
      { budget_band: "low" },
      { dietary_preferences: "no shellfish" },
      { mobility_notes: "no long walks" },
      { drives: true },
      { uses_public_transport: false },
      { interests: ["walking"] },
      { goals: ["stay_active"] },
    ];
    for (const edit of edits) expect(planInputsChanged(saved, { ...same(), ...edit }), JSON.stringify(edit)).toBe(true);
  });

  it("names exactly what changed", () => {
    expect(changedPlanInputs(saved, { ...same(), location_text: "York", budget_band: "high" })).toEqual(["location_text", "budget_band"]);
  });

  it("treats a brand-new profile as changed in whatever it now holds", () => {
    expect(planInputsChanged(null, same())).toBe(true);
  });
});

describe("how saving the Account form is wired", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const action = read("src/app/account/actions.ts");

  it("rebuilds the week only when the comparison says something changed", () => {
    expect(action).toContain("const rebuild = planInputsChanged(existing, submitted);");
    expect(action).toContain("rebuild ? await generateAndSaveItinerary(admin, user.id) : { error: null }");
    // The old unconditional rebuild is gone.
    expect(action).not.toMatch(/const generated = await generateAndSaveItinerary\(admin, user\.id\);/);
  });

  it("compares against what was saved, for every field the comparison covers", () => {
    for (const field of PLAN_INPUT_FIELDS) expect(action, field).toContain(field);
  });

  it("still looks up a new place's events when the location changes, with or without a rebuild", () => {
    expect(action).toMatch(/if \(locationChanged && newLocationText\) \{\s*after\(\(\) => triggerDiscoveryForRegion/);
  });

  it("tells the member when a fresh plan was built, and that their yeses stayed", () => {
    expect(action).toContain('${rebuild ? "&planRebuilt=1" : ""}');
    const form = read("src/components/AccountSettingsForm.tsx");
    expect(form).toContain("we've built a fresh plan for this week");
    expect(form).toContain("Outings you'd already said yes to are still there.");
    expect(form).toContain('"Your details are saved."');
  });
});
