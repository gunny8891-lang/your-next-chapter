import type { SupabaseClient } from "@supabase/supabase-js";
import { localityWords, placeRadiusKm, type Place } from "@/lib/imagery/commons";
import { findPlaceImage, type FetchJson } from "@/lib/imagery/find";
import type { PlaceImage } from "@/lib/imagery/types";
import { OSM_NOTE_PREFIX } from "@/lib/discovery/sources/openStreetMap";

/** A place with no photograph is looked for again after this long (new photographs are uploaded all the time). */
const RECHECK_AFTER_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

type ImageRow = {
  id: string;
  title: string;
  address: string | null;
  tags: string[] | null;
  location_lat: number | null;
  location_lng: number | null;
};

const ROW_COLUMNS = "id, title, address, tags, location_lat, location_lng";

/** Pure: the place to look for a photograph of, or null when the row cannot be matched safely. */
export function placeFromRow(row: ImageRow): Place | null {
  if (row.location_lat == null || row.location_lng == null) return null;
  return {
    title: row.title,
    lat: row.location_lat,
    lng: row.location_lng,
    radiusKm: placeRadiusKm(row.tags ?? []),
    locality: localityWords(row.address),
  };
}

/**
 * Photographs are only looked for on real, named venues that came from
 * OpenStreetMap (a park, a museum, a pub). Everything else in the catalogue is
 * an event, a group or a class: its title says what it is, not where, and a
 * search on "Tai Chi in the Park" returns somebody else's tai chi.
 */
export function isNamedVenue(row: { admin_notes: string | null }): boolean {
  return (row.admin_notes ?? "").startsWith(OSM_NOTE_PREFIX);
}

/**
 * The photographs we already hold for these activities, by id. The columns come
 * from a later migration than the rest of the catalogue, so a read that fails
 * (not applied yet, a hiccup) simply means "no photographs": it must never take
 * a recommendation down with it.
 */
export async function loadImages(supabase: SupabaseClient, ids: string[]): Promise<Map<string, PlaceImage>> {
  const images = new Map<string, PlaceImage>();
  if (ids.length === 0) return images;
  const { data, error } = await supabase
    .from("activities")
    .select("id, image_url, image_alt, image_credit, image_license, image_source_url")
    .in("id", ids);
  if (error) {
    console.warn("imagery: could not read photographs:", error.message);
    return images;
  }
  for (const row of data ?? []) {
    if (!row.image_url) continue;
    images.set(row.id, {
      src: row.image_url,
      alt: row.image_alt ?? "",
      credit: row.image_credit ?? "",
      sourceUrl: row.image_source_url ?? "",
      license: row.image_license ?? "",
    });
  }
  return images;
}

export type EnrichSummary = { checked: number; found: number; none: number; errors: number; skipped: number };

type EnrichOptions = {
  fetchJson?: FetchJson;
  /** Stop starting new lookups after this long, so a slow service cannot use up the job's time. */
  budgetMs?: number;
  /** Pause between lookups: Wikimedia asks clients to be gentle. */
  pauseMs?: number;
  now?: Date;
};

async function enrichRows(admin: SupabaseClient, rows: ImageRow[], options: EnrichOptions): Promise<EnrichSummary> {
  const summary: EnrichSummary = { checked: 0, found: 0, none: 0, errors: 0, skipped: 0 };
  const started = Date.now();
  const budget = options.budgetMs ?? 20_000;
  const pause = options.pauseMs ?? 300;

  for (const row of rows) {
    if (Date.now() - started > budget) {
      summary.skipped += 1;
      continue;
    }
    const place = placeFromRow(row);
    if (!place) {
      summary.skipped += 1;
      continue;
    }
    const checkedAt = (options.now ?? new Date()).toISOString();
    const result = await findPlaceImage(place, options.fetchJson);
    summary.checked += 1;

    if (result.status === "error") {
      // Says nothing about the place, so it is not marked as looked at.
      summary.errors += 1;
      console.warn(`imagery: lookup failed for "${row.title}": ${result.error}`);
    } else if (result.status === "found") {
      const { image } = result;
      const { error } = await admin
        .from("activities")
        .update({
          image_url: image.src,
          image_alt: image.alt,
          image_credit: image.credit,
          image_license: image.license,
          image_source_url: image.sourceUrl,
          image_checked_at: checkedAt,
        })
        .eq("id", row.id);
      if (error) {
        summary.errors += 1;
        console.warn(`imagery: could not save a photograph for "${row.title}": ${error.message}`);
      } else {
        summary.found += 1;
      }
    } else {
      const { error } = await admin.from("activities").update({ image_checked_at: checkedAt }).eq("id", row.id);
      if (error) summary.errors += 1;
      else summary.none += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
  return summary;
}

function dueFilter(now: Date): string {
  const cutoff = new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS).toISOString();
  return `image_checked_at.is.null,image_checked_at.lt.${cutoff}`;
}

/** The nightly job's share: the places that have never been looked at (then the stalest), a handful at a time. */
export async function enrichDueImages(admin: SupabaseClient, limit: number, options: EnrichOptions = {}): Promise<EnrichSummary> {
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from("activities")
    .select(ROW_COLUMNS)
    .eq("status", "active")
    .like("admin_notes", `${OSM_NOTE_PREFIX}%`)
    .is("image_url", null)
    .not("location_lat", "is", null)
    .or(dueFilter(now))
    .order("image_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    console.warn("imagery: could not list places to photograph:", error.message);
    return { checked: 0, found: 0, none: 0, errors: 1, skipped: 0 };
  }
  return enrichRows(admin, (data ?? []) as ImageRow[], { ...options, now });
}

/** The places a member has just been shown, so the next time they look they have their photographs. */
export async function enrichImagesFor(admin: SupabaseClient, ids: string[], options: EnrichOptions = {}): Promise<EnrichSummary> {
  if (ids.length === 0) return { checked: 0, found: 0, none: 0, errors: 0, skipped: 0 };
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from("activities")
    .select(ROW_COLUMNS)
    .in("id", ids)
    .eq("status", "active")
    .like("admin_notes", `${OSM_NOTE_PREFIX}%`)
    .is("image_url", null)
    .not("location_lat", "is", null)
    .or(dueFilter(now));
  if (error) {
    console.warn("imagery: could not list places to photograph:", error.message);
    return { checked: 0, found: 0, none: 0, errors: 1, skipped: 0 };
  }
  return enrichRows(admin, (data ?? []) as ImageRow[], { budgetMs: 8_000, ...options, now });
}
