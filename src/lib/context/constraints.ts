/**
 * Experience context: facts about THIS outing that the member can state and that decide whether
 * something works, as opposed to what they like in general. "The dog is coming" is the first; others
 * ("my grandchildren are coming", "no car today", "somewhere I can sit") are the same shape, and
 * adding one means adding a field to ExperienceContext and one entry to CONSTRAINTS below. Nothing
 * else in the engine needs to learn about it.
 *
 * Each constraint looks at one place and gives one of three answers:
 *   ok         it works (and may say why, or add a line for the card);
 *   exclude    it is known not to work, so it is left out;
 *   unverified we cannot tell, and say so ("Check dog access") rather than guess either way.
 *
 * The engine offers only what outright works when anything does; places that need checking are
 * offered, labelled, only when nothing that is certain fits. Pure: no database, no model.
 */

import { COST_TIER_LIMITS, dogFact, dogFriendly, parseDogConfidence, priceUpTo, type CostFacts, type DogFacts } from "@/lib/opportunities/facts";

/** What the member wants to spend on this outing, per person: Free, £ or ££. Absent means "don't mind". */
export type Spend = "free" | "low" | "mid";
export const SPEND_OPTIONS: { value: Spend | "any"; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "low", label: "£" },
  { value: "mid", label: "££" },
  { value: "any", label: "Don't mind" },
];

/** The most each spend allows per person, in pounds. */
const SPEND_CAP: Record<Spend, number> = { free: 0, low: COST_TIER_LIMITS.low, mid: COST_TIER_LIMITS.mid };

export type ExperienceContext = {
  /** The dog is coming on this outing. */
  dog?: boolean;
  /** The most they want to spend per person on this outing. A choice for this outing, not a budget. */
  spend?: Spend;
};

/** What a place tells us that the constraints look at. */
export type PlaceFacts = DogFacts & CostFacts & { tags?: string[] };

/**
 * When the dog is coming and a place has not said whether dogs are allowed, outdoor places are put ahead of
 * indoor ones. That is only an order for places we have to ask the member to check anyway: being outdoors
 * never makes a place count as dog-friendly (it stays "Check dog access"), it is simply more likely to be
 * worth the check than a gym or a cinema.
 */
const OUTDOOR_FOR_DOG = ["outdoors", "walking", "nature", "gardens", "park", "wildlife", "cycling", "views"];
const INDOOR_FOR_DOG = ["indoor", "theatre", "cinema", "museum", "swimming", "fitness", "yoga", "classes", "books", "gentle exercise", "arts"];
const UNCONFIRMED_OUTDOOR_BONUS = 1.5;
const UNCONFIRMED_INDOOR_PENALTY = 1.5;

function unconfirmedDogOrder(tags: string[] | undefined): number {
  if (tags?.some((t) => OUTDOOR_FOR_DOG.includes(t))) return UNCONFIRMED_OUTDOOR_BONUS;
  if (tags?.some((t) => INDOOR_FOR_DOG.includes(t))) return -UNCONFIRMED_INDOOR_PENALTY;
  return 0;
}

/** A place on an outing: the main thing, or a stop (such as somewhere to eat) added to it. Each must work. */
export type ConstraintRole = "main" | "stop";

export type Verdict =
  | { kind: "ok"; /** A clause the explanation can use. */ reason?: string; /** A short line for the card. */ fact?: string; /** Added to the score. */ bonus?: number }
  | { kind: "exclude" }
  | { kind: "unverified"; /** What to tell the member: "Check dog access". */ note: string; /** Ordering among the unconfirmed only: it never says the place suits. */ bonus?: number };

type Constraint = {
  key: keyof ExperienceContext;
  /** Reads what arrived from the browser; undefined means "not stated" (anything unrecognised is dropped). */
  parse: (raw: unknown) => ExperienceContext[keyof ExperienceContext] | undefined;
  /** Whether this context asks anything of a place. */
  active: (context: ExperienceContext) => boolean;
  check: (place: PlaceFacts, context: ExperienceContext, role: ConstraintRole) => Verdict;
  /** One line for the model: what the member has said about this outing. */
  describe: (context: ExperienceContext) => string | null;
};

const dogConstraint: Constraint = {
  key: "dog",
  parse: (raw) => (typeof raw === "boolean" ? raw : undefined),
  active: (context) => context.dog === true,
  check: (place) => {
    const friendly = dogFriendly(place);
    // Known to refuse pet dogs: out, however well it fits in other ways.
    if (friendly === false) return { kind: "exclude" };
    // Something is recorded, but with nothing behind it (no source, no report): not enough to promise.
    if (friendly === true && parseDogConfidence(place.dog_confidence) !== "unknown") {
      return { kind: "ok", reason: "dogs are welcome, so the dog can come", fact: dogFact(place) ?? undefined, bonus: 1 };
    }
    return { kind: "unverified", note: "Check dog access", bonus: unconfirmedDogOrder(place.tags) };
  },
  describe: (context) => (context.dog === true ? "The dog is coming. Only say dogs are welcome where a line says so; where a line says to check dog access, tell them to check." : null),
};

const spendConstraint: Constraint = {
  key: "spend",
  parse: (raw) => (raw === "free" || raw === "low" || raw === "mid" ? raw : undefined),
  active: (context) => context.spend !== undefined,
  check: (place, context) => {
    const cap = SPEND_CAP[context.spend as Spend];
    const top = priceUpTo(place);
    // Nothing is known about the price: it is not assumed to fit, and not assumed not to.
    if (top === null) return { kind: "unverified", note: "Check the price" };
    return top > cap ? { kind: "exclude" } : { kind: "ok" };
  },
  describe: (context) =>
    context.spend === undefined
      ? null
      : `They want to keep this outing to ${{ free: "free things", low: "about £15 a person or less", mid: "about £40 a person or less" }[context.spend]}. Never call a place free or cheap unless its line says so; where a line says to check the price, tell them to check.`,
};

/** Every constraint the engine knows. */
const CONSTRAINTS: Constraint[] = [dogConstraint, spendConstraint];

/** Keeps only what a constraint recognises, from whatever arrived. Never throws. */
export function parseContext(raw: unknown): ExperienceContext {
  const out: ExperienceContext = {};
  if (typeof raw !== "object" || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const c of CONSTRAINTS) {
    const value = c.parse(source[c.key]);
    if (value !== undefined) (out as Record<string, unknown>)[c.key] = value;
  }
  return out;
}

/** True when the context asks anything of a place at all. */
export function hasActiveConstraints(context: ExperienceContext | undefined): boolean {
  return Boolean(context) && CONSTRAINTS.some((c) => c.active(context!));
}

export type ConstraintResult = {
  excluded: boolean;
  /** What needs checking, one line each; empty when everything is certain. */
  unverified: string[];
  reasons: string[];
  facts: string[];
  bonus: number;
};

/** Every active constraint's verdict on one place, gathered. */
export function checkConstraints(place: PlaceFacts, context: ExperienceContext | undefined, role: ConstraintRole = "main"): ConstraintResult {
  const result: ConstraintResult = { excluded: false, unverified: [], reasons: [], facts: [], bonus: 0 };
  if (!context) return result;
  for (const c of CONSTRAINTS) {
    if (!c.active(context)) continue;
    const verdict = c.check(place, context, role);
    if (verdict.kind === "exclude") result.excluded = true;
    else if (verdict.kind === "unverified") {
      result.unverified.push(verdict.note);
      result.bonus += verdict.bonus ?? 0;
    } else {
      if (verdict.reason) result.reasons.push(verdict.reason);
      if (verdict.fact) result.facts.push(verdict.fact);
      result.bonus += verdict.bonus ?? 0;
    }
  }
  return result;
}

/**
 * If anything works outright, only those; if nothing does, those that need checking (each labelled).
 * "Fewer, better" over a longer list of maybes.
 */
export function preferVerified<T extends { unverified?: string[] }>(items: T[]): T[] {
  const certain = items.filter((i) => !i.unverified?.length);
  return certain.length > 0 ? certain : items;
}

/** What the member has said about this outing, for the model; empty when they said nothing. */
export function describeContext(context: ExperienceContext | undefined): string[] {
  if (!context) return [];
  return CONSTRAINTS.map((c) => c.describe(context)).filter((line): line is string => line !== null);
}

/** Whether a place to eat or stop at can be added to an outing under this context: it must work outright, not merely maybe. */
export function stopWorks(place: PlaceFacts, context: ExperienceContext | undefined): boolean {
  const r = checkConstraints(place, context, "stop");
  return !r.excluded && r.unverified.length === 0;
}

/** Whether a whole outing's cost per person fits what they want to spend: the main thing and the stop together, not each alone. */
export function withinSpend(totalPerPerson: number, context: ExperienceContext | undefined): boolean {
  return context?.spend === undefined || totalPerPerson <= SPEND_CAP[context.spend];
}
