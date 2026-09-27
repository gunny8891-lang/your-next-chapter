import Anthropic from "@anthropic-ai/sdk";
import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";

const MODEL = "claude-sonnet-5";
const CATEGORIES: readonly CategoryName[] = ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"];
const MAX_TOOL_USES = 6;

type ExtractedItem = {
  title?: string;
  description?: string;
  category?: string;
  address?: string;
  dateTime?: string;
  priceEstimate?: number;
  tags?: string[];
  sourceUrl?: string;
};

/**
 * Location-dynamic Discovery Agent source: uses Claude's server-side web_search
 * and web_fetch tools (both run inside a single API call — no client-side HTTP
 * or HTML parsing) to find and read real local activity pages for ANY given
 * region, not just a fixed set of known URLs. Like claudeWeb.ts, everything
 * lands as needs_review — LLM-discovered sources need a human pass before
 * reaching members.
 */
async function findActivitiesForRegion(apiKey: string, regionLabel: string): Promise<RawActivityCandidate[]> {
  const client = new Anthropic({ apiKey });

  const system = `You find real, current local activities suitable for retirees (walks, talks, classes, \
volunteering, social groups, visits) near a given region, for "Your Next Chapter", a retirement concierge app. \
Search for things like: the local council's health walks or "what's on" page, the local U3A (University of the \
Third Age) branch, National Trust properties nearby, and local Age UK volunteering opportunities. Fetch the most \
promising pages and extract only activities that are genuinely described on them — never invent one. Map each to \
exactly one category: ${CATEGORIES.join(", ")}. When you're done searching and fetching, respond with ONLY valid \
JSON, no prose, no markdown fences: {"items": [{"title": string, "description": string, "category": string, \
"address": string|null, "dateTime": string|null (ISO 8601 only if a specific date/time is genuinely given), \
"priceEstimate": number|null, "tags": string[], "sourceUrl": string}]}. If you find nothing genuine, return \
{"items": []}.`;

  const user = `Find current local activities suitable for retirees near ${regionLabel}.`;

  const tools: Anthropic.Tool[] = [
    { type: "web_search_20260209" as const, name: "web_search", max_uses: MAX_TOOL_USES } as unknown as Anthropic.Tool,
    { type: "web_fetch_20260209" as const, name: "web_fetch", max_uses: MAX_TOOL_USES } as unknown as Anthropic.Tool,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools, messages });

  // Server-side tool loop caps at 10 internal iterations; pause_turn means it needs
  // another request to keep going with the same tool-use context.
  while (response.stop_reason === "pause_turn") {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({ model: MODEL, max_tokens: 4096, system, tools, messages });
  }

  // Claude narrates via multiple text blocks while orchestrating searches through
  // code execution — the final answer is the LAST text block, not the first.
  const textBlocks = response.content.filter((block) => block.type === "text");
  const text = textBlocks.at(-1)?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] };
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
        dateTime: item.dateTime ?? null,
        priceEstimate: item.priceEstimate ?? null,
        bookingUrl,
        tags: item.tags ?? [],
        status: "needs_review",
        adminNotes: `Auto-discovered by Claude web search for "${regionLabel}" — verify details before activating.`,
      };
    });
}

export function createClaudeWebSearchSource(regions: string[]): DiscoverySource {
  return {
    name: "claude-web-search",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

      const results: RawActivityCandidate[] = [];
      for (const region of regions) {
        try {
          results.push(...(await findActivitiesForRegion(apiKey, region)));
        } catch {
          continue;
        }
      }
      return results;
    },
  };
}
