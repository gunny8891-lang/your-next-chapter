/**
 * Two kinds of fact about a place that decide whether it suits someone today, held as what we KNOW:
 * what it costs, and whether a dog can come. Both are stored with how sure we are, and "we do not
 * know" is a real answer, never filled in by a guess. Pure: reads a catalogue row, changes nothing.
 */

// ---- dogs ---------------------------------------------------------------

export const DOG_ACCESS = ["allowed", "outdoor_only", "selected_areas", "assistance_dogs_only", "not_allowed", "unknown"] as const;
export type DogAccess = (typeof DOG_ACCESS)[number];
export type DogConfidence = "verified" | "reported" | "unknown";

export type DogFacts = {
  dog_access?: string | null;
  dog_restrictions?: string | null;
  dog_confidence?: string | null;
  dog_source?: string | null;
};

/** A stored value read back safely: anything unrecognised is "unknown", never a guess in either direction. */
export function parseDogAccess(value: unknown): DogAccess {
  return typeof value === "string" && (DOG_ACCESS as readonly string[]).includes(value) ? (value as DogAccess) : "unknown";
}

export function parseDogConfidence(value: unknown): DogConfidence {
  return value === "verified" || value === "reported" ? value : "unknown";
}

/**
 * Can a dog come? true when some of the place is open to a pet dog, false when none of it is, null when
 * we do not know. Assistance dogs are a different thing from a pet dog, so that is false here.
 */
export function dogFriendly(facts: DogFacts): boolean | null {
  switch (parseDogAccess(facts.dog_access)) {
    case "allowed":
    case "outdoor_only":
    case "selected_areas":
      return true;
    case "assistance_dogs_only":
    case "not_allowed":
      return false;
    default:
      return null;
  }
}

/** Known to refuse a pet dog: the only thing that is left out when the dog is coming. */
export function refusesDogs(facts: DogFacts): boolean {
  return dogFriendly(facts) === false;
}

// ---- cost ---------------------------------------------------------------

export type PriceType = "free" | "entry" | "per_person" | "from" | "unknown";
export type CostConfidence = "known" | "estimated" | "unknown";
export type CostTier = "free" | "low" | "mid" | "high";

export type CostFacts = {
  price_estimate?: number | string | null;
  price_min?: number | string | null;
  price_max?: number | string | null;
  price_type?: string | null;
  cost_confidence?: string | null;
};

/** The tiers' upper limits per person, in pounds: Free is 0, £ up to 15, ££ up to 40, £££ above. */
export const COST_TIER_LIMITS = { low: 15, mid: 40 } as const;

const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** What it costs per person at the low end, or null when nothing is known. The estimate stands in for a range that was never stored. */
export function priceFrom(facts: CostFacts): number | null {
  if (facts.price_type === "free") return 0;
  return asNumber(facts.price_min) ?? asNumber(facts.price_estimate);
}

/** The most it is likely to cost per person, or null when nothing is known. */
export function priceUpTo(facts: CostFacts): number | null {
  if (facts.price_type === "free") return 0;
  return asNumber(facts.price_max) ?? asNumber(facts.price_estimate) ?? asNumber(facts.price_min);
}

/** How a price counts as a tier. Null when the price is not known: an unknown price is never shown as "Free". */
export function costTierOf(facts: CostFacts): CostTier | null {
  const top = priceUpTo(facts);
  if (top === null) return null;
  if (top === 0) return "free";
  if (top <= COST_TIER_LIMITS.low) return "low";
  if (top <= COST_TIER_LIMITS.mid) return "mid";
  return "high";
}

export function parseCostConfidence(value: unknown): CostConfidence {
  return value === "known" || value === "estimated" ? value : "unknown";
}

export const COST_TIER_LABEL: Record<CostTier, string> = { free: "Free", low: "£", mid: "££", high: "£££" };
