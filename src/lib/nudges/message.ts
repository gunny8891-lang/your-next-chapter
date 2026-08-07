import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5";

export async function writeNudgeMessage(
  reason: "activity_gap" | "weather_match",
  activity: { title: string; category: string; address: string | null },
  interests: string[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const reasonContext =
    reason === "activity_gap"
      ? "This member hasn't accepted anything in their weekly plan for 5+ days. Gently nudge them back in — no guilt-tripping, just a warm, low-key invitation."
      : "The weather today is unusually good for an outdoor activity, and this one matches their interests and is something they haven't tried yet. Nudge them to make the most of it.";

  const system = `You are writing a single short, warm, specific nudge message for a member of "Your Next Chapter", \
an AI retirement concierge. One or two sentences, second person, no exclamation-mark overload, no generic \
"hope you're well" filler. Reference the specific activity by name. Respond with ONLY the message text — no \
quotes, no markdown, no subject line.`;

  const user = `${reasonContext}
Activity: ${activity.title} (${activity.category}${activity.address ? `, ${activity.address}` : ""}).
Member interests: ${interests.join(", ") || "none recorded"}.`;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  return text.trim();
}
