export type BehavioralRationale = { tag: string; count: number };

/** Kept out of caller components so `Date.now()` isn't called directly during render. */
export function getRecentWindowStartIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Finds the strongest real signal behind recommending `activity` to this member:
 * the tag it shares with the most distinct activities the member has actually
 * liked (accepted) in the last 4 weeks. Returns null when there's no shared tag
 * at all — callers must not invent a reason in that case (e.g. fallback picks
 * with no real behavioral link).
 */
export function computeBehavioralRationale(
  activity: { id: string; tags: string[] },
  recentLikedActivities: { id: string; tags: string[] }[]
): BehavioralRationale | null {
  const tagToLikedIds = new Map<string, Set<string>>();

  for (const liked of recentLikedActivities) {
    if (liked.id === activity.id) continue; // "another" shouldn't count the same activity liked before
    for (const tag of liked.tags) {
      if (!activity.tags.includes(tag)) continue;
      if (!tagToLikedIds.has(tag)) tagToLikedIds.set(tag, new Set());
      tagToLikedIds.get(tag)!.add(liked.id);
    }
  }

  let best: BehavioralRationale | null = null;
  for (const [tag, ids] of tagToLikedIds) {
    if (!best || ids.size > best.count) best = { tag, count: ids.size };
  }
  return best;
}

export function formatBehavioralRationale({ tag, count }: BehavioralRationale): string {
  const noun = count === 1 ? "activity" : "activities";
  return `You've enjoyed ${count} ${tag} ${noun} this month, so we found another.`;
}
