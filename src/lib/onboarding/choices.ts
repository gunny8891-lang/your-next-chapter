/**
 * The two set-up questions about what would make an outing unsuitable or unaffordable, and what each
 * answer means. The wording shown to the member and the value saved live together here, so the question
 * and what it stores cannot drift apart (the flow shows `label`; the save keeps `note` or `band`).
 *
 * Asked at set-up because the first plan is the first impression: it is made straight away, and a plan
 * made without knowing that someone prefers short walks or a low budget is the one they judge us by.
 * Both can be changed later in Account, where the same wording is used.
 */

export type MobilityChoice = { label: string; note: string | null };
export type BudgetChoice = { label: string; band: "low" | "medium" | "high" | null };

export const MOBILITY_HEADING = "Is there anything we should know about getting around?";
export const MOBILITY_INTRO = "Optional. It only helps us avoid ideas that wouldn't suit you. Choose the closest, or the first if none apply.";

export const MOBILITY_CHOICES: MobilityChoice[] = [
  { label: "No, I'm fine to get around", note: null },
  { label: "I prefer shorter walks", note: "Prefers shorter walks" },
  { label: "I need step-free access or somewhere to sit", note: "Needs step-free access and somewhere to sit" },
  { label: "I use a stick, frame or wheelchair", note: "Uses a walking aid or wheelchair" },
];

export const BUDGET_HEADING = "What feels like a comfortable budget for an outing?";
export const BUDGET_INTRO = "Just a guide. You can change it any time in Account.";

export const BUDGET_CHOICES: BudgetChoice[] = [
  { label: "Keep costs low", band: "low" },
  { label: "A moderate budget", band: "medium" },
  { label: "Happy to spend more", band: "high" },
  { label: "No preference", band: null },
];

/** What to keep in the profile's mobility notes for an answer; null for "fine", for an answer we do not recognise, or for none. */
export function mobilityNoteFor(label: string | undefined): string | null {
  return MOBILITY_CHOICES.find((c) => c.label === label)?.note ?? null;
}

/** The budget band for an answer; null for "no preference", an unrecognised answer, or none. */
export function budgetBandFor(label: string | undefined): "low" | "medium" | "high" | null {
  return BUDGET_CHOICES.find((c) => c.label === label)?.band ?? null;
}
