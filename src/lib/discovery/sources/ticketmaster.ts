import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";
import { isValidIso } from "@/lib/discovery/dateFields";

export type TicketmasterArea = { lat: number; lng: number; radiusMiles: number };

/** Richmond, London — the original pilot area; used when no member has a resolved location. */
export const RICHMOND_AREA: TicketmasterArea = { lat: 51.4613, lng: -0.3037, radiusMiles: 20 };

// Sports is spectating here (matches, not exercise), so it is not "Move" — that
// would recommend a football fixture to a member whose goal is fitness.
const SEGMENT_TO_CATEGORY: Record<string, CategoryName> = {
  Sports: "Joy",
  Music: "Joy",
  Film: "Joy",
  "Arts & Theatre": "Learn",
};

function mapCategory(segmentName: string | undefined): CategoryName {
  if (segmentName && segmentName in SEGMENT_TO_CATEGORY) return SEGMENT_TO_CATEGORY[segmentName];
  return "Explore";
}

type TmVenue = {
  name?: string;
  city?: { name?: string };
  address?: { line1?: string };
  location?: { latitude?: string; longitude?: string };
};

export type TmEvent = {
  name: string;
  info?: string;
  url: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
    status?: { code?: string };
  };
  priceRanges?: { min?: number }[];
  classifications?: { segment?: { name?: string } }[];
  _embedded?: { venues?: TmVenue[] };
};

/**
 * The venue's own date and time. The rest of the app stores event times as the
 * wall-clock time the venue published (see opportunities/schedule.ts), so using
 * the UTC instant here would show a 7:30pm gig as 6:30pm all summer.
 */
function startTime(event: TmEvent): string | null {
  const { localDate, localTime, dateTime } = event.dates?.start ?? {};
  if (localDate && localTime) {
    const local = `${localDate}T${localTime}`;
    if (isValidIso(local)) return local;
  }
  return dateTime && isValidIso(dateTime) ? dateTime : null;
}

/** Pure: Ticketmaster events → candidates. Skips cancelled events and any with no usable start time. */
export function mapTicketmasterEvents(events: TmEvent[]): RawActivityCandidate[] {
  const candidates: RawActivityCandidate[] = [];
  for (const event of events) {
    if (event.dates?.status?.code === "cancelled") continue;
    // An undated event would be read as a standing venue and never expire.
    const dateTime = startTime(event);
    if (!dateTime) continue;

    const venue = event._embedded?.venues?.[0];
    const addressParts = [venue?.address?.line1, venue?.city?.name].filter(Boolean);
    const segment = event.classifications?.[0]?.segment?.name;
    candidates.push({
      title: event.name,
      description: event.info ?? null,
      category: mapCategory(segment),
      address: addressParts.length ? addressParts.join(", ") : null,
      locationLat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
      locationLng: venue?.location?.longitude ? Number(venue.location.longitude) : null,
      dateTime,
      priceEstimate: event.priceRanges?.[0]?.min ?? null,
      bookingUrl: event.url,
      tags: segment ? [segment.toLowerCase()] : [],
    });
  }
  return candidates;
}

export function createTicketmasterSource(area: TicketmasterArea = RICHMOND_AREA): DiscoverySource {
  return {
    name: `ticketmaster (${area.lat.toFixed(2)}, ${area.lng.toFixed(2)})`,
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const apiKey = process.env.TICKETMASTER_API_KEY;
      if (!apiKey) throw new Error("TICKETMASTER_API_KEY is not set");

      const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("latlong", `${area.lat},${area.lng}`);
      url.searchParams.set("radius", String(area.radiusMiles));
      url.searchParams.set("unit", "miles");
      url.searchParams.set("size", "50");
      url.searchParams.set("sort", "date,asc");

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Ticketmaster API returned ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as { _embedded?: { events?: TmEvent[] } };
      return mapTicketmasterEvents(body._embedded?.events ?? []);
    },
  };
}
