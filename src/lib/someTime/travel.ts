/**
 * A rough but honest door-to-door travel time, from straight-line distance.
 * There is no routing service behind it, so it is deliberately conservative and
 * is shown to the member as an estimate ("about 12 min").
 */

export type TravelProfile = {
  drives: boolean | null;
  uses_public_transport: boolean | null;
  mobility_notes: string | null;
};

export type TravelMode = "walk" | "drive" | "public transport" | "mixed";

// Roads and paths are longer than the crow flies.
const DETOUR_FACTOR = 1.3;
const WALK_KMH = 4.5;
// Someone who has told us about mobility needs gets a slower pace and a shorter "walkable".
const WALK_KMH_LIMITED = 3.2;
const WALKABLE_KM = 1.6;
const WALKABLE_KM_LIMITED = 0.9;
const DRIVE_KMH = 30;
const DRIVE_OVERHEAD_MIN = 6; // parking, getting to the car
const TRANSIT_KMH = 18;
const TRANSIT_OVERHEAD_MIN = 10; // walking to a stop, waiting
// Unknown how they get about (nothing in the app asks yet): assume a blend.
const MIXED_KMH = 22;
const MIXED_OVERHEAD_MIN = 8;
const MIN_TRAVEL_MIN = 3;

export type Travel = { minutes: number; mode: TravelMode };

export function estimateTravel(distanceKm: number, profile: TravelProfile): Travel {
  const road = Math.max(0, distanceKm) * DETOUR_FACTOR;
  const limited = Boolean(profile.mobility_notes?.trim());
  const walkKmh = limited ? WALK_KMH_LIMITED : WALK_KMH;
  const walkableKm = limited ? WALKABLE_KM_LIMITED : WALKABLE_KM;

  if (road <= walkableKm) {
    return { minutes: Math.max(MIN_TRAVEL_MIN, Math.ceil((road / walkKmh) * 60)), mode: "walk" };
  }

  const [kmh, overhead, mode]: [number, number, TravelMode] = profile.drives
    ? [DRIVE_KMH, DRIVE_OVERHEAD_MIN, "drive"]
    : profile.uses_public_transport
      ? [TRANSIT_KMH, TRANSIT_OVERHEAD_MIN, "public transport"]
      : [MIXED_KMH, MIXED_OVERHEAD_MIN, "mixed"];

  return { minutes: Math.ceil((road / kmh) * 60 + overhead), mode };
}

export function estimateTravelMinutes(distanceKm: number, profile: TravelProfile): number {
  return estimateTravel(distanceKm, profile).minutes;
}
