import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeAffinity } from "@/lib/memory/scoring";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { getCurrentWeekStart } from "@/lib/itinerary/generateAndSave";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

const MODEL = AI_MODELS.smart;
const MAX_CANDIDATES_SENT_TO_LLM = 30;

type ProfileForPrompt = {
  location_text: string | null;
  travel_radius_km: number | null;
  interests: string[];
  goals: string[];
  budget_band: string | null;
  mobility_notes: string | null;
};

type ThisWeekItemRow = {
  day_of_week: string;
  slot: string;
  member_action: string;
  activities: { id: string; title: string; category: string; address: string | null; date_time: string | null } | null;
};

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

function formatToday() {
  const now = new Date();
  const dayLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return dayLabel;
}

function buildSystemPrompt(
  profile: ProfileForPrompt,
  todayLabel: string,
  weekItems: ThisWeekItemRow[],
  candidateList: OpportunityCandidate[],
  affinitySummary: string
) {
  const weekItemsText = weekItems.length
    ? weekItems
        .filter((i) => i.activities)
        .map((i) => {
          const a = i.activities!;
          return `- ${i.day_of_week} (${i.slot}, status=${i.member_action}): ${a.title} | ${a.category} | ${a.address ?? "location TBC"}`;
        })
        .join("\n")
    : "This member has no itinerary generated for the current week yet.";

  const candidatesText = candidateList
    .map((a) => {
      const time = a.date_time ? ` | ${new Date(a.date_time).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "";
      const price = a.price_estimate === null ? "" : a.price_estimate === 0 ? " | Free" : ` | £${a.price_estimate}`;
      return `- id=${a.id} | ${a.title} | category=${a.category}${time}${price} | ${a.address ?? "location TBC"} | tags=[${a.tags.join(", ")}]`;
    })
    .join("\n");

  return `You are the on-demand concierge chat assistant for "Your Next Chapter", an AI retirement concierge. \
A member is asking you a live question — answer it directly and concisely (2-4 short sentences, warm and clear, \
no wall of text, no markdown headers or bullet spam). Speak in second person.

Today is ${todayLabel}.

Member profile:
- Location: ${profile.location_text ?? "unknown"}
- Travel radius: ${profile.travel_radius_km ?? "unknown"} km
- Interests: ${profile.interests.join(", ") || "none recorded"}
- Goals: ${profile.goals.join(", ") || "none recorded"}
- Budget band: ${profile.budget_band ?? "unknown"}
- Mobility notes: ${profile.mobility_notes ?? "none recorded"}

Member history summary: ${affinitySummary}

THIS WEEK'S PLANNED ITINERARY (their actual scheduled items — use this for "what's on today/this week" questions):
${weekItemsText}

OTHER CANDIDATE ACTIVITIES NEARBY (not yet scheduled — use this for "find me something" questions):
${candidatesText || "No other active candidate activities available right now."}

Hard rules:
- Only ever mention a specific activity, date, time, or location if it appears verbatim in one of the two lists above. Never invent an activity, venue, or time.
- If nothing in the lists answers the question, say so plainly and suggest checking back later — do not make something up.
- This app does not yet have social/companion-matching data (e.g. "who else is free"). If asked something like that, say honestly that you can't see other members' availability yet, and offer to help find an activity instead.
- Keep it short. This audience wants a clear, direct answer, not an essay.`;
}

export async function answerChatQuestion(
  supabase: SupabaseClient,
  memberId: string,
  question: string,
  history: ChatHistoryMessage[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("location_text, travel_radius_km, interests, goals, budget_band, mobility_notes")
    .eq("user_id", memberId)
    .single();

  const weekStartDate = getCurrentWeekStart();
  const { data: itinerary } = await supabase
    .from("itineraries")
    .select("itinerary_items(day_of_week, slot, member_action, activities(id, title, category, address, date_time))")
    .eq("member_id", memberId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();

  const weekItems = (itinerary?.itinerary_items ?? []) as unknown as ThisWeekItemRow[];
  // By id, not title — two different activities could share a title, and a
  // title-based check silently stops excluding if either title ever changes.
  const scheduledActivityIds = new Set(weekItems.map((i) => i.activities?.id).filter(Boolean) as string[]);

  const { candidates: rankedActivities, affinity } = await fetchRankedOpportunities(supabase, memberId, {
    excludeActivityIds: scheduledActivityIds,
  });
  const candidateActivities = rankedActivities.slice(0, MAX_CANDIDATES_SENT_TO_LLM);

  const system = buildSystemPrompt(
    profile ?? {
      location_text: null,
      travel_radius_km: null,
      interests: [],
      goals: [],
      budget_band: null,
      mobility_notes: null,
    },
    formatToday(),
    weekItems,
    candidateActivities,
    summarizeAffinity(affinity)
  );

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];

  const response = await callClaude(client, supabase, { userId: memberId, feature: "concierge_chat" }, {
    model: MODEL,
    max_tokens: 400,
    system,
    messages,
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  return text.trim() || "Sorry, I couldn't come up with an answer just now — could you try rephrasing?";
}
