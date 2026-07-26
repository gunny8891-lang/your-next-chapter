import { CATEGORIES } from "@/lib/itinerary/schema";

export type PreferenceSignalRow = {
  signal_type: string;
  activity_id: string | null;
  created_at: string;
  activities: { category: string; tags: string[] } | null;
};

export type AffinityScores = {
  categoryScores: Record<string, number>;
  tagScores: Record<string, number>;
  activityScores: Record<string, number>;
  recentCategoryCounts: Record<string, number>;
};

/**
 * MVP weighted scoring per spec section 6.1 (Memory Agent) — a simple
 * hand-tuned weight per signal_type, decayed by recency, aggregated per
 * category/tag/activity. Phase 2 upgrades this to an embedding-based model.
 */
function signalWeight(signalType: string): number {
  switch (signalType) {
    case "liked":
      return 2;
    case "disliked":
      return -2;
    case "too_similar":
    case "too_far":
    case "too_expensive":
    case "wrong_pace":
      return -1;
    default:
      return 0;
  }
}

function recencyMultiplier(createdAt: string): number {
  const daysAgo = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0.3, 1 - daysAgo / 28);
}

export function computeAffinity(signals: PreferenceSignalRow[]): AffinityScores {
  const categoryScores: Record<string, number> = {};
  const tagScores: Record<string, number> = {};
  const activityScores: Record<string, number> = {};
  const recentCategoryCounts: Record<string, number> = {};

  for (const signal of signals) {
    const weight = signalWeight(signal.signal_type) * recencyMultiplier(signal.created_at);

    if (signal.activities) {
      const category = signal.activities.category;
      categoryScores[category] = (categoryScores[category] ?? 0) + weight;
      recentCategoryCounts[category] = (recentCategoryCounts[category] ?? 0) + 1;
      for (const tag of signal.activities.tags) {
        tagScores[tag] = (tagScores[tag] ?? 0) + weight;
      }
    }

    if (signal.activity_id) {
      activityScores[signal.activity_id] = (activityScores[signal.activity_id] ?? 0) + weight;
    }
  }

  return { categoryScores, tagScores, activityScores, recentCategoryCounts };
}

/** Categories with no recent signal at all — candidates to fill the week's balance. */
export function findCategoryGaps(recentCategoryCounts: Record<string, number>): string[] {
  return CATEGORIES.filter((category) => !recentCategoryCounts[category]);
}

export function scoreActivity(
  activity: { id: string; category: string; tags: string[]; rating: number | null },
  affinity: AffinityScores
): number {
  const categoryScore = affinity.categoryScores[activity.category] ?? 0;
  const tagScore = activity.tags.reduce((sum, tag) => sum + (affinity.tagScores[tag] ?? 0), 0);
  const activityScore = affinity.activityScores[activity.id] ?? 0;
  return categoryScore + tagScore + activityScore * 1.5 + (activity.rating ?? 0);
}

/** Renders a short, human-readable summary for the LLM prompt in place of a raw signal log. */
export function summarizeAffinity(affinity: AffinityScores): string {
  const categoryLines = Object.entries(affinity.categoryScores)
    .sort((a, b) => b[1] - a[1])
    .map(([category, score]) => `${category}: ${score > 0 ? "+" : ""}${score.toFixed(1)}`);
  const gaps = findCategoryGaps(affinity.recentCategoryCounts);

  const lines = [
    categoryLines.length ? `Category affinity scores (higher = more positively received recently): ${categoryLines.join(", ")}.` : null,
    gaps.length ? `Categories with no recent activity — prioritize these to keep the week balanced: ${gaps.join(", ")}.` : null,
  ].filter(Boolean);

  return lines.length ? lines.join(" ") : "No history yet — this is the member's first week.";
}
