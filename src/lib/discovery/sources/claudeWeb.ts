import Anthropic from "@anthropic-ai/sdk";
import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";

const MODEL = "claude-sonnet-5";
const MAX_PAGE_TEXT_CHARS = 15000;
const CATEGORIES: readonly CategoryName[] = ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"];

type TargetPage = { url: string; orgName: string };

// Known, specific pages for organizations relevant to the Richmond pilot that don't
// expose a structured API — extraction quality depends on the LLM reading whatever
// the page currently contains, so everything from this source lands as needs_review.
const TARGET_PAGES: TargetPage[] = [
  { url: "https://www.nationaltrust.org.uk/visit/london/ham-house-and-garden/events", orgName: "Ham House & Garden (National Trust)" },
  { url: "https://www.richmond.gov.uk/health_walks", orgName: "Richmond upon Thames Health Walks" },
  { url: "https://rut.u3asite.uk", orgName: "Richmond upon Thames U3A" },
];

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ExtractedItem = {
  title?: string;
  description?: string;
  category?: string;
  address?: string;
  dateTime?: string;
  priceEstimate?: number;
  tags?: string[];
};

async function extractActivitiesFromPage(pageText: string, orgName: string, sourceUrl: string): Promise<RawActivityCandidate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const system = `You extract real, currently-listed activities suitable for retirees (walks, talks, classes, \
volunteering, social groups, visits) from a web page belonging to "${orgName}". Only extract activities that are \
actually described on the page — never invent one. If the page lists no genuine activities, return {"items": []}. \
Map each activity to exactly one of these categories: ${CATEGORIES.join(", ")}. Respond with ONLY valid JSON, no \
prose, no markdown fences: {"items": [{"title": string, "description": string, "category": string, "address": \
string|null, "dateTime": string|null (ISO 8601 only if a specific date/time is genuinely given), "priceEstimate": \
number|null, "tags": string[]}]}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: `Page content from ${sourceUrl}:\n\n${pageText}` }],
  });

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] };
  const items = (parsed.items ?? []) as ExtractedItem[];

  return items
    .filter((item) => item.title && CATEGORIES.includes(item.category as CategoryName))
    .map((item): RawActivityCandidate => ({
      title: item.title!,
      description: item.description ?? null,
      category: item.category as CategoryName,
      address: item.address ?? null,
      locationLat: null,
      locationLng: null,
      dateTime: item.dateTime ?? null,
      priceEstimate: item.priceEstimate ?? null,
      // No per-event URL is reliably extractable from these pages, so a synthetic
      // per-title key on the source page keeps dedup working across daily runs.
      bookingUrl: `${sourceUrl}#${encodeURIComponent(item.title!)}`,
      tags: item.tags ?? [],
      status: "needs_review",
      adminNotes: `Auto-extracted by Claude from ${sourceUrl} — verify details before activating.`,
    }));
}

export function createClaudeWebSource(): DiscoverySource {
  return {
    name: "claude-web",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const results: RawActivityCandidate[] = [];

      for (const page of TARGET_PAGES) {
        try {
          const response = await fetch(page.url, { headers: { "User-Agent": "YourNextChapterDiscoveryBot/1.0" } });
          if (!response.ok) continue;
          const html = await response.text();
          const pageText = stripHtmlToText(html).slice(0, MAX_PAGE_TEXT_CHARS);
          const extracted = await extractActivitiesFromPage(pageText, page.orgName, page.url);
          results.push(...extracted);
        } catch {
          // Skip this page for this run rather than failing the whole source.
          continue;
        }
      }

      return results;
    },
  };
}
