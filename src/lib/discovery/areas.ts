import type { TicketmasterArea } from "@/lib/discovery/sources/ticketmaster";
import { haversineDistanceKm } from "@/lib/geo/haversine";

type MemberLocation = {
  location_lat: number | null;
  location_lng: number | null;
  travel_radius_km: number | null;
};

const KM_PER_MILE = 1.609;
const MIN_RADIUS_MILES = 5;
const MAX_RADIUS_MILES = 25;
const DEFAULT_RADIUS_MILES = 15;
/** A member within this distance of an area's centre is served by that area's search. */
const CLUSTER_KM = 15;

function radiusMilesFor(travelRadiusKm: number | null): number {
  if (travelRadiusKm == null) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, Math.ceil(Number(travelRadiusKm) / KM_PER_MILE)));
}

/**
 * The distinct places worth fetching events for, from where members actually
 * live: nearby members share one search, and each search reaches as far as the
 * most-travelling member in it is willing to go. Busiest areas first, capped so
 * a nightly run's API usage stays bounded however many members there are.
 *
 * Clusters by distance rather than snapping to a grid, so two neighbours are
 * never split just because a grid line happens to run between them.
 */
export function memberAreas(profiles: MemberLocation[], maxAreas = 10): TicketmasterArea[] {
  type Cluster = { count: number; latSum: number; lngSum: number; radiusMiles: number };
  const clusters: Cluster[] = [];

  for (const p of profiles) {
    if (p.location_lat == null || p.location_lng == null) continue;

    const cluster = clusters.find(
      (c) => haversineDistanceKm(c.latSum / c.count, c.lngSum / c.count, p.location_lat!, p.location_lng!) <= CLUSTER_KM
    );
    const radiusMiles = radiusMilesFor(p.travel_radius_km);
    if (cluster) {
      cluster.count += 1;
      cluster.latSum += p.location_lat;
      cluster.lngSum += p.location_lng;
      cluster.radiusMiles = Math.max(cluster.radiusMiles, radiusMiles);
    } else {
      clusters.push({ count: 1, latSum: p.location_lat, lngSum: p.location_lng, radiusMiles });
    }
  }

  return clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, maxAreas)
    .map((c) => ({ lat: c.latSum / c.count, lng: c.lngSum / c.count, radiusMiles: c.radiusMiles }));
}
