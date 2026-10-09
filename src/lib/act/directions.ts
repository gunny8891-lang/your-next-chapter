/**
 * "How to get there": a link that opens the phone's own maps with the place already entered and the right way of
 * travelling chosen. No account, no key and no cost: it is only a link. Where they start from is left out on purpose, so
 * the maps app starts from wherever they actually are when they tap it (which is both more accurate and nothing of theirs
 * to put in an address). Pure.
 */

import { haversineDistanceKm } from "@/lib/geo/haversine";
import { estimateTravel, type TravelMode, type TravelProfile } from "@/lib/someTime/travel";

const MAPS_MODE: Record<TravelMode, "walking" | "driving" | "transit"> = {
  walk: "walking",
  drive: "driving",
  "public transport": "transit",
  // A mix is a journey by public transport with a walk at either end: the maps app plans that as transit.
  mixed: "transit",
};

export function directionsUrl(place: { lat?: number | null; lng?: number | null }, mode: TravelMode | null = null): string | null {
  const { lat, lng } = place;
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  const params = new URLSearchParams({ api: "1", destination: `${la.toFixed(6)},${ln.toFixed(6)}` });
  if (mode) params.set("travelmode", MAPS_MODE[mode]);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** The way this member would get there (from their own travel answers and how far it is), or null when home is not known. */
export function travelModeToward(
  home: { lat?: number | null; lng?: number | null } | null | undefined,
  place: { lat?: number | null; lng?: number | null },
  travel: TravelProfile
): TravelMode | null {
  if (!home || home.lat == null || home.lng == null || place.lat == null || place.lng == null) return null;
  const km = haversineDistanceKm(Number(home.lat), Number(home.lng), Number(place.lat), Number(place.lng));
  return estimateTravel(km, travel).mode;
}
