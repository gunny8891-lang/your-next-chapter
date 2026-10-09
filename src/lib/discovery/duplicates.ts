import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "@/lib/discovery/sources/openStreetMap";

/**
 * The same place arriving from two sources: the free OpenStreetMap layer lists Fairlands Valley Park, and so does the
 * council page the web search reads, a few hundred metres apart because each puts the point somewhere different in a big
 * park. Left alone, a member is offered the same park twice. This finds those pairs among standing venues (never dated
 * sessions, where the same title on different days is correct) and keeps the better described one.
 *
 * Careful by design: two entries are one place only when they have the same name once punctuation and "the" are ignored AND
 * are close together. How close depends on what it is: a park's two points can be a kilometre apart; two cafés of one name
 * a few hundred metres apart are probably two cafés; two branches of a chain are two branches unless they are on top of
 * each other.
 */

export type VenueRow = {
  id: string;
  title: string;
  location_lat: number | null;
  location_lng: number | null;
  date_time: string | null;
  status: string;
  tags: string[] | null;
  booking_url: string | null;
  recurrence_rule: string | null;
  description: string | null;
  admin_notes: string | null;
  source: string | null;
  created_at?: string | null;
  dog_access?: string | null;
  dog_restrictions?: string | null;
  dog_confidence?: string | null;
  dog_source?: string | null;
  accessibility_notes?: string | null;
  address?: string | null;
};

const PARK_LIKE_KM = 1.5;
const SHOP_LIKE_KM = 0.4;
const CHAIN_KM = 0.05;
/** A name that is part of another's must be at least this long, and the two within this distance, to be one place. */
const MIN_CONTAINED_NAME = 8;
const CONTAINED_KM = 0.4;

const normalise = (name: string) =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|and)\b/g, " ").replace(/\s+/g, " ").trim();

const isOsmLink = (url: string | null) => /openstreetmap\.org/i.test(url ?? "");

/** How close two entries of one name must be to count as one place. */
function limitKm(a: VenueRow, b: VenueRow): number {
  const tags = [...(a.tags ?? []), ...(b.tags ?? [])];
  if (tags.includes("chain")) return CHAIN_KM;
  if (tags.includes("food-venue")) return SHOP_LIKE_KM;
  return PARK_LIKE_KM;
}

/** Pure: whether two standing entries are the same place. */
export function sameVenue(a: VenueRow, b: VenueRow): boolean {
  if (a.id === b.id || a.date_time || b.date_time) return false;
  const name = normalise(a.title);
  const other = normalise(b.title);
  if (!name || !other) return false;
  if (a.location_lat == null || a.location_lng == null || b.location_lat == null || b.location_lng == null) return false;
  const apart = haversineKm({ lat: a.location_lat, lng: a.location_lng }, { lat: b.location_lat, lng: b.location_lng });
  if (name === other) return apart <= limitKm(a, b);
  // One name is the other with more said ("Hollywood Bowl" and "Hollywood Bowl Stevenage", from a map and from the venue's
  // own page). Only when what is added AFTER the name is a place that appears in the address (the town): "Church Farm" and
  // "Church Farm Cafe" are two places, and so are a park and "Zumba Gold - Hampson Park", a class held in it, which a looser
  // rule once merged away along with every other class held there.
  const [shorter, longer, shorterRow, longerRow] = name.length <= other.length ? [name, other, a, b] : [other, name, b, a];
  if (shorter.length < MIN_CONTAINED_NAME || !longer.startsWith(`${shorter} `)) return false;
  const placeWords = normalise(`${shorterRow.address ?? ""} ${longerRow.address ?? ""}`).split(" ");
  const extra = longer.slice(shorter.length).trim().split(" ");
  return extra.every((word) => placeWords.includes(word)) && apart <= Math.min(limitKm(a, b), CONTAINED_KM);
}

/** How much a row says for itself: the one with more is kept. A hand-curated entry outranks one found by search, which outranks a bare map listing. */
export function richness(row: VenueRow): number {
  let score = 0;
  if (row.source === "manual" || /^curated/i.test(row.admin_notes ?? "")) score += 5;
  if (row.booking_url && !isOsmLink(row.booking_url)) score += 3;
  if (row.recurrence_rule) score += 2;
  score += Math.min(2, (row.description?.length ?? 0) / 150);
  if (!/^Place data from OpenStreetMap/.test(row.admin_notes ?? "")) score += 1;
  return score;
}

/** What the kept entry did not know and a merged one did: it is copied across, so nothing learned about a place is lost by merging. */
export type MergePlan = { keepId: string; dropIds: string[]; upgradeUrl: string | null; carry: Record<string, string> };

const dogKnown = (r: VenueRow) => Boolean(r.dog_access) && r.dog_access !== "unknown";

/** Pure: the facts to copy onto the kept entry from the ones merged into it. */
export function carryOver(keep: VenueRow, dropped: VenueRow[]): Record<string, string> {
  const carry: Record<string, string> = {};
  const dog = !dogKnown(keep) ? dropped.find(dogKnown) : undefined;
  if (dog) {
    carry.dog_access = dog.dog_access!;
    if (dog.dog_restrictions) carry.dog_restrictions = dog.dog_restrictions;
    if (dog.dog_confidence) carry.dog_confidence = dog.dog_confidence;
    if (dog.dog_source) carry.dog_source = dog.dog_source;
  }
  const hours = !keep.recurrence_rule ? dropped.find((d) => d.recurrence_rule) : undefined;
  if (hours) carry.recurrence_rule = hours.recurrence_rule!;
  const access = !keep.accessibility_notes ? dropped.find((d) => d.accessibility_notes) : undefined;
  if (access) carry.accessibility_notes = access.accessibility_notes!;
  return carry;
}

/**
 * Pure: the merges to make among these entries. Only active standing venues are considered. Each group keeps its richest
 * entry (the earliest, on a tie), and if the one kept only has a map listing for a link while another has the venue's own
 * page, that page is kept.
 */
export function planMerges(rows: VenueRow[]): MergePlan[] {
  const venues = rows.filter((r) => r.status === "active" && !r.date_time && r.location_lat != null);
  // Union-find: entries that are the same place as one another end up with one root, however the pairs were found.
  const parent = new Map<string, string>(venues.map((v) => [v.id, v.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      if (sameVenue(venues[i], venues[j])) parent.set(find(venues[i].id), find(venues[j].id));
    }
  }
  const groups = new Map<string, VenueRow[]>();
  for (const v of venues) groups.set(find(v.id), [...(groups.get(find(v.id)) ?? []), v]);

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const ranked = [...g].sort((x, y) => richness(y) - richness(x) || (x.created_at ?? "").localeCompare(y.created_at ?? ""));
      const [keep, ...drop] = ranked;
      const official = isOsmLink(keep.booking_url) ? drop.find((d) => d.booking_url && !isOsmLink(d.booking_url)) : undefined;
      return { keepId: keep.id, dropIds: drop.map((d) => d.id), upgradeUrl: official?.booking_url ?? null, carry: carryOver(keep, drop) };
    });
}

/**
 * Merges duplicate venues in the catalogue: the extra entries are marked removed (never deleted, so a mistake can be
 * undone) with a note saying which one they were merged into. Safe to run as often as wanted. Returns how many entries
 * were merged away.
 */
export async function mergeDuplicateVenues(admin: SupabaseClient): Promise<{ merged: number; error: string | null }> {
  const { data, error } = await admin
    .from("activities")
    .select("id, title, location_lat, location_lng, date_time, status, tags, booking_url, recurrence_rule, description, admin_notes, source, created_at, dog_access, dog_restrictions, dog_confidence, dog_source, accessibility_notes, address")
    .eq("status", "active")
    .is("date_time", null)
    .not("location_lat", "is", null)
    .limit(5000);
  if (error) return { merged: 0, error: error.message };

  const rows = (data ?? []) as VenueRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  let merged = 0;
  for (const plan of planMerges(rows)) {
    const keeperUpdate = { ...plan.carry, ...(plan.upgradeUrl ? { booking_url: plan.upgradeUrl } : {}) };
    if (Object.keys(keeperUpdate).length > 0) await admin.from("activities").update(keeperUpdate).eq("id", plan.keepId);
    for (const id of plan.dropIds) {
      const kept = byId.get(plan.keepId)!;
      const was = byId.get(id)!;
      const note = `Merged into "${kept.title}" (${plan.keepId}) as the same place.${was.admin_notes ? ` Was: ${was.admin_notes}` : ""}`;
      const { error: updateError } = await admin.from("activities").update({ status: "removed", admin_notes: note.slice(0, 500) }).eq("id", id);
      if (!updateError) merged += 1;
    }
  }
  return { merged, error: null };
}
