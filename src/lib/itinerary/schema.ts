export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const SLOTS = ["morning", "afternoon", "evening"] as const;
export const CATEGORIES = ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"] as const;

export type GeneratedItem = {
  day: (typeof DAYS_OF_WEEK)[number];
  slot: (typeof SLOTS)[number];
  activity_id: string;
  rationale: string;
};

export type GeneratedItinerary = { items: GeneratedItem[] };

/**
 * Validates the LLM's raw JSON output against the shape and business rules from
 * spec section 6.2/6.3: 5-7 items, each referencing a real candidate activity,
 * at least 4 of 7 categories represented, never more than 2 items per category.
 */
export function validateGeneratedItinerary(
  raw: unknown,
  candidateActivities: { id: string; category: string }[]
): { ok: true; value: GeneratedItinerary } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as Record<string, unknown>).items)) {
    return { ok: false, error: "Response is not an object with an 'items' array." };
  }

  const items = (raw as { items: unknown[] }).items;
  if (items.length < 5 || items.length > 7) {
    return { ok: false, error: `Expected 5-7 items, got ${items.length}.` };
  }

  const activityById = new Map(candidateActivities.map((a) => [a.id, a.category]));
  const categoryCounts = new Map<string, number>();
  const parsed: GeneratedItem[] = [];

  for (const [i, raw_item] of items.entries()) {
    if (typeof raw_item !== "object" || raw_item === null) {
      return { ok: false, error: `Item ${i} is not an object.` };
    }
    const item = raw_item as Record<string, unknown>;
    if (!DAYS_OF_WEEK.includes(item.day as (typeof DAYS_OF_WEEK)[number])) {
      return { ok: false, error: `Item ${i} has invalid day: ${item.day}.` };
    }
    if (!SLOTS.includes(item.slot as (typeof SLOTS)[number])) {
      return { ok: false, error: `Item ${i} has invalid slot: ${item.slot}.` };
    }
    if (typeof item.activity_id !== "string" || !activityById.has(item.activity_id)) {
      return { ok: false, error: `Item ${i} references unknown activity_id: ${item.activity_id}.` };
    }
    if (typeof item.rationale !== "string" || item.rationale.trim().length === 0) {
      return { ok: false, error: `Item ${i} is missing a rationale.` };
    }

    const category = activityById.get(item.activity_id)!;
    const count = (categoryCounts.get(category) ?? 0) + 1;
    categoryCounts.set(category, count);
    if (count > 2) {
      return { ok: false, error: `More than 2 items from category "${category}".` };
    }

    parsed.push({
      day: item.day as (typeof DAYS_OF_WEEK)[number],
      slot: item.slot as (typeof SLOTS)[number],
      activity_id: item.activity_id,
      rationale: item.rationale,
    });
  }

  if (categoryCounts.size < 4) {
    return { ok: false, error: `Only ${categoryCounts.size} categories represented, need at least 4.` };
  }

  return { ok: true, value: { items: parsed } };
}
