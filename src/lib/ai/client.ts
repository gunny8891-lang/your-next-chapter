import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWithinMemberLimits } from "@/lib/ai/limits";
import { createAdminClient } from "@/utils/supabase/admin";

// $ per 1M tokens, current standard (non-intro) rates. Cache read/write tokens
// aren't priced here — no call site in this app uses prompt caching yet, so
// those columns are logged for visibility but don't contribute to the cost
// estimate until that changes.
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MILLION[model];
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

type UsageContext = {
  /** null for system/background jobs not tied to a specific member. */
  userId: string | null;
  /** Short, stable slug identifying the calling feature, e.g. "itinerary_agent". */
  feature: string;
};

async function logUsage(
  supabase: SupabaseClient,
  context: UsageContext,
  model: string,
  usage: Anthropic.Usage | null,
  latencyMs: number,
  success: boolean,
  errorMessage: string | null
): Promise<void> {
  try {
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;

    const { error } = await supabase.from("ai_usage_logs").insert({
      user_id: context.userId,
      feature: context.feature,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      estimated_cost: estimateCost(model, inputTokens, outputTokens),
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
    });
    if (error) console.error("Failed to log AI usage:", error.message);
  } catch (err) {
    // Logging must never break the actual AI call it's observing.
    console.error("Failed to log AI usage:", err instanceof Error ? err.message : err);
  }
}

/**
 * Thin wrapper around `client.messages.create` (non-streaming) that logs every
 * call to ai_usage_logs — tokens, cost, latency, success — before returning
 * (or rethrowing) exactly what the plain call would have. Pass an existing
 * Anthropic client so multi-call loops (e.g. the Discovery Agent's pause_turn
 * loop) can reuse one instance and log each request individually.
 */
export async function callClaude(
  client: Anthropic,
  supabase: SupabaseClient,
  context: UsageContext,
  params: Anthropic.MessageCreateParamsNonStreaming,
  /** Injectable so the limit can be tested without a database; by default it reads the usage log. */
  checkLimits: (userId: string, feature: string) => Promise<void> = (userId, feature) => assertWithinMemberLimits(createAdminClient(), userId, feature)
): Promise<Anthropic.Message> {
  // A member-billed call that would go over a daily limit is refused here, before it is made
  // or logged. UsageLimitError is for the caller to catch and degrade (see usage limits).
  if (context.userId) {
    try {
      await checkLimits(context.userId, context.feature);
    } catch (err) {
      if (err instanceof Error && err.name === "UsageLimitError") throw err;
      // Anything else (no service key configured, a read failing) must not stop the member: allow the call.
      console.warn("usage limits: could not check (allowing the call):", err instanceof Error ? err.message : err);
    }
  }
  const startedAt = Date.now();
  try {
    const response = await client.messages.create(params);
    await logUsage(supabase, context, params.model, response.usage, Date.now() - startedAt, true, null);
    return response;
  } catch (err) {
    await logUsage(
      supabase,
      context,
      params.model,
      null,
      Date.now() - startedAt,
      false,
      err instanceof Error ? err.message : "Unknown error"
    );
    throw err;
  }
}
