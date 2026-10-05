const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export type Coordinates = { lat: number; lng: number };

async function queryNominatim(query: string): Promise<Coordinates | null> {
  // Constrained to Great Britain: without a country hint, Nominatim's free-text
  // search has matched UK venue addresses (e.g. "Richmond Park, Richmond TW10")
  // to identically-named places on other continents — every current and planned
  // region for this app is UK-based, so this is a safe, load-bearing constraint,
  // not just an optimization.
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "LarkHour/1.0 (retirement concierge app)" },
  });
  if (!res.ok) return null;

  const results = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = results[0];
  if (!first) return null;

  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { lat, lng };
}

/**
 * Nominatim (OpenStreetMap) geocoding — free, keyless, but its usage policy
 * requires an identifying User-Agent and asks for no more than ~1 request/sec:
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * Venue-style addresses (e.g. "Old Deer Park, Richmond TW9") often don't match
 * as a whole string, so on a miss this retries with the address trimmed down to
 * its last comma-separated segments — usually the town/postcode — which is
 * enough for radius filtering even without venue-level precision.
 */
export async function geocodeLocation(query: string): Promise<Coordinates | null> {
  // Natural free-text answers like "near Birmingham" otherwise fail to match at
  // all — Nominatim searches for the place name, not a description of it.
  const trimmed = query.trim().replace(/^near\s+/i, "");
  if (!trimmed) return null;

  try {
    const direct = await queryNominatim(trimmed);
    if (direct) return direct;

    const segments = trimmed.split(",").map((s) => s.trim());
    for (let drop = 1; drop < segments.length; drop++) {
      const narrowed = segments.slice(drop).join(", ");
      if (!narrowed) continue;
      await sleep(1100);
      const fallback = await queryNominatim(narrowed);
      if (fallback) return fallback;
    }

    return null;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
