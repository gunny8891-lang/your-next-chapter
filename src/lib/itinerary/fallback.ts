import type { GeneratedItem, GeneratedItinerary } from "@/lib/itinerary/schema";
import { DAYS_OF_WEEK } from "@/lib/itinerary/schema";
import { scoreActivity, type AffinityScores } from "@/lib/memory/scoring";
import { parseOpeningHours } from "@/lib/someTime/openingHours";

type CandidateActivity = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  rating: number | null;
  /** Opening hours or the times a group meets, when known: an item is only placed on a day it is on. */
  recurrence_rule?: string | null;
};

type Day = (typeof DAYS_OF_WEEK)[number];
type Slot = GeneratedItem["slot"];

/** Roughly what the rules in the schema ask for: a week of five to seven things, never more than two of one kind. */
const TARGET_ITEMS = 6;
const MAX_ITEMS = 7;
const MAX_PER_CATEGORY = 2;

/**
 * Where an item with no day of its own goes, in order: spread across the week, mornings and afternoons alternating, with
 * the weekend afternoon and morning for something longer. Evenings are left for what is actually on in the evening.
 */
const OPEN_SLOTS: { day: Day; slot: Slot }[] = [
  { day: "Mon", slot: "morning" },
  { day: "Tue", slot: "afternoon" },
  { day: "Wed", slot: "morning" },
  { day: "Thu", slot: "afternoon" },
  { day: "Fri", slot: "morning" },
  { day: "Sat", slot: "afternoon" },
  { day: "Sun", slot: "morning" },
  { day: "Mon", slot: "afternoon" },
  { day: "Wed", slot: "afternoon" },
  { day: "Fri", slot: "afternoon" },
  { day: "Sat", slot: "morning" },
  { day: "Sun", slot: "afternoon" },
];

function slotFor(startMin: number): Slot {
  const hour = startMin / 60;
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** The (day, slot) pairs an item with known times can go in: each day it is on, in the part of the day it starts. */
function slotsFromSchedule(rule: string | null | undefined): { day: Day; slot: Slot }[] | null {
  const week = parseOpeningHours(rule);
  if (!week) return null;
  const found: { day: Day; slot: Slot }[] = [];
  DAYS_OF_WEEK.forEach((day, index) => {
    const first = week[index][0];
    if (first) found.push({ day, slot: slotFor(Math.max(first[0], 0)) });
  });
  return found.length > 0 ? found : null;
}

/**
 * The week when the planner could not be used (the AI is unavailable, or twice gave something that broke the rules).
 *
 * It is a week a person would be glad to open: five to seven things (as many as there are), the best liked first, never more
 * than two of a kind and as many different kinds as there are, spread over the days with mornings and afternoons mixed,
 * and anything that meets on certain days placed on one of them. It uses the same scoring as the planner's own shortlist,
 * so what the member has enjoyed still counts.
 */
export function buildFallbackItinerary(candidates: CandidateActivity[], affinity: AffinityScores): GeneratedItinerary {
  const scored = [...candidates].sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity));

  // First the best of each kind, so the week has variety; then the next best, two of a kind at most.
  const chosen: CandidateActivity[] = [];
  const perCategory = new Map<string, number>();
  const take = (activity: CandidateActivity) => {
    chosen.push(activity);
    perCategory.set(activity.category, (perCategory.get(activity.category) ?? 0) + 1);
  };
  for (const activity of scored) {
    if (chosen.length >= MAX_ITEMS) break;
    if (!perCategory.has(activity.category)) take(activity);
  }
  for (const activity of scored) {
    if (chosen.length >= TARGET_ITEMS) break;
    if (chosen.includes(activity) || (perCategory.get(activity.category) ?? 0) >= MAX_PER_CATEGORY) continue;
    take(activity);
  }
  // More kinds than the target is fine (the planner prefers variety), but keep the week to a sensible length.
  const picked = chosen.slice(0, MAX_ITEMS);

  // Place the ones that are only on certain days first, since they have the fewest choices.
  const withSchedule = picked.map((activity) => ({ activity, own: slotsFromSchedule(activity.recurrence_rule) }));
  const order = [...withSchedule].sort((a, b) => (a.own?.length ?? 99) - (b.own?.length ?? 99));

  const taken = new Set<string>();
  const key = (s: { day: Day; slot: Slot }) => `${s.day}|${s.slot}`;
  const placed = new Map<string, { day: Day; slot: Slot }>();
  for (const { activity, own } of order) {
    const options = own ?? OPEN_SLOTS;
    const spot = options.find((s) => !taken.has(key(s))) ?? OPEN_SLOTS.find((s) => !taken.has(key(s)));
    if (!spot) continue;
    taken.add(key(spot));
    placed.set(activity.id, spot);
  }

  const items: GeneratedItem[] = picked
    .filter((activity) => placed.has(activity.id))
    .map((activity) => ({
      day: placed.get(activity.id)!.day,
      slot: placed.get(activity.id)!.slot,
      activity_id: activity.id,
      rationale: `A well-regarded ${activity.category.toLowerCase()} choice near you, chosen from what you have enjoyed before.`,
    }));

  // Monday first, morning before afternoon, as a person would read it.
  items.sort((a, b) => DAYS_OF_WEEK.indexOf(a.day) - DAYS_OF_WEEK.indexOf(b.day) || ["morning", "afternoon", "evening"].indexOf(a.slot) - ["morning", "afternoon", "evening"].indexOf(b.slot));
  return { items };
}
