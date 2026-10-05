import Anthropic from "@anthropic-ai/sdk";
import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { DATE_FIELD_PROMPT, isValidIso, parseAvailableUntil } from "@/lib/discovery/dateFields";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

// Kept on the smart tier: this does agentic multi-step tool orchestration
// (web_search/web_fetch loops), not a simple single-pass task, and has
// already proven fragile enough under this model to hold off tiering it down
// without first watching its real cost/quality from the new logging below.
const MODEL = AI_MODELS.smart;
const CATEGORIES: readonly CategoryName[] = ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"];
// Raised from 6: searching for both the original retiree-focused sources AND
// family-friendly ones (soft play, parks, playgrounds) in the same pass uses
// more searches — 6 was observed to run out mid-search for a real region
// ("Guildford, Surrey"), ending in a refusal instead of a JSON answer.
const MAX_TOOL_USES = 10;
// A heavier search (more pages read, more narration between tool calls) can
// exhaust a small budget before reaching a final answer — 4096 was observed
// to truncate mid-search for a genuinely real region ("Chelmsford").
const MAX_TOKENS = 8192;

type ExtractedItem = {
  title?: string;
  description?: string;
  category?: string;
  address?: string;
  dateTime?: string;
  availableUntil?: string;
  priceEstimate?: number;
  tags?: string[];
  sourceUrl?: string;
};

/**
 * Location-dynamic Discovery Agent source: uses Claude's server-side web_search
 * and web_fetch tools (both run inside a single API call — no client-side HTTP
 * or HTML parsing) to find and read real local activity pages for ANY given
 * region, not just a fixed set of known URLs. Everything lands as needs_review
 * by default; run.ts auto-activates a candidate without a human pass only when
 * it has both a genuine per-event booking URL and a resolved location.
 */
async function findActivitiesForRegion(apiKey: string, regionLabel: string, memberId: string | null): Promise<RawActivityCandidate[]> {
  const client = new Anthropic({ apiKey });
  const admin = createAdminClient();
  // Attributed to the member whose sign-up or location change started it (null for the nightly job), so
  // the per-member limit can see it. Spend is never member-capped here: see searchAllowed.
  const usageContext = { userId: memberId, feature: "discovery_claude_web_search" };

  const system = `You find real, current local activities suitable for retirees (walks, talks, classes, \
volunteering, social groups, visits) near a given region, for "Lark Hour", a retirement concierge app. \
Search for things like: the local council's health walks or "what's on" page, the local U3A (University of the \
Third Age) branch, National Trust properties nearby, and local Age UK volunteering opportunities. Also search for \
places a grandparent could take a grandchild — soft play centres, parks, playgrounds, family-friendly museums or \
farms — and tag every one of those with "grandchildren" in its tags array so they can be matched to members who \
want them. Fetch the most promising pages and extract only activities that are genuinely described on them — never \
invent one. Map each to exactly one category: ${CATEGORIES.join(", ")}. When you're done searching and fetching, \
respond with ONLY valid JSON, no prose, no markdown fences: {"items": [{"title": string, "description": string, \
"category": string, "address": string|null, ${DATE_FIELD_PROMPT}, "priceEstimate": number|null, \
"tags": string[], "sourceUrl": string}]}. If you find nothing genuine, return {"items": []}.`;

  const user = `Find current local activities suitable for retirees near ${regionLabel}, including places they \
could take a grandchild for a family-friendly outing (soft play, parks, playgrounds).`;

  const tools: Anthropic.Tool[] = [
    { type: "web_search_20260209" as const, name: "web_search", max_uses: MAX_TOOL_USES } as unknown as Anthropic.Tool,
    { type: "web_fetch_20260209" as const, name: "web_fetch", max_uses: MAX_TOOL_USES } as unknown as Anthropic.Tool,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let response = await callClaude(client, admin, usageContext, { model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages });

  // Server-side tool loop caps at 10 internal iterations; pause_turn means it needs
  // another request to keep going with the same tool-use context.
  while (response.stop_reason === "pause_turn") {
    messages.push({ role: "assistant", content: response.content });
    response = await callClaude(client, admin, usageContext, { model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages });
  }

  // A heavier search (more pages fetched, more narration) can exhaust the token
  // budget before Claude ever reaches its final text answer — silently treating
  // that as "found nothing" would be wrong, since we genuinely don't know.
  if (response.stop_reason === "max_tokens") {
    throw new Error(`Response for "${regionLabel}" was truncated at max_tokens before a final answer`);
  }

  // Claude narrates via multiple text blocks while orchestrating searches through
  // code execution — the final answer is the LAST text block, not the first.
  const textBlocks = response.content.filter((block) => block.type === "text");
  const text = textBlocks.at(-1)?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  // A genuine "nothing found" always comes back as {"items": []} per the system
  // prompt. No JSON at all despite non-empty text means Claude didn't comply —
  // e.g. it hit a tool-usage limit and wrote an apologetic refusal instead —
  // which must not be silently read as "searched and found nothing".
  if (!jsonMatch) {
    if (text.trim()) {
      throw new Error(`No JSON in response for "${regionLabel}": ${text.slice(0, 200)}`);
    }
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const items = (parsed.items ?? []) as ExtractedItem[];

  return items
    .filter((item) => item.title && CATEGORIES.includes(item.category as CategoryName))
    .map((item): RawActivityCandidate => {
      const bookingUrl = item.sourceUrl || `https://search.local/${encodeURIComponent(regionLabel)}#${encodeURIComponent(item.title!)}`;
      return {
        title: item.title!,
        description: item.description ?? null,
        category: item.category as CategoryName,
        address: item.address ?? null,
        locationLat: null,
        locationLng: null,
        // A date the database can't parse would reject the whole batch insert.
        dateTime: isValidIso(item.dateTime) ? item.dateTime : null,
        availableUntil: parseAvailableUntil(item.availableUntil),
        priceEstimate: item.priceEstimate ?? null,
        bookingUrl,
        bookingUrlVerified: Boolean(item.sourceUrl),
        tags: item.tags ?? [],
        status: "needs_review",
        adminNotes: `Auto-discovered by Claude web search for "${regionLabel}" — verify details before activating.`,
      };
    });
}

export function createClaudeWebSearchSource(regions: string[], options: { memberId?: string | null } = {}): DiscoverySource {
  return {
    name: "claude-web-search",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

      const results: RawActivityCandidate[] = [];
      let lastError: unknown = null;
      for (const region of regions) {
        try {
          results.push(...(await findActivitiesForRegion(apiKey, region, options.memberId ?? null)));
        } catch (err) {
          lastError = err;
          continue;
        }
      }

      // One bad region among several shouldn't lose the rest, but if nothing
      // came back and something failed, report the failure — "searched and
      // found nothing" and "the search failed" must not look the same, since
      // the throttle treats them very differently.
      if (results.length === 0 && lastError) throw lastError;
      return results;
    },
  };
}
