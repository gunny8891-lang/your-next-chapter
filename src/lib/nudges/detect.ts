import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAffinity, scoreActivity, type PreferenceSignalRow } from "@/lib/memory/scoring";
import { PILOT_COORDINATES, getTodayWeather, isStrongOutdoorWeather } from "@/lib/nudges/weather";

const GAP_DAYS = 5;
const NUDGE_COOLDOWN_DAYS = 7;

type ActivityRow = {
  id: string;
  title: string;
  category: string;
  address: string | null;
  tags: string[];
  rating: number | null;
  price_estimate: number | null;
};

export type NudgeCandidate = {
  reason: "activity_gap" | "weather_match";
  activity: ActivityRow;
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

  const { data: activities } = await admin
    .from("activities")
    .select("id, title, category, address, tags, rating, price_estimate")
    .eq("status", "active");
  const allActive = (activities ?? []) as ActivityRow[];

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

  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals } = await admin
    .from("preference_signals")
    .select("signal_type, activity_id, created_at, activities(category, tags)")
    .eq("member_id", memberId)
    .gte("created_at", fourWeeksAgo)
    .order("created_at", { ascending: false })
    .limit(50);
  const affinity = computeAffinity((signals ?? []) as unknown as PreferenceSignalRow[]);

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
    const unseen = allActive.filter((a) => !seenActivityIds.has(a.id));
    const best = [...unseen].sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity))[0];
    if (best) return { reason: "activity_gap", activity: best };
  }

  // Condition B: strong outdoor-weather match on an unseen "outdoors" activity
  // the member's affinity score doesn't already reject.
  const weather = await getTodayWeather(PILOT_COORDINATES.latitude, PILOT_COORDINATES.longitude);
  if (isStrongOutdoorWeather(weather)) {
    const unseenOutdoor = allActive.filter((a) => !seenActivityIds.has(a.id) && a.tags.includes("outdoors"));
    const best = [...unseenOutdoor]
      .filter((a) => scoreActivity(a, affinity) >= 0)
      .sort((a, b) => scoreActivity(b, affinity) - scoreActivity(a, affinity))[0];
    if (best) return { reason: "weather_match", activity: best };
  }

  return null;
}
