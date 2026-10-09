import Anthropic from "@anthropic-ai/sdk";
import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { DATE_FIELD_PROMPT, isValidIso, parseAvailableUntil } from "@/lib/discovery/dateFields";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS, QUICK_THINKING } from "@/lib/ai/models";
import { themeByKey, type DiscoveryTheme } from "@/lib/discovery/themes";
import { parseOpeningHours } from "@/lib/someTime/openingHours";

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
/** How many times a paused search is continued before it is given up as stuck. */
const MAX_CONTINUATIONS = 6;
// A heavier search (more pages read, more narration between tool calls) can
// exhaust a small budget before reaching a final answer — 4096 was observed
// to truncate mid-search for a genuinely real region ("Chelmsford"), and 8192 did the same for "Stevenage".
const MAX_TOKENS = 16384;

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
  /** True for a group that meets on a regular pattern; false or absent for a venue or a single dated event. */
  recurring?: boolean;
  /** When a recurring group meets, in OpenStreetMap opening-hours syntax ("Th 14:00-16:00"); null when the pattern cannot be written that way. */
  schedule?: string | null;
};

/**
 * What to keep of a group's schedule. A pattern the app can read ("Th 14:00-16:00") is kept, so the group is only
 * suggested for the days and times it meets. A recurring group whose pattern cannot be read (the 2nd and 4th Monday of the
 * month) is held for a person to look at, because suggested without it, it would be offered on days it does not meet.
 */
export function scheduleOf(item: Pick<ExtractedItem, "recurring" | "schedule" | "dateTime">): { openingHours: string | null; holdForReview: boolean } {
  if (item.dateTime || !item.recurring) return { openingHours: null, holdForReview: false };
  const schedule = item.schedule?.trim() ?? "";
  if (schedule && parseOpeningHours(schedule) !== null) return { openingHours: schedule, holdForReview: false };
  return { openingHours: null, holdForReview: true };
}

/**
 * Location-dynamic Discovery Agent source: uses Claude's server-side web_search
 * and web_fetch tools (both run inside a single API call — no client-side HTTP
 * or HTML parsing) to find and read real local activity pages for ANY given
 * region, not just a fixed set of known URLs. Everything lands as needs_review
 * by default; run.ts auto-activates a candidate without a human pass only when
 * it has both a genuine per-event booking URL and a resolved location.
 */
/**
 * The instructions for a focused search: one kind of thing, found properly, from the organiser's own page. It asks for the
 * group or the session as it is described there (when it meets, what it costs, how to join), and says to leave out what it
 * cannot find on a real page, since an unknown is better than a guess.
 */
export function themedSystemPrompt(theme: DiscoveryTheme): string {
  return `You find real, current local activities for "Lark Hour", a concierge app for people who are retired or approaching it. \
This search is for one kind of thing only: ${theme.focus}. Work one step at a time, calling web_search and web_fetch directly: \
never write code to run several searches at once (that spends every search in one step and leaves none to read pages with), and \
after each search fetch the one or two most promising organiser pages from its results before you search again. Use web_search to find the local organisers and web_fetch to read their \
own pages (the group's page, the council's or the venue's what's-on page, the national scheme's local listing). Extract only groups \
and sessions genuinely described on a page you read, one entry per group or per dated session, never invented, and never a \
general directory page in place of the group. For a group that meets regularly, say in the description when and where it meets \
and how to join, as the page does, and leave dateTime null; give dateTime only for a single dated event or one session. For a group that meets on a regular pattern set recurring true and give schedule in OpenStreetMap opening-hours syntax, for example "Th 14:00-16:00" or "Mo,We 10:00-12:00"; if the pattern cannot be written that way (the 2nd and 4th Monday of the month, term time only) set schedule null and say so in the description. For a venue or a single dated event set recurring false and schedule null. Put the \
organiser's own page in sourceUrl. Leave priceEstimate null unless the page states a price (0 if it says free). Say "unknown" in the \
description rather than guessing a time, a price or an address. Map each to exactly one category: ${CATEGORIES.join(", ")}. \
Tag each with what it is (for example "social", "walking", "volunteering", "craft", "history", "fitness") and add "grandchildren" \
only for something a grandparent could do with a grandchild. When you are done, respond with ONLY valid JSON, no prose, no \
markdown fences: {"items": [{"title": string, "description": string, "category": string, "address": string|null, ${DATE_FIELD_PROMPT}, \
"priceEstimate": number|null, "tags": string[], "sourceUrl": string, "recurring": boolean, "schedule": string|null}]}. If you find nothing genuine, return {"items": []}.`;
}

async function findActivitiesForRegion(apiKey: string, regionLabel: string, memberId: string | null, theme?: DiscoveryTheme): Promise<RawActivityCandidate[]> {
  const client = new Anthropic({ apiKey });
  const admin = createAdminClient();
  // Attributed to the member whose sign-up or location change started it (null for the nightly job), so
  // the per-member limit can see it. Spend is never member-capped here: see searchAllowed.
  const usageContext = { userId: memberId, feature: "discovery_claude_web_search" };

  const genericSystem = `You find real, current local activities suitable for retirees (walks, talks, classes, \
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

  const system = theme ? themedSystemPrompt(theme) : genericSystem;
  const user = theme
    ? `Find ${theme.focus}, in or near ${regionLabel}.`
    : `Find current local activities suitable for retirees near ${regionLabel}, including places they \
could take a grandchild for a family-friendly outing (soft play, parks, playgrounds).`;

  const tools: Anthropic.Tool[] = [
    { type: "web_search_20260209" as const, name: "web_search", max_uses: MAX_TOOL_USES } as unknown as Anthropic.Tool,
    { type: "web_fetch_20260209" as const, name: "web_fetch", max_uses: MAX_TOOL_USES } as unknown as Anthropic.Tool,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let response = await callClaude(client, admin, usageContext, { model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages, ...(theme ? QUICK_THINKING : {}) });

  // Server-side tool loop caps at 10 internal iterations; pause_turn means it needs
  // another request to keep going with the same tool-use context.
  let continuations = 0;
  while (response.stop_reason === "pause_turn") {
    // A search that keeps pausing is stuck (it has been seen waiting for a tool limit that never lifts); each turn costs.
    if (++continuations > MAX_CONTINUATIONS) throw new Error(`Search for "${regionLabel}" did not finish after ${MAX_CONTINUATIONS} continuations`);
    messages.push({ role: "assistant", content: response.content });
    response = await callClaude(client, admin, usageContext, { model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages, ...(theme ? QUICK_THINKING : {}) });
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
      const { openingHours, holdForReview } = scheduleOf(item);
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
        openingHours,
        holdForReview,
        tags: item.tags ?? [],
        status: "needs_review",
        adminNotes: `Auto-discovered by Claude web search for "${regionLabel}"${theme ? ` (${theme.label.toLowerCase()})` : ""} — verify details before activating.`,
      };
    });
}

export function createClaudeWebSearchSource(regions: string[], options: { memberId?: string | null; theme?: string } = {}): DiscoverySource {
  const theme = options.theme ? themeByKey(options.theme) : undefined;
  if (options.theme && !theme) throw new Error(`Unknown discovery theme "${options.theme}"`);
  return {
    name: theme ? `claude-web-search:${theme.key}` : "claude-web-search",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

      const results: RawActivityCandidate[] = [];
      let lastError: unknown = null;
      for (const region of regions) {
        try {
          results.push(...(await findActivitiesForRegion(apiKey, region, options.memberId ?? null, theme)));
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
