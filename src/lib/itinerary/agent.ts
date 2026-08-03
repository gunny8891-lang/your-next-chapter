import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateGeneratedItinerary, type GeneratedItinerary } from "@/lib/itinerary/schema";
import { buildFallbackItinerary } from "@/lib/itinerary/fallback";
import { computeAffinity, scoreActivity, summarizeAffinity, type PreferenceSignalRow } from "@/lib/memory/scoring";

const MODEL = "claude-sonnet-5";
const MAX_CANDIDATES_SENT_TO_LLM = 40;
// An activity is treated as a hard exclusion once its weighted score drops this low —
// roughly two recent "disliked" signals against it.
const DISLIKE_EXCLUSION_THRESHOLD = -3;

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  price_estimate: number | null;
  tags: string[];
  rating: number | null;
  accessibility_notes: string | null;
};

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

function buildPrompt(profile: ProfileForPrompt, activities: ActivityRow[], affinitySummary: string) {
  const candidateList = activities
    .map((a) => {
      const accessibility = a.accessibility_notes ? ` | accessibility: ${a.accessibility_notes}` : "";
      return `- id=${a.id} | ${a.title} | category=${a.category} | tags=[${a.tags.join(", ")}] | price=${a.price_estimate ?? "unknown"} | ${a.address ?? ""}${accessibility}`;
    })
    .join("\n");

  const system = `You are the Itinerary Agent for "Your Next Chapter", an AI retirement concierge. \
Build a balanced weekly plan of 5-7 activities for a member, chosen only from the candidate activities provided. \
Rules: aim for at least 4 of the 7 categories (Move, Connect, Learn, Explore, Give Back, Wellness, Joy), \
never pick more than 2 items from the same category, weigh the member's affinity scores and category gaps below \
when choosing, and respect the member's mobility notes and dietary preferences — never pick something clearly \
unsuitable for them (e.g. a long strenuous walk for someone with limited mobility). Respond with ONLY valid JSON \
matching this exact shape, no prose, no markdown fences: \
{"items": [{"day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun", "slot": "morning"|"afternoon"|"evening", "activity_id": "<id from candidates>", "rationale": "<one sentence, second person, warm tone>"}]}`;

  const user = `Member profile:
- Location: ${profile.location_text ?? "unknown"}
- Travel radius: ${profile.travel_radius_km ?? "unknown"} km
- Personality: ${JSON.stringify(profile.personality)}
- Goals: ${profile.goals.join(", ") || "none recorded"}
- Interests: ${profile.interests.join(", ") || "none recorded"}
- Budget band: ${profile.budget_band ?? "unknown"}
- Dietary preferences: ${profile.dietary_preferences ?? "none recorded"}
- Mobility notes: ${profile.mobility_notes ?? "none recorded"}

Member history (Memory Agent summary, last 4 weeks):
${affinitySummary}

Candidate activities, ordered by how well they match this member's history (choose activity_id only from this list):
${candidateList}`;

  return { system, user };
}

async function callClaude(system: string, user: string, correction?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  if (correction) {
    messages.push({ role: "assistant", content: "(invalid JSON omitted)" });
    messages.push({ role: "user", content: `Your last response was invalid: ${correction}. Please respond again with ONLY the corrected JSON.` });
  }

  const response = await client.messages.create({
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
  memberId: string
): Promise<{ itinerary: GeneratedItinerary; usedFallback: boolean }> {
  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, travel_radius_km, personality, goals, interests, budget_band, dietary_preferences, mobility_notes")
    .eq("user_id", memberId)
    .single();

  const { data: activities } = await supabase
    .from("activities")
    .select("id, title, category, address, price_estimate, tags, rating, accessibility_notes")
    .eq("status", "active");

  const allActiveActivities = (activities ?? []) as ActivityRow[];

  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals } = await supabase
    .from("preference_signals")
    .select("signal_type, activity_id, created_at, activities(category, tags)")
    .eq("member_id", memberId)
    .gte("created_at", fourWeeksAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  const affinity = computeAffinity((signals ?? []) as unknown as PreferenceSignalRow[]);

  // Drop activities the member has clearly rejected before they're even considered,
  // rather than relying on the LLM to remember to avoid them.
  const eligibleActivities = allActiveActivities.filter(
    (a) => (affinity.activityScores[a.id] ?? 0) > DISLIKE_EXCLUSION_THRESHOLD
  );

  const candidateActivities = [...eligibleActivities]
    .sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity))
    .slice(0, MAX_CANDIDATES_SENT_TO_LLM);

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
    summarizeAffinity(affinity)
  );

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callClaude(system, user, lastError ?? undefined);
      const result = validateGeneratedItinerary(raw, candidateActivities);
      if (result.ok) return { itinerary: result.value, usedFallback: false };
      lastError = result.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error calling Claude";
    }
  }

  return { itinerary: buildFallbackItinerary(candidateActivities, affinity), usedFallback: true };
}
