import type { GeneratedItem, GeneratedItinerary } from "@/lib/itinerary/schema";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";

type CandidateActivity = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  rating: number | null;
};

/**
 * Rules-based fallback per spec section 6.2: if the LLM's output fails validation
 * twice, pick the highest-rated unused activities matching the member's top interests,
 * spread across distinct categories.
 */
export function buildFallbackItinerary(
  candidates: CandidateActivity[],
  topInterests: string[]
): GeneratedItinerary {
  const scored = candidates
    .map((a) => ({
      activity: a,
      matchesInterest: topInterests.some((interest) => a.tags.includes(interest)),
    }))
    .sort((a, b) => {
      if (a.matchesInterest !== b.matchesInterest) return a.matchesInterest ? -1 : 1;
      return (b.activity.rating ?? 0) - (a.activity.rating ?? 0);
    });

  const items: GeneratedItem[] = [];
  const usedCategories = new Set<string>();

  for (const { activity } of scored) {
    if (items.length >= 7) break;
    if (usedCategories.has(activity.category)) continue;
    usedCategories.add(activity.category);
    items.push({
      day: DAYS_OF_WEEK[items.length],
      slot: "morning",
      activity_id: activity.id,
      rationale: `A highly-rated ${activity.category.toLowerCase()} activity picked for you while we fine-tune your personalised recommendations.`,
    });
  }

  return { items };
}
