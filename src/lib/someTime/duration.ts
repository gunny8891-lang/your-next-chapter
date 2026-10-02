/**
 * How long something typically takes, so "I have an hour" can be answered
 * honestly. A stored duration (the OpenStreetMap layer writes one per place type)
 * always wins; the rest is a guess from what the thing is, and is only a guess.
 */

type DurationInput = {
  duration_minutes: number | null;
  tags: string[];
  category: string;
};

const MIN_MINUTES = 15;
const MAX_MINUTES = 480;

// First match wins, so more specific tags come first.
const BY_TAG: [string, number][] = [
  ["theatre", 150],
  ["cinema", 150],
  ["afternoon-tea", 90],
  ["museum", 90],
  ["heritage", 120],
  ["history", 90],
  ["classes", 90],
  ["swimming", 45],
  ["yoga", 60],
  ["fitness", 60],
  ["walking", 60],
  ["gardens", 45],
  ["books", 45],
  ["playground", 60],
  ["pub", 60],
  ["restaurant", 75],
  ["cafe", 45],
];

const BY_CATEGORY: Record<string, number> = {
  Move: 60,
  Connect: 90,
  Learn: 90,
  Explore: 90,
  "Give Back": 120,
  Wellness: 60,
  Joy: 90,
};

export function estimateDurationMinutes(a: DurationInput): number {
  if (a.duration_minutes != null && a.duration_minutes > 0) {
    return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, a.duration_minutes));
  }
  for (const [tag, minutes] of BY_TAG) if (a.tags.includes(tag)) return minutes;
  return BY_CATEGORY[a.category] ?? 90;
}
