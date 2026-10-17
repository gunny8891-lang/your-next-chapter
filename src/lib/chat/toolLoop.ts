import type Anthropic from "@anthropic-ai/sdk";
import type { ToolAction, ToolOutcome } from "@/lib/chat/calendarTools";

/**
 * The conversation with the model while it uses tools: it answers, or asks for a tool; the tool is run by us; its result goes
 * back; and so on until it answers in words. Capped, because each turn is a paid call and a model that keeps reaching for
 * tools is stuck. After the cap it is made to answer without them.
 */

export const MAX_TOOL_ROUNDS = 4;

export type LoopResult = { text: string; actions: ToolAction[]; rounds: number };

const textOf = (message: Anthropic.Message): string =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();

export async function runToolLoop(opts: {
  create: (messages: Anthropic.MessageParam[], allowTools: boolean) => Promise<Anthropic.Message>;
  messages: Anthropic.MessageParam[];
  execute: (name: string, input: unknown) => Promise<ToolOutcome>;
}): Promise<LoopResult> {
  const messages = [...opts.messages];
  const actions: ToolAction[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await opts.create(messages, true);
    if (response.stop_reason !== "tool_use") return { text: textOf(response), actions, rounds: round };

    const calls = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const outcome = await opts.execute(call.name, call.input);
      if (outcome.action) actions.push(outcome.action);
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(outcome.result), ...(outcome.isError ? { is_error: true } : {}) });
    }
    // The model's own turn goes back exactly as it gave it (any thinking included), then what the tools found.
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: results });
  }

  // Still reaching for tools after the cap: answer in words with what has been learned.
  const last = await opts.create(messages, false);
  return { text: textOf(last), actions, rounds: MAX_TOOL_ROUNDS };
}

/** What a reply says it has done: "I've added it", "it's now in your plan", "booked". */
const CLAIMS_DONE =
  /\b(i['’]?ve|i have)\s+(just\s+|now\s+)?((added|booked|scheduled)\s+(it|that|this|them|[^.!?]{0,60}\b(to|in|into|on)\s+your)\b|put\s+(it|that|this|them)\s+(in|on|into)\b)|\b(has|have)\s+been\s+(added|booked|scheduled)\b|(?:^|[.!?]\s*)added\s+(it\s+|that\s+|this\s+)?to\s+your\b/i;

export const NOT_ADDED =
  "I haven't added anything yet. Would you like me to add it? Tell me the day and I'll put it in your plan.";

/**
 * A reply must never say something has been added unless the add really happened in this turn. Where it says so and nothing
 * was added, what it said is replaced by a plain statement that nothing has been, rather than let someone turn up for
 * something that is not in their plan.
 */
export function guardUnconfirmedClaims(text: string, actions: ToolAction[]): { text: string; replaced: boolean } {
  if (actions.length > 0 || !CLAIMS_DONE.test(text)) return { text, replaced: false };
  return { text: NOT_ADDED, replaced: true };
}
