import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/opportunities/schedule";

/**
 * What the concierge may know about a member's life beyond their profile, so "help me become more active" and "find something to
 * do with my grandchildren" can be answered from what they have told us: the things they would still love to do (My Chapter),
 * the kinds of people in their life and what they share, and how this week has gone.
 *
 * Deliberately not sent: people's names and the notes written about them. The concierge needs "a grandchild who likes animals",
 * not who. Only what the member entered themselves, read with their own client, so it is theirs alone.
 */

const MAX_WISHES = 6;
const MAX_PEOPLE = 8;
const MAX_TEXT = 140;

export type MemberLife = {
  wishes: string[];
  people: { relationship: string | null; interests: string[]; wantsToSeeMore: boolean; daysSinceSeen: number | null }[];
  /** Things on this week's plan they have accepted, and things they said they went to in the last seven days. */
  planned: number;
  went: number;
};

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text);

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Pure: the lines the concierge is given, or a plain statement that there is nothing yet. */
export function memberLifeText(life: MemberLife): string {
  const lines: string[] = [];
  if (life.wishes.length) lines.push(`Things they would still love to do (their own words): ${life.wishes.map((w) => `"${w}"`).join("; ")}.`);
  if (life.people.length) {
    lines.push(
      "People in their life (no names are given to you):\n" +
        life.people
          .map((p) => {
            const seen = p.daysSinceSeen === null ? "not yet logged a visit" : p.daysSinceSeen === 0 ? "seen today" : `last seen ${p.daysSinceSeen} days ago`;
            return `- ${p.relationship ?? "someone close"}${p.interests.length ? `, shares: ${p.interests.join(", ")}` : ""}; ${seen}${p.wantsToSeeMore ? "; they want to see more of them" : ""}`;
          })
          .join("\n")
    );
  }
  lines.push(`This week: ${life.planned} outing${life.planned === 1 ? "" : "s"} accepted in their plan; they said they went to ${life.went} in the last seven days.`);
  if (!life.wishes.length && !life.people.length) lines.unshift("They have not told us about things they would love to do, or people in their life, yet.");
  return lines.join("\n");
}

/** Reads it. Never throws: the concierge simply knows less if anything fails. */
export async function loadMemberLife(supabase: SupabaseClient, memberId: string, today: string, weekAccepted: number): Promise<MemberLife> {
  const empty: MemberLife = { wishes: [], people: [], planned: weekAccepted, went: 0 };
  try {
    const [goals, people, went] = await Promise.all([
      supabase.from("goals").select("text").eq("member_id", memberId).eq("status", "active").order("created_at", { ascending: false }).limit(MAX_WISHES),
      supabase.from("people").select("relationship, shared_interests, wants_to_see_more, last_seen_date").eq("member_id", memberId).order("created_at", { ascending: false }).limit(MAX_PEOPLE),
      supabase.from("experience_events").select("id", { count: "exact", head: true }).eq("member_id", memberId).eq("event_type", "completed").gte("created_at", `${addDays(today, -7)}T00:00:00Z`),
    ]);
    return {
      wishes: (goals.data ?? []).map((g) => clip(String(g.text))).filter(Boolean),
      people: (people.data ?? []).map((p) => ({
        relationship: p.relationship ? clip(String(p.relationship)) : null,
        interests: ((p.shared_interests as string[] | null) ?? []).slice(0, 4).map(clip),
        wantsToSeeMore: p.wants_to_see_more === true,
        daysSinceSeen: p.last_seen_date ? Math.max(0, daysBetween(String(p.last_seen_date), today)) : null,
      })),
      planned: weekAccepted,
      went: went.count ?? 0,
    };
  } catch (err) {
    console.warn("chat: could not read their wishes and people:", err instanceof Error ? err.message : err);
    return empty;
  }
}
