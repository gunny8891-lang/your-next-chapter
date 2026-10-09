import type { SupabaseClient } from "@supabase/supabase-js";
import { coverageBox } from "@/lib/discovery/osmPlaces";

/**
 * Whether we know many places near a member, so that a first visit from somewhere we have only just started to learn
 * can say so honestly. New places are found for an area when someone from there joins, and again every night, so thin
 * is usually a matter of days, and a kind line saying that is better than ideas that look like all there is.
 */

/** About a short drive: the places that could reasonably be suggested to someone living here. */
export const NEARBY_KM = 10;
/** Fewer places than this nearby and the area is still being learned. A town the size of Stevenage has several times this. */
export const THIN_AREA_PLACES = 30;

export const AREA_LEARNING_MESSAGE =
  "We're still getting to know the places near you, so you may see fewer ideas than usual for now. More are added every night.";

/** Pure: whether a count of nearby places is few enough to say so. A count we could not get is never "few". */
export function isThinArea(count: number | null): boolean {
  return count !== null && count < THIN_AREA_PLACES;
}

/** How many active places lie near a point, or null when that could not be counted (the note is then simply left out). */
export async function countNearbyPlaces(supabase: SupabaseClient, lat: number | null, lng: number | null): Promise<number | null> {
  if (lat === null || lng === null) return null;
  const box = coverageBox({ lat, lng }, NEARBY_KM);
  const { count, error } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("location_lat", box.latMin)
    .lte("location_lat", box.latMax)
    .gte("location_lng", box.lngMin)
    .lte("location_lng", box.lngMax);
  if (error) return null;
  return count ?? null;
}
