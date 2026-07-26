import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateGeneratedItinerary, type GeneratedItinerary } from "@/lib/itinerary/schema";
import { buildFallbackItinerary } from "@/lib/itinerary/fallback";

const MODEL = "claude-sonnet-5";

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  price_estimate: number | null;
  tags: string[];
  rating: number | null;
};

type SignalRow = {
  signal_type: string;
  source: string;
  activities: { title: string; category: string } | null;
};

function buildPrompt(
  profile: { location_text: string | null; travel_radius_km: number | null; personality: unknown; goals: string[]; budget_band: string | null },
  activities: ActivityRow[],
  signals: SignalRow[]
) {
  const candidateList = activities
    .map((a) => `- id=${a.id} | ${a.title} | category=${a.category} | tags=[${a.tags.join(", ")}] | price=${a.price_estimate ?? "unknown"} | ${a.address ?? ""}`)
    .join("\n");

  const signalSummary = signals.length
    ? signals
        .map((s) => `- ${s.source} (${s.signal_type}) on "${s.activities?.title ?? "unknown"}" (${s.activities?.category ?? "unknown"})`)
        .join("\n")
    : "No history yet — this is the member's first week.";

  const system = `You are the Itinerary Agent for "Your Next Chapter", an AI retirement concierge. \
Build a balanced weekly plan of 5-7 activities for a member, chosen only from the candidate activities provided. \
Rules: aim for at least 4 of the 7 categories (Move, Connect, Learn, Explore, Give Back, Wellness, Joy), \
never pick more than 2 items from the same category, and avoid repeating activities the member recently skipped. \
Respond with ONLY valid JSON matching this exact shape, no prose, no markdown fences: \
{"items": [{"day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun", "slot": "morning"|"afternoon"|"evening", "activity_id": "<id from candidates>", "rationale": "<one sentence, second person, warm tone>"}]}`;

  const user = `Member profile:
- Location: ${profile.location_text ?? "unknown"}
- Travel radius: ${profile.travel_radius_km ?? "unknown"} km
- Personality: ${JSON.stringify(profile.personality)}
- Goals: ${profile.goals.join(", ") || "none recorded"}
- Budget band: ${profile.budget_band ?? "unknown"}

Recent activity history (last 4 weeks):
${signalSummary}

Candidate activities (choose activity_id only from this list):
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
    .select("location_text, travel_radius_km, personality, goals, budget_band")
    .eq("user_id", memberId)
    .single();

  const { data: activities } = await supabase
    .from("activities")
    .select("id, title, category, address, price_estimate, tags, rating")
    .eq("status", "active");

  const candidateActivities = (activities ?? []) as ActivityRow[];

  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals } = await supabase
    .from("preference_signals")
    .select("signal_type, source, activities(title, category)")
    .eq("member_id", memberId)
    .gte("created_at", fourWeeksAgo)
    .order("created_at", { ascending: false })
    .limit(20);

  const { system, user } = buildPrompt(profile ?? { location_text: null, travel_radius_km: null, personality: {}, goals: [], budget_band: null }, candidateActivities, (signals ?? []) as unknown as SignalRow[]);

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

  const topInterests = [...(profile?.goals ?? [])];
  return { itinerary: buildFallbackItinerary(candidateActivities, topInterests), usedFallback: true };
}
