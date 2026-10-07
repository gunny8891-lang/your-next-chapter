/**
 * Saving the Account form should rebuild the week only when something that decides what
 * goes in it has changed: where the member is, how far they will go, what they can spend,
 * how they get about, and what they like. A new first name, or saving without changing
 * anything, changes nothing about the plan and must not touch it.
 *
 * Pure, so the comparison can be tested; the save action (app/account/actions.ts) uses it.
 */

export type PlanInputs = {
  location_text: string | null;
  travel_radius_km: number | string | null;
  budget_band: string | null;
  dietary_preferences: string | null;
  mobility_notes: string | null;
  drives: boolean | null;
  uses_public_transport: boolean | null;
  interests: string[] | null;
  goals: string[] | null;
};

export const PLAN_INPUT_FIELDS: (keyof PlanInputs)[] = [
  "location_text",
  "travel_radius_km",
  "budget_band",
  "dietary_preferences",
  "mobility_notes",
  "drives",
  "uses_public_transport",
  "interests",
  "goals",
];

/** Empty and missing mean the same; a number is a number whether the database sent "10" or 10; lists compare as written. */
function normalise(field: keyof PlanInputs, value: PlanInputs[keyof PlanInputs] | undefined): string {
  if (value === null || value === undefined || value === "") return field === "drives" || field === "uses_public_transport" ? "false" : "";
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => String(v).trim()).filter(Boolean));
  if (field === "travel_radius_km") return String(Number(value));
  return String(value).trim();
}

/** The fields that differ between what was saved and what the member just submitted. */
export function changedPlanInputs(before: Partial<PlanInputs> | null | undefined, after: PlanInputs): (keyof PlanInputs)[] {
  return PLAN_INPUT_FIELDS.filter((field) => normalise(field, before?.[field]) !== normalise(field, after[field]));
}

export function planInputsChanged(before: Partial<PlanInputs> | null | undefined, after: PlanInputs): boolean {
  return changedPlanInputs(before, after).length > 0;
}
