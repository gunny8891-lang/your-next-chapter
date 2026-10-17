import type { SupabaseClient } from "@supabase/supabase-js";
import { searchRegionsThrottled, type RegionRequest, type RunSearch, type ThrottledSearchSummary } from "@/lib/discovery/regional";
import { persistDiscovery } from "@/lib/discovery/run";
import { createOrganiserSource } from "@/lib/discovery/sources/organiserPage";
import { OSM_NOTE_PREFIX } from "@/lib/discovery/sources/openStreetMap";
import { ORGANISER_THEME } from "@/lib/discovery/themes";
import { addDays } from "@/lib/opportunities/schedule";

/**
 * Growing the event list from what members do. Every organiser we have found something from (a council, a U3A branch, a
 * charity) is a page that keeps listing new events, and rereading it is far cheaper than a search. Which ones are reread first
 * follows what members have shown an interest in: an organiser whose events they saved, planned or went to is looked at
 * before one nobody has touched, and again sooner. Each is reread at most every two weeks, a few a night, within the same daily
 * search budget as everything else, and the same throttle (so one that keeps finding nothing is left alone for longer).
 */

/** How far back an interest still counts. */
export const ENGAGEMENT_WINDOW_DAYS = 45;
/** How many organisers are put forward at a time: the throttle then decides which are due. */
export const ORGANISER_POOL = 12;
/** Organisers reread in one run: each can take a minute or two. */
export const ORGANISERS_PER_RUN = 2;

/** Pages that are not an organiser's own listing: maps, social networks, encyclopaedias, the fallback search link. */
const NOT_AN_ORGANISER = ["openstreetmap.org", "google.com", "google.co.uk", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "wikipedia.org", "wikimedia.org", "search.local"];

/** The site a link belongs to, without "www."; null if it is not a web address. Pure. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function isOrganiserHost(host: string | null): host is string {
  return Boolean(host) && !NOT_AN_ORGANISER.some((h) => host === h || host!.endsWith(`.${h}`));
}

export type OrganiserRow = { id: string; booking_url: string | null; date_time: string | null; expires_at: string | null; admin_notes?: string | null };
export type Organiser = { host: string; entryUrl: string; engaged: number; upcoming: number; rows: number; score: number };

/**
 * Pure: the organisers worth rereading, best first. A row only counts if it came from a search or a page (not a venue listing
 * from the map). The score is mostly what members have done with the organiser's events, then how many events it has been
 * giving us, then how much of the catalogue it is.
 */
export function rankOrganisers(rows: OrganiserRow[], engagement: Map<string, number>, now: Date): Organiser[] {
  const byHost = new Map<string, { rows: OrganiserRow[] }>();
  for (const row of rows) {
    if ((row.admin_notes ?? "").startsWith(OSM_NOTE_PREFIX)) continue;
    const host = hostOf(row.booking_url);
    if (!isOrganiserHost(host)) continue;
    byHost.set(host, { rows: [...(byHost.get(host)?.rows ?? []), row] });
  }
  const nowIso = now.toISOString();
  const organisers: Organiser[] = [];
  for (const [host, { rows: group }] of byHost) {
    const engaged = group.reduce((sum, r) => sum + (engagement.get(r.id) ?? 0), 0);
    const upcoming = group.filter((r) => r.date_time && !r.expires_at && r.date_time >= nowIso).length;
    // Where to start reading: the page of the event they were most interested in, else the latest event, else any page of theirs.
    const best =
      [...group].sort((a, b) => (engagement.get(b.id) ?? 0) - (engagement.get(a.id) ?? 0) || (b.date_time ?? "").localeCompare(a.date_time ?? ""))[0];
    // A link with a "#" is an address we made to tell one event from another on a shared page: the page itself is before it.
    const entryUrl = (best.booking_url ?? "").split("#")[0];
    organisers.push({ host, entryUrl, engaged, upcoming, rows: group.length, score: engaged * 3 + upcoming + Math.min(group.length, 5) * 0.2 });
  }
  return organisers.sort((a, b) => b.score - a.score || a.host.localeCompare(b.host)).slice(0, ORGANISER_POOL);
}

/** Pure: how many times each activity was saved, planned or gone to, from the log of what members did. */
export function engagementCounts(events: { activity_id: string | null; event_type: string; reason?: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.activity_id) continue;
    if (!["saved", "planned", "completed"].includes(e.event_type)) continue;
    counts.set(e.activity_id, (counts.get(e.activity_id) ?? 0) + 1);
  }
  return counts;
}

/** Reads the catalogue and the log of what members did, and ranks the organisers. Counts of activities only: nothing about who. */
export async function loadOrganisers(admin: SupabaseClient, now: Date = new Date()): Promise<Organiser[]> {
  const since = `${addDays(now.toISOString().slice(0, 10), -ENGAGEMENT_WINDOW_DAYS)}T00:00:00Z`;
  const [{ data: rows, error: rowsError }, { data: events }] = await Promise.all([
    admin.from("activities").select("id, booking_url, date_time, expires_at, admin_notes").eq("status", "active").limit(3000),
    admin.from("experience_events").select("activity_id, event_type").in("event_type", ["saved", "planned", "completed"]).gte("created_at", since).limit(5000),
  ]);
  if (rowsError) throw new Error(`Couldn't read the catalogue: ${rowsError.message}`);
  return rankOrganisers((rows ?? []) as OrganiserRow[], engagementCounts((events ?? []) as never), now);
}

export type OrganiserDeps = {
  load?: typeof loadOrganisers;
  searchRegions?: typeof searchRegionsThrottled;
  persist?: typeof persistDiscovery;
  source?: typeof createOrganiserSource;
  now?: Date;
};

/** Rereads the organisers that are due, at most `max` of them, through the same throttle as the searches. */
export async function refreshOrganisers(admin: SupabaseClient, options: { max?: number; force?: boolean } & OrganiserDeps = {}): Promise<{ organisers: Organiser[]; summary: ThrottledSearchSummary }> {
  const now = options.now ?? new Date();
  const organisers = await (options.load ?? loadOrganisers)(admin, now);
  const entryByHost = new Map(organisers.map((o) => [o.host, o.entryUrl]));
  const persist = options.persist ?? persistDiscovery;
  const makeSource = options.source ?? createOrganiserSource;

  // The throttle works in "places" and "themes"; an organiser is a place named by its site, read under a theme of its own.
  const requests: RegionRequest[] = organisers.map((o) => ({ label: o.host, theme: ORGANISER_THEME, nameOnly: true }));
  const runSearch: RunSearch = (host) => persist(admin, [makeSource(host, entryByHost.get(host) ?? `https://${host}/`)]);

  const summary = await (options.searchRegions ?? searchRegionsThrottled)(admin, requests, {
    maxSearches: options.max ?? ORGANISERS_PER_RUN,
    force: options.force,
    now,
    runSearch,
  });
  return { organisers, summary };
}
