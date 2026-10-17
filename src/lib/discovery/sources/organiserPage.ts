import Anthropic from "@anthropic-ai/sdk";
import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { DATE_FIELD_PROMPT, isValidIso, parseAvailableUntil } from "@/lib/discovery/dateFields";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS, QUICK_THINKING } from "@/lib/ai/models";
import { scheduleOf } from "@/lib/discovery/sources/claudeWebSearch";
import { safeHttpUrl } from "@/lib/discovery/safeUrl";
import { cleanAddress, startOf, TIME_NOT_GIVEN_NOTE } from "@/lib/discovery/cleanFields";

/**
 * Reading one organiser's own pages again for what is new: a council's what's-on, a U3A branch's programme, a charity's events.
 * A search finds an organiser once; this keeps what it lists up to date, at a fraction of a search's cost, because it only
 * reads pages (no searching) and starts from a page we already know is theirs. Which organisers, and how often, is decided
 * in organisers.ts, from what members have shown an interest in.
 */

const MODEL = AI_MODELS.smart;
const CATEGORIES: readonly CategoryName[] = ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"];
const MAX_FETCHES = 5;
const MAX_CONTINUATIONS = 4;
const MAX_TOKENS = 12288;

type Item = {
  title?: string;
  description?: string;
  category?: string;
  address?: string;
  dateTime?: string;
  availableUntil?: string;
  priceEstimate?: number;
  tags?: string[];
  sourceUrl?: string;
  recurring?: boolean;
  schedule?: string | null;
};

export function organiserSystemPrompt(): string {
  return `You keep the event listings of one local organiser up to date for "Lark Hour", a concierge app for people who are retired or approaching it. \
You are given one page of the organiser's own website. Read it with web_fetch, then follow its links to the organiser's own what's-on, events, sessions or programme pages, reading at most a handful of pages in all. \
Extract only events and sessions genuinely described on the pages you read, one entry per dated event or per group, never invented, and never a general directory page in place of the event. \
Only events still to come, in the next three months. Leave out anything already past. \
Give each entry its own page as sourceUrl (the page for that event, not the listing it was found on) whenever the organiser has one; use the listing page only if there is nothing more specific. \
For a single dated event give dateTime and set recurring false. For a group that meets regularly leave dateTime null, set recurring true, and give schedule in OpenStreetMap opening-hours syntax such as "Th 14:00-16:00" or "Mo[2,4] 10:00-12:00"; if the pattern cannot be written that way set schedule null and say so in the description. \
Leave priceEstimate null unless a page states a price (0 if it says free). Say "unknown" in the description rather than guessing a time, a price or an address. \
Map each to exactly one category: ${CATEGORIES.join(", ")}. Tag each with what it is (for example "talk", "social", "walking", "craft", "history", "fitness") and add "grandchildren" only for something a grandparent could do with a grandchild. \
When you are done, respond with ONLY valid JSON, no prose, no markdown fences: {"items": [{"title": string, "description": string, "category": string, "address": string|null, ${DATE_FIELD_PROMPT}, "priceEstimate": number|null, "tags": string[], "sourceUrl": string, "recurring": boolean, "schedule": string|null}]}. If you find nothing genuine, return {"items": []}.`;
}

/** The same page given as a different way in: a listing shared by several events cannot be their address, or the next would look like a repeat. */
export function uniqueUrls(items: { title?: string; dateTime?: string; sourceUrl?: string }[], entryUrl: string): string[] {
  const counts = new Map<string, number>();
  for (const i of items) if (i.sourceUrl) counts.set(i.sourceUrl, (counts.get(i.sourceUrl) ?? 0) + 1);
  return items.map((i) => {
    const base = i.sourceUrl || entryUrl;
    // Used by more than one event (or given none): the event is told apart by its name and date, after a "#", which the page ignores.
    const shared = !i.sourceUrl || (counts.get(i.sourceUrl) ?? 0) > 1 || i.sourceUrl === entryUrl;
    return shared ? `${base.split("#")[0]}#${encodeURIComponent(`${i.title ?? ""} ${(i.dateTime ?? "").slice(0, 10)}`.trim())}` : base;
  });
}

/** Pure: what the model answered, as the entries to keep. */
export function candidatesFromAnswer(text: string, host: string, entryUrl: string): RawActivityCandidate[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    if (text.trim()) throw new Error(`No JSON in the answer for "${host}": ${text.slice(0, 200)}`);
    return [];
  }
  const items = ((JSON.parse(match[0]).items ?? []) as Item[]).filter((i) => i.title && CATEGORIES.includes(i.category as CategoryName));
  // Only real web addresses are kept as an event's page; anything else is treated as having none (see safeUrl.ts).
  for (const i of items) i.sourceUrl = safeHttpUrl(i.sourceUrl) ?? undefined;
  const urls = uniqueUrls(items, entryUrl);
  return items.map((item, index): RawActivityCandidate => {
    const { openingHours, holdForReview } = scheduleOf(item);
    const start = startOf(isValidIso(item.dateTime) ? item.dateTime : null);
    return {
      title: item.title!,
      description: start.dateTime && !start.timeGiven ? [item.description, TIME_NOT_GIVEN_NOTE].filter(Boolean).join(" ") : (item.description ?? null),
      category: item.category as CategoryName,
      address: cleanAddress(item.address),
      locationLat: null,
      locationLng: null,
      dateTime: start.dateTime,
      availableUntil: parseAvailableUntil(item.availableUntil),
      priceEstimate: item.priceEstimate ?? null,
      bookingUrl: urls[index],
      bookingUrlVerified: Boolean(item.sourceUrl),
      openingHours,
      holdForReview,
      tags: item.tags ?? [],
      status: "needs_review",
      adminNotes: `Refreshed from ${host}'s own pages because members have shown an interest in what it lists — verify details before activating.`,
    };
  });
}

async function readOrganiser(apiKey: string, host: string, entryUrl: string, memberId: string | null): Promise<RawActivityCandidate[]> {
  const client = new Anthropic({ apiKey });
  const admin = createAdminClient();
  const usageContext = { userId: memberId, feature: "discovery_claude_web_search" };
  const tools: Anthropic.Tool[] = [{ type: "web_fetch_20260209" as const, name: "web_fetch", max_uses: MAX_FETCHES } as unknown as Anthropic.Tool];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Start from ${entryUrl}. Find the upcoming events and sessions ${host} lists.` }];
  const system = organiserSystemPrompt();

  let response = await callClaude(client, admin, usageContext, { model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages, ...QUICK_THINKING });
  let continuations = 0;
  while (response.stop_reason === "pause_turn") {
    if (++continuations > MAX_CONTINUATIONS) throw new Error(`Reading "${host}" did not finish after ${MAX_CONTINUATIONS} continuations`);
    messages.push({ role: "assistant", content: response.content });
    response = await callClaude(client, admin, usageContext, { model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages, ...QUICK_THINKING });
  }
  // Cut off before the answer: that is not "nothing new".
  if (response.stop_reason === "max_tokens") throw new Error(`The answer for "${host}" was cut off before the end`);
  const text = response.content.filter((b) => b.type === "text").at(-1);
  return candidatesFromAnswer(text && "text" in text ? text.text : "", host, entryUrl);
}

export function createOrganiserSource(host: string, entryUrl: string, options: { memberId?: string | null } = {}): DiscoverySource {
  return {
    name: `organiser:${host}`,
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      return readOrganiser(apiKey, host, entryUrl, options.memberId ?? null);
    },
  };
}
