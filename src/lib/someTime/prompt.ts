import { foodKindOf, isPerformanceVenue } from "@/lib/opportunities/kinds";
import { humanReason } from "@/lib/someTime/copy";
import { cleanTitle } from "@/lib/someTime/experience";
import { MOOD_LABEL, type TimeRequest } from "@/lib/someTime/request";
import type { Evaluated, FoodStop } from "@/lib/someTime/score";
import { clockLabel, durationLabel, type TimeWindow } from "@/lib/someTime/window";
import { describeDailyState, type DailyState } from "@/lib/experience/dailyState";
import { PLAIN_WORDS_RULE } from "@/lib/ai/plainWords";
import { describeContext } from "@/lib/context/constraints";

export const MAX_OPTIONS = 3;
const MAX_WHY_CHARS = 420;
const MAX_DESCRIPTION_CHARS = 150;

const WHO_LABEL: Record<TimeRequest["who"], string> = {
  just_me: "just themself",
  partner: "their partner",
  friends: "a friend or two",
  family: "family, possibly including grandchildren",
};

const KIND_LABEL = { cafe: "café", pub: "pub", restaurant: "restaurant", tea_room: "tea room" } as const;

export type ShortlistEntry = { evaluated: Evaluated; foodStop: FoodStop | null };

export type PromptContext = {
  window: TimeWindow;
  weekdayLabel: string;
  request: TimeRequest;
  weatherNote: string | null;
  profile: {
    goals: string[];
    interests: string[];
    budget_band: string | null;
    dietary: string | null;
    mobility_notes: string | null;
    personality: string | null;
  };
  aspirations: string[];
  affinitySummary: string;
  /** How they said they are today, if they did. */
  dailyState?: DailyState | null;
};

export const SYSTEM_PROMPT = `You are "I've got some time" for "Lark Hour", an AI concierge for people in \
retirement. A member has a stretch of free time and wants a great way to spend it — not a list of events, but a few \
genuinely good ideas they can act on right now.

You are given candidates that have ALREADY been filtered to fit the time, the travel, the opening hours and the \
weather, and ranked best-first by a scoring system that has weighed their location, interests, goals, budget, past \
feedback and what they have done recently. Choose up to ${MAX_OPTIONS}, and never invent anything: only use the \
candidates and facts supplied.

How to choose:
- Prefer the earlier candidates, but reorder or skip when it gives better variety. The ${MAX_OPTIONS} options must be \
genuinely different ways to spend the time — never three similar things. Put the strongest first.
- Respect their mood, who they are with, and anything in their profile (mobility, diet, budget).
- If they have said how they feel today, respect that over their usual habits: on a day they are taking it easy, never choose something strenuous or long, however much they usually enjoy it. How they feel today is only about today.
- Keep the options mixed in cost: at most one that costs more than about £40 a person, unless it is the only good choice. Free and inexpensive ideas are as good as dear ones.
- If fewer than ${MAX_OPTIONS} are genuinely good, return fewer rather than padding.

How to name each outing: give it a short, plain "title" of three to eight words that sounds like a good plan for the \
time ("A slow afternoon in Barnet", "A walk and a late lunch", "An hour with local history"). Use only places and \
words from the candidate's own line; no exclamation marks. Only mention a meal or a drink in the title if you set \
"with_food" to true for that candidate.

How to write each "why": one or two warm sentences (under 45 words) in the second person, no exclamation marks. Say why it suits THEM \
using the supplied reasons, profile and context, and mention one practical detail (for example when it closes, or that \
it is a short walk). Do not state anything about a place that is not in its line below.

${PLAIN_WORDS_RULE}

Venues: a candidate marked "a venue only" is a theatre or cinema building. Nothing says anything is on there today. Never describe a show, a film, a performance or "a night out" there as if one exists, and never call the outing "an evening of theatre" or similar. Say it is worth checking what's on before going.

Food: a candidate may list "then nearby" — a café, pub, restaurant or tea room close by that fits the time of day. Set \
"with_food" to true only for a candidate that lists one AND where finishing there makes sense for the time and mood; \
otherwise false. Never set it true without a "then nearby" entry.

Respond with ONLY valid JSON, no prose, no markdown fences: {"options": [{"id": "<id from candidates>", "title": "<outing title>", "why": "<text>", "with_food": true|false}]}`;

function candidateLine({ evaluated: e, foodStop }: ShortlistEntry): string {
  const c = e.candidate;
  const description = c.description ? ` | about: ${c.description.replace(/\s+/g, " ").slice(0, MAX_DESCRIPTION_CHARS)}` : "";
  const scored = e.reasons.length ? ` | why it scored well: ${e.reasons.join("; ")}` : "";
  let food = "";
  if (foodStop) {
    const kind = foodKindOf(foodStop.candidate.tags);
    const open = foodStop.openUntil != null ? `, open until ${clockLabel(foodStop.openUntil)}` : "";
    food = ` | then nearby: ${foodStop.candidate.title} (${kind ? KIND_LABEL[kind] : "food"}, ${foodStop.distanceMeters} m away, ${foodStop.meal}${open})`;
  }
  const venueOnly = isPerformanceVenue(c) && e.eventStartMin === null ? " | NOTE: a venue only: no show or film is listed for it" : "";
  const toCheck = e.unverified?.length ? ` | NOTE: not confirmed, tell them to check: ${e.unverified.join("; ")}` : "";
  return (
    `- id=${c.id} | ${c.title} | ${c.category} | ${e.facts.join(", ")} | ` +
    `leave ${clockLabel(e.leaveMin)}, arrive ${clockLabel(e.arriveMin)}, home about ${clockLabel(e.homeMin)} | ` +
    `tags=[${c.tags.filter((t) => t !== "food-venue").slice(0, 6).join(", ")}]${description}${scored}${food}${venueOnly}${toCheck}`
  );
}

export function buildUserPrompt(ctx: PromptContext, shortlist: ShortlistEntry[]): string {
  const { window, request, profile } = ctx;
  const lines = [
    `Free time: ${ctx.weekdayLabel}, from ${clockLabel(window.startMin)} for about ${durationLabel(window.availableMinutes)} (back by ${clockLabel(window.endMin)}).`,
    `Who with: ${WHO_LABEL[request.who]}.`,
    `Mood: ${request.mood ? MOOD_LABEL[request.mood] : "not specified"}.`,
    ctx.weatherNote ? `Weather: ${ctx.weatherNote}` : null,
    ctx.dailyState ? `How they say they are today: ${describeDailyState(ctx.dailyState)}.` : null,
    ...describeContext(request.context),
    "",
    "About the member:",
    `- Goals: ${profile.goals.join(", ") || "none recorded"}`,
    `- Interests: ${profile.interests.join(", ") || "none recorded"}`,
    `- Budget: ${profile.budget_band === "any" ? "does not worry much about cost" : (profile.budget_band ?? "not specified")}`,
    `- Dietary: ${profile.dietary ?? "none recorded"}`,
    `- Mobility: ${profile.mobility_notes ?? "none recorded"}`,
    `- Free-time style: ${profile.personality ?? "not recorded"}`,
    `- Things they said they would still love to do: ${ctx.aspirations.join(", ") || "none recorded"}`,
    `- What they have enjoyed recently: ${ctx.affinitySummary}`,
    "",
    "Candidates, best first:",
    ...shortlist.map(candidateLine),
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

export type Choice = { id: string; why: string; withFood: boolean; /** A usable outing title, or null if none was given or it could not be trusted. */ title: string | null };

/**
 * Reads the model's reply. Strict about what it keeps: only ids that were really
 * offered, no repeats, a real explanation, at most MAX_OPTIONS — and food only
 * where a food stop was actually available.
 */
export function parseChoices(text: string, validIds: Set<string>, idsWithFood: Set<string>): Choice[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const options = (parsed as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];

  const seen = new Set<string>();
  const choices: Choice[] = [];
  for (const raw of options) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, why, with_food, title } = raw as { id?: unknown; why?: unknown; with_food?: unknown; title?: unknown };
    if (typeof id !== "string" || !validIds.has(id) || seen.has(id)) continue;
    if (typeof why !== "string" || !why.trim()) continue;
    seen.add(id);
    choices.push({
      id,
      why: why.trim().slice(0, MAX_WHY_CHARS),
      withFood: with_food === true && idsWithFood.has(id),
      title: cleanTitle(title),
    });
    if (choices.length >= MAX_OPTIONS) break;
  }
  return choices;
}

/** An honest explanation built only from facts we hold, for when the model is unavailable. */
export function fallbackWhy(e: Evaluated): string {
  const reason = humanReason(e.reasons);
  const lead = reason ? `${reason} ` : "";
  const away = e.travelMode === "walk" ? `a ${e.travelMinutes}-minute walk` : `about ${e.travelMinutes} minutes away`;
  return `${lead}It is ${away} and takes about ${durationLabel(e.durationMinutes)}.`;
}
