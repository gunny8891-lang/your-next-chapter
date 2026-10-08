import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateGeneratedItinerary, type GeneratedItinerary } from "@/lib/itinerary/schema";
import { buildFallbackItinerary } from "@/lib/itinerary/fallback";
import { summarizeAffinity } from "@/lib/memory/scoring";
import { fetchRankedOpportunities, selectBalanced, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { alignToEvents, describeWhen, fitsDates, getCurrentWeekStart, londonToday, weekDates } from "@/lib/opportunities/schedule";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";
import { PLAIN_WORDS_RULE } from "@/lib/ai/plainWords";
import { limitSignUpRoles } from "@/lib/itinerary/limitSignUpRoles";
import { isHallVenue } from "@/lib/opportunities/kinds";

const MODEL = AI_MODELS.smart;
const MAX_CANDIDATES_SENT_TO_LLM = 40;
// Floor per category so a week can be balanced even when one category dominates the ranking.
const MIN_CANDIDATES_PER_CATEGORY = 4;
// An activity is treated as a hard exclusion once its weighted score drops this low —
// roughly two recent "disliked" signals against it.
const DISLIKE_EXCLUSION_THRESHOLD = -3;

type ProfileForPrompt = {
  location_text: string | null;
  travel_radius_km: number | null;
  personality: unknown;
  goals: string[];
  interests: string[];
  budget_band: string | null;
  dietary_preferences: string | null;
  mobility_notes: string | null;
};

function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function buildPrompt(
  profile: ProfileForPrompt,
  activities: OpportunityCandidate[],
  affinitySummary: string,
  aspirations: string[],
  weekContext: string
) {
  const candidateList = activities
    .map((a) => {
      const accessibility = a.accessibility_notes ? ` | accessibility: ${a.accessibility_notes}` : "";
      const when = describeWhen(a);
      const whenText = when ? (a.expires_at ? ` | ${when}` : ` | WHEN: ${when} (fixed)`) : "";
      return `- id=${a.id} | ${a.title} | category=${a.category}${whenText} | tags=[${a.tags.join(", ")}] | price=${a.price_estimate ?? "unknown"} | ${a.address ?? ""}${accessibility}`;
    })
    .join("\n");

  const system = `You are the Itinerary Agent for "Lark Hour", an AI retirement concierge. \
Build a balanced weekly plan of 5-7 activities for a member, chosen only from the candidate activities provided. \
Rules: aim for at least 4 of the 7 categories (Move, Connect, Learn, Explore, Give Back, Wellness, Joy), \
never pick more than 2 items from the same category, weigh the member's affinity scores and category gaps below \
when choosing, and respect the member's mobility notes and dietary preferences — never pick something clearly \
unsuitable for them (e.g. a long strenuous walk for someone with limited mobility). If the member's interests or \
goals mention grandchildren or family visits, include one family-friendly outing (soft play, a park, a playground) \
suitable for a grandparent to take a grandchild to, when a genuinely suitable one exists among the candidates — \
never force one in if nothing suitable is available. If a candidate activity is a genuine, specific step toward one \
of the member's "My Chapter" aspirations below, say so plainly in that item's rationale (e.g. "You mentioned wanting \
to learn photography — this beginner walk is a great low-pressure way to start.") — only when the connection is \
real, never a stretch. ${PLAIN_WORDS_RULE} A candidate marked "WHEN" is a one-off event at that exact day and time: if you choose it, schedule it on that day. One marked "available until" can go on any day up to that date. Respond with ONLY valid JSON matching this exact shape, no prose, no markdown fences: \
{"items": [{"day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun", "slot": "morning"|"afternoon"|"evening", "activity_id": "<id from candidates>", "rationale": "<one sentence, second person, warm tone>"}]}`;

  const user = `${weekContext}

Member profile:
- Location: ${profile.location_text ?? "unknown"}
- Travel radius: ${profile.travel_radius_km ?? "unknown"} km
- Personality: ${JSON.stringify(profile.personality)}
- Goals: ${profile.goals.join(", ") || "none recorded"}
- Interests: ${profile.interests.join(", ") || "none recorded"}
- Budget band: ${profile.budget_band ?? "unknown"}
- Dietary preferences: ${profile.dietary_preferences ?? "none recorded"}
- Mobility notes: ${profile.mobility_notes ?? "none recorded"}
- My Chapter aspirations (things they'd still love to do): ${aspirations.join(", ") || "none recorded"}

Member history (Memory Agent summary, last 4 weeks):
${affinitySummary}

Candidate activities, ordered by how well they match this member's history (choose activity_id only from this list):
${candidateList}`;

  return { system, user };
}

async function requestItinerary(
  supabase: SupabaseClient,
  memberId: string,
  system: string,
  user: string,
  correction?: string
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  if (correction) {
    messages.push({ role: "assistant", content: "(invalid JSON omitted)" });
    messages.push({ role: "user", content: `Your last response was invalid: ${correction}. Please respond again with ONLY the corrected JSON.` });
  }

  const response = await callClaude(client, supabase, { userId: memberId, feature: "itinerary_agent" }, {
    model: MODEL,
    max_tokens: 2048,
    system,
    messages,
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
}

export async function generateItinerary(
  supabase: SupabaseClient,
  memberId: string,
  // The Monday of the week being planned. Defaults to this (UTC) week, as it always did; the plan screens and the
  // Sunday job say which week they mean (see weekToShow and nextLondonWeekStart).
  options: { weekStart?: string } = {}
): Promise<{ itinerary: GeneratedItinerary; usedFallback: boolean }> {
  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, travel_radius_km, personality, goals, interests, budget_band, dietary_preferences, mobility_notes")
    .eq("user_id", memberId)
    .single();

  const { candidates: rankedActivities, affinity } = await fetchRankedOpportunities(supabase, memberId);

  const { data: goalRows } = await supabase
    .from("goals")
    .select("text")
    .eq("member_id", memberId)
    .eq("status", "active");
  const aspirations = (goalRows ?? []).map((g) => g.text as string);

  // Drop activities the member has clearly rejected before they're even
  // considered, rather than relying on the LLM to remember to avoid them.
  // rankedActivities is already sorted by affinity score, so filtering
  // preserves that order — no need to re-sort.
  // A one-off event is only plannable if it falls on a day of this week that
  // hasn't passed. Without this the model was offered events weeks away and
  // placed them on arbitrary days.
  const weekStart = options.weekStart ?? getCurrentWeekStart();
  const today = londonToday();
  const dates = weekDates(weekStart);
  const remainingDates = Object.values(dates).filter((d) => d >= today);
  const plannable = rankedActivities.filter((a) => fitsDates(a, remainingDates));

  // Standing volunteer roles are a commitment, not a Tuesday outing: none unless their goals say giving back matters, then one.
  const candidateActivities = selectBalanced(
    limitSignUpRoles(
      // A hall with nothing listed is not a plan for a morning: it is offered only where someone can check what is on.
      plannable.filter((a) => !isHallVenue(a) && (affinity.activityScores[a.id] ?? 0) > DISLIKE_EXCLUSION_THRESHOLD),
      profile?.goals ?? []
    ),
    MAX_CANDIDATES_SENT_TO_LLM,
    MIN_CANDIDATES_PER_CATEGORY
  );

  const { system, user } = buildPrompt(
    profile ?? {
      location_text: null,
      travel_radius_km: null,
      personality: {},
      goals: [],
      interests: [],
      budget_band: null,
      dietary_preferences: null,
      mobility_notes: null,
    },
    candidateActivities,
    summarizeAffinity(affinity),
    aspirations,
    `Plan week: ${formatDay(dates.Mon)} to ${formatDay(dates.Sun)}. Today is ${formatDay(today)}.`
  );

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await requestItinerary(supabase, memberId, system, user, lastError ?? undefined);
      const result = validateGeneratedItinerary(raw, candidateActivities);
      if (result.ok) {
        return { itinerary: { items: alignToEvents(result.value.items, candidateActivities, weekStart) }, usedFallback: false };
      }
      lastError = result.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error calling Claude";
    }
  }

  const fallback = buildFallbackItinerary(candidateActivities, affinity);
  return { itinerary: { items: alignToEvents(fallback.items, candidateActivities, weekStart) }, usedFallback: true };
}
