import type { GeneratedItem, GeneratedItinerary } from "@/lib/itinerary/schema";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";
import { scoreActivity, type AffinityScores } from "@/lib/memory/scoring";

type CandidateActivity = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  rating: number | null;
};

/**
 * Rules-based fallback per spec section 6.2: if the LLM's output fails validation
 * twice, pick the highest-scoring unused activities (same Memory Agent weighting
 * used for the LLM path), spread across distinct categories.
 */
export function buildFallbackItinerary(candidates: CandidateActivity[], affinity: AffinityScores): GeneratedItinerary {
  const scored = [...candidates].sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity));

  const items: GeneratedItem[] = [];
  const usedCategories = new Set<string>();

  for (const activity of scored) {
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
