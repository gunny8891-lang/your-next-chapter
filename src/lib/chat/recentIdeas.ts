import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The concierge used to know only the member's weekly plan and a list of nearby candidates, so when
 * someone asked about the theatre or café that Today or Explore had just shown them, it said it could not
 * see it: two assistants that did not know each other. This gives it the ideas the member has recently
 * been shown, opened, saved or planned, so it can talk about what is actually on their screen.
 */

export type RecentIdea = { id: string; title: string; category: string; address: string | null; price_estimate: number | null };

const LOOK_BACK_DAYS = 2;
const MAX_IDEAS = 10;

type EventRow = { activity_id: string | null; event_type: string; created_at: string };

/** Pure: the most recent distinct activity ids from event rows (newest first), minus any to leave out, at most `max`. */
export function distinctRecentIds(events: EventRow[], exclude: ReadonlySet<string> = new Set(), max: number = MAX_IDEAS): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const e of [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!e.activity_id || seen.has(e.activity_id) || exclude.has(e.activity_id)) continue;
    seen.add(e.activity_id);
    ids.push(e.activity_id);
    if (ids.length >= max) break;
  }
  return ids;
}

/** Pure: the list as it appears in the concierge's instructions. */
export function recentIdeasText(ideas: RecentIdea[]): string {
  if (ideas.length === 0) return "They have not been shown or saved anything recently.";
  return ideas
    .map((a) => {
      const price = a.price_estimate === null ? "" : a.price_estimate === 0 ? " | Free" : ` | £${a.price_estimate}`;
      return `- ${a.title} | ${a.category}${price} | ${a.address ?? "location TBC"}`;
    })
    .join("\n");
}

/**
 * What the member has recently seen, opened, saved or planned on Today and Explore, as real catalogue entries.
 * Never throws: with nothing found the concierge simply has the lists it always had.
 */
export async function loadRecentIdeas(supabase: SupabaseClient, memberId: string, exclude: ReadonlySet<string> = new Set()): Promise<RecentIdea[]> {
  try {
    const since = new Date(Date.now() - LOOK_BACK_DAYS * 86_400_000).toISOString();
    const [{ data: events }, { data: saved }] = await Promise.all([
      supabase
        .from("experience_events")
        .select("activity_id, event_type, created_at")
        .eq("member_id", memberId)
        .in("event_type", ["shown", "opened", "saved", "planned"])
        .not("activity_id", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("saved_ideas").select("activity_id, created_at").eq("member_id", memberId).order("created_at", { ascending: false }).limit(10),
    ]);
    const rows: EventRow[] = [
      ...((events ?? []) as EventRow[]),
      ...((saved ?? []) as { activity_id: string; created_at: string }[]).map((s) => ({ activity_id: s.activity_id, event_type: "saved", created_at: s.created_at })),
    ];
    const ids = distinctRecentIds(rows, exclude);
    if (ids.length === 0) return [];
    const { data: activities } = await supabase.from("activities").select("id, title, category, address, price_estimate").in("id", ids).eq("status", "active");
    const byId = new Map(((activities ?? []) as RecentIdea[]).map((a) => [a.id, a]));
    return ids.map((id) => byId.get(id)).filter((a): a is RecentIdea => Boolean(a));
  } catch (err) {
    console.warn("concierge: could not read the ideas they have seen recently:", err instanceof Error ? err.message : err);
    return [];
  }
}
