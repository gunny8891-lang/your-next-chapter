import { haversineDistanceKm } from "@/lib/geo/haversine";

type GeoActivity = { location_lat: number | null; location_lng: number | null };
type GeoProfile = { location_lat: number | null; location_lng: number | null; travel_radius_km: number | null };

/**
 * Restricts candidates to those within a member's travel radius, when we have
 * enough real coordinates to judge that. Falls back to no filtering (rather
 * than an empty candidate set) whenever either side is unknown — missing
 * profile coordinates, no radius set, or an activity that hasn't been
 * geocoded yet — since an unfiltered recommendation beats none at all.
 */
export function filterByDistance<T extends GeoActivity>(activities: T[], profile: GeoProfile): T[] {
  if (profile.location_lat == null || profile.location_lng == null || profile.travel_radius_km == null) {
    return activities;
  }

  return activities.filter((a) => {
    if (a.location_lat == null || a.location_lng == null) return false;
    return (
      haversineDistanceKm(profile.location_lat!, profile.location_lng!, a.location_lat, a.location_lng) <=
      profile.travel_radius_km!
    );
  });
}
