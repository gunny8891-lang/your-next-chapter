import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

// Simple, short-form text generation — exactly the kind of task the project
// brief calls out for the cheap tier rather than the smart one.
const MODEL = AI_MODELS.cheap;

export async function writeNudgeMessage(
  supabase: SupabaseClient,
  memberId: string,
  reason: "activity_gap" | "weather_match" | "people_reconnect",
  activity: { title: string; category: string; address: string | null },
  interests: string[],
  person?: { name: string }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const reasonContext =
    reason === "activity_gap"
      ? "This member hasn't accepted anything in their weekly plan for 5+ days. Gently nudge them back in — no guilt-tripping, just a warm, low-key invitation."
      : reason === "weather_match"
      ? "The weather today is unusually good for an outdoor activity, and this one matches their interests and is something they haven't tried yet. Nudge them to make the most of it."
      : `The member said they'd like to see ${person?.name ?? "this person"} more often, and it's been a while \
since they last logged seeing them. Suggest this activity as a warm, natural occasion to reach out — mention \
${person?.name ?? "them"} by name. Never use words like "lonely" or "alone", and never imply anything negative \
about their social life — this is simply a nudge toward something they already said they wanted.`;

  const system = `You are writing a single short, warm, specific nudge message for a member of "Your Next Chapter", \
an AI retirement concierge. One or two sentences, second person, no exclamation-mark overload, no generic \
"hope you're well" filler. Reference the specific activity by name. Respond with ONLY the message text — no \
quotes, no markdown, no subject line.`;

  const user = `${reasonContext}
Activity: ${activity.title} (${activity.category}${activity.address ? `, ${activity.address}` : ""}).
Member interests: ${interests.join(", ") || "none recorded"}.`;

  const client = new Anthropic({ apiKey });
  const response = await callClaude(client, supabase, { userId: memberId, feature: "nudge_message" }, {
    model: MODEL,
    max_tokens: 150,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  return text.trim();
}
