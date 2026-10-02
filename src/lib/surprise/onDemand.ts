import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryName } from "@/lib/categories";
import type { SurpriseOption } from "@/lib/types";
import { summarizeAffinity } from "@/lib/memory/scoring";
import { fetchRankedOpportunities } from "@/lib/opportunities/engine";
import { describeWhen, getCurrentWeekStart, londonToday, type SlotName } from "@/lib/opportunities/schedule";
import { getDailyForecast } from "@/lib/nudges/weather";
import { applyOpenTimeContext, describeWindow, type SurpriseWhen, type SurpriseWho } from "@/lib/surprise/context";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

// Project brief section 21 lists Surprise Me as a smart-tier use case
// (alongside My Week) rather than simple text generation/tagging.
const MODEL = AI_MODELS.smart;
const MAX_CANDIDATES = 20;
const NOVELTY_SLOTS = 5;
const MAX_OPTIONS = 3;

// Defined in context.ts (pure, testable); re-exported so existing imports keep working.
export type { SurpriseWhen, SurpriseWho };

const WHO_LABEL: Record<SurpriseWho, string> = {
  just_me: "just themself",
  partner: "their partner",
  friends: "a friend or two",
  family: "family, possibly including grandchildren",
};

const WHEN_LABEL: Record<SurpriseWhen, string> = {
  today: "today",
  tomorrow: "tomorrow",
  weekend: "this coming weekend",
};

const SLOT_LABEL: Record<SlotName, string> = {
  morning: "this morning",
  afternoon: "this afternoon",
  evening: "this evening",
};

/**
 * On-demand Surprise Me (project brief section 16) — deterministic filtering
 * and affinity scoring happen in plain code first (distance, already-scheduled
 * exclusion, recency-weighted ranking, then the request's own context: which
 * day, which part of it, the weather, who's coming — see context.ts), then a
 * small shortlist goes to Claude
 * to pick up to 3 genuinely varied options with a short rationale. Never
 * invents an activity — every option must come from the real candidate list.
 */
export async function getSurpriseOptions(
  supabase: SupabaseClient,
  memberId: string,
  when: SurpriseWhen,
  who: SurpriseWho,
  slot: SlotName | null = null
): Promise<SurpriseOption[]> {
  const { data: profile } = await supabase
    .from("member_profiles")
    .select("budget_band, interests, location_lat, location_lng")
    .eq("user_id", memberId)
    .maybeSingle();

  // Don't suggest something already on this week's plan.
  const weekStartDate = getCurrentWeekStart();
  const { data: itinerary } = await supabase
    .from("itineraries")
    .select("itinerary_items(activity_id)")
    .eq("member_id", memberId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();
  const scheduledIds = new Set(
    ((itinerary?.itinerary_items ?? []) as { activity_id: string }[]).map((i) => i.activity_id)
  );

  // The forecast is a free, independent call — fetch it alongside the ranking.
  const [{ candidates: allRanked, affinity }, forecast] = await Promise.all([
    fetchRankedOpportunities(supabase, memberId, { excludeActivityIds: scheduledIds }),
    profile?.location_lat != null && profile?.location_lng != null
      ? getDailyForecast(profile.location_lat, profile.location_lng, 7)
      : Promise.resolve(null),
  ]);

  const { candidates: ranked, dates, weatherNote } = applyOpenTimeContext(allRanked, {
    when,
    who,
    slot,
    today: londonToday(),
    forecast,
  });
  if (ranked.length === 0) return [];

  // Deliberate novelty: mostly strong matches, but always leave room for a
  // handful of untried/lower-ranked picks — Surprise Me shouldn't just be
  // "your top-scored list again" (see the brief's own "controlled novelty" aim).
  const topMatches = ranked.slice(0, Math.max(0, MAX_CANDIDATES - NOVELTY_SLOTS));
  const rest = ranked.slice(topMatches.length);
  const noveltyPool = [...rest].sort(() => Math.random() - 0.5).slice(0, NOVELTY_SLOTS);
  const candidates = [...topMatches, ...noveltyPool];

  const candidateList = candidates
    .map((a) => {
      const timing = describeWhen(a);
      const whenText = timing ? (a.expires_at ? ` | ${timing}` : ` | WHEN: ${timing} (fixed)`) : "";
      return `- id=${a.id} | ${a.title} | category=${a.category}${whenText} | tags=[${a.tags.join(", ")}] | price=${a.price_estimate ?? "unknown"} | ${a.address ?? ""}`;
    })
    .join("\n");

  const whenPhrase = slot && when === "today" ? SLOT_LABEL[slot] : (WHEN_LABEL[when] ?? "today");

  const system = `You are the Surprise Me feature for "Your Next Chapter", an AI life concierge. A member wants \
something genuinely appealing to do ${whenPhrase}, choosing only from the candidates provided — never invent \
anything. A candidate marked "WHEN" is a one-off event at exactly that date and time and is only listed because it \
falls in the requested window; "available until" means it is on throughout. Take the weather into account. They'll likely be with ${WHO_LABEL[who]}. Pick up to ${MAX_OPTIONS} options that offer real variety from \
each other (not three similar things), weighing their affinity summary but deliberately including at least one \
option that's a bit of a stretch from their usual pattern — that is the point of "surprise". If fewer than \
${MAX_OPTIONS} candidates are genuinely suitable, return fewer rather than padding with a bad fit. Respond with \
ONLY valid JSON, no prose, no markdown fences: {"options": [{"id": "<id from candidates>", "why": "<one warm, \
second-person sentence, no exclamation marks>"}]}`;

  const user = `Requested for: ${describeWindow(dates)}${slot && when === "today" ? ` (${slot})` : ""}
${weatherNote ? `Weather: ${weatherNote}\n` : ""}${summarizeAffinity(affinity)}
Budget band: ${profile?.budget_band ?? "unknown"}
Interests: ${(profile?.interests ?? []).join(", ") || "none recorded"}

Candidates:
${candidateList}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  const response = await callClaude(client, supabase, { userId: memberId, feature: "surprise_me_on_demand" }, {
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { options: [] };
  const picked = (parsed.options ?? []) as { id?: string; why?: string }[];

  const byId = new Map(candidates.map((a) => [a.id, a]));
  const options: SurpriseOption[] = [];
  for (const p of picked) {
    const activity = p.id ? byId.get(p.id) : undefined;
    if (!activity || !p.why) continue;
    options.push({
      id: activity.id,
      title: activity.title,
      category: activity.category as CategoryName,
      address: activity.address,
      priceEstimate: activity.price_estimate,
      bookingUrl: activity.booking_url,
      why: p.why,
    });
    if (options.length >= MAX_OPTIONS) break;
  }

  return options;
}
