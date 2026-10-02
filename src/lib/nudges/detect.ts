import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreActivity } from "@/lib/memory/scoring";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { getTodayWeather, isStrongOutdoorWeather, weatherCoordinates } from "@/lib/nudges/weather";

const GAP_DAYS = 5;
const NUDGE_COOLDOWN_DAYS = 7;
// "It's been a while" per the brief's own example (last meaningful activity in
// July, nudged months later) — 3 weeks is a reasonable middle ground for a
// weekly-cadence app without being trigger-happy.
const RECONNECT_GAP_DAYS = 21;

type ActivityRow = OpportunityCandidate;

export type NudgeCandidate = {
  reason: "activity_gap" | "weather_match" | "people_reconnect";
  activity: ActivityRow;
  person?: { name: string };
} | null;

/**
 * Per-member trigger check for the daily nudge job — see the reviewed spec:
 * Condition A (no accepted item in 5+ days) checked first, Condition B
 * (strong outdoor-weather match) second, capped at one nudge per member
 * per rolling 7 days regardless of which condition fires.
 */
export async function detectNudgeCandidate(admin: SupabaseClient, memberId: string): Promise<NudgeCandidate> {
  const cooldownSince = new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNudge } = await admin
    .from("nudges")
    .select("id")
    .eq("member_id", memberId)
    .gte("sent_at", cooldownSince)
    .limit(1)
    .maybeSingle();
  if (recentNudge) return null;

  const { data: memberItineraries } = await admin.from("itineraries").select("id").eq("member_id", memberId);
  const itineraryIds = (memberItineraries ?? []).map((i) => i.id as string);
  const { data: itineraryActivityRows } = itineraryIds.length
    ? await admin.from("itinerary_items").select("activity_id").in("itinerary_id", itineraryIds)
    : { data: [] as { activity_id: string }[] };
  const { data: surpriseActivityRows } = await admin
    .from("surprise_me_cards")
    .select("activity_id")
    .eq("member_id", memberId);

  const seenActivityIds = new Set<string>([
    ...(itineraryActivityRows ?? []).map((r) => r.activity_id as string),
    ...(surpriseActivityRows ?? []).map((r) => r.activity_id as string).filter(Boolean),
  ]);

  // Already distance-filtered and sorted highest-affinity-first — a real fix
  // here, since this previously queried every active activity regardless of
  // the member's travel radius.
  const { candidates: unseen, affinity } = await fetchRankedOpportunities(admin, memberId, {
    excludeActivityIds: seenActivityIds,
  });

  // Condition A: no accepted item in GAP_DAYS.
  const gapSince = new Date(Date.now() - GAP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentAccept } = await admin
    .from("preference_signals")
    .select("id")
    .eq("member_id", memberId)
    .eq("source", "accept")
    .eq("signal_type", "liked")
    .gte("created_at", gapSince)
    .limit(1)
    .maybeSingle();

  if (!recentAccept) {
    const best = unseen[0];
    if (best) return { reason: "activity_gap", activity: best };
  }

  // Condition B: strong outdoor-weather match on an unseen "outdoors" activity
  // the member's affinity score doesn't already reject. Judged on the weather
  // where this member actually lives (this previously used Richmond's for everyone).
  const { data: profile } = await admin
    .from("member_profiles")
    .select("location_lat, location_lng")
    .eq("user_id", memberId)
    .maybeSingle();
  const { latitude, longitude } = weatherCoordinates(profile);
  const weather = await getTodayWeather(latitude, longitude);
  if (isStrongOutdoorWeather(weather)) {
    const best = unseen.filter((a) => a.tags.includes("outdoors")).filter((a) => scoreActivity(a, affinity) >= 0)[0];
    if (best) return { reason: "weather_match", activity: best };
  }

  // Condition C: a person the member explicitly said they'd like to see more
  // of, and hasn't logged seeing in RECONNECT_GAP_DAYS+ (or ever). This reads
  // from the member's own stated intention, not an inference from behavior —
  // never framed as detecting loneliness.
  const { data: people } = await admin
    .from("people")
    .select("name, last_seen_date")
    .eq("member_id", memberId)
    .eq("wants_to_see_more", true);

  const overdue = (people ?? [])
    .map((p) => ({
      name: p.name as string,
      daysSince: p.last_seen_date
        ? Math.floor((Date.now() - new Date(p.last_seen_date as string).getTime()) / (1000 * 60 * 60 * 24))
        : Infinity,
    }))
    .filter((p) => p.daysSince >= RECONNECT_GAP_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince)[0];

  if (overdue) {
    const best = unseen.filter((a) => a.category === "Connect")[0] ?? unseen[0];
    if (best) return { reason: "people_reconnect", activity: best, person: { name: overdue.name } };
  }

  return null;
}
