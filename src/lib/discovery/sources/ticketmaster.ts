import type { CategoryName } from "@/lib/categories";
import type { DiscoverySource, RawActivityCandidate } from "@/lib/discovery/types";

// Richmond, London — matches the pilot region in supabase/seed.sql.
const PILOT_LAT = 51.4613;
const PILOT_LNG = -0.3037;
const RADIUS_MILES = 20;

const SEGMENT_TO_CATEGORY: Record<string, CategoryName> = {
  Sports: "Move",
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

type TmEvent = {
  name: string;
  info?: string;
  url: string;
  dates?: { start?: { dateTime?: string } };
  priceRanges?: { min?: number }[];
  classifications?: { segment?: { name?: string } }[];
  _embedded?: { venues?: TmVenue[] };
};

export function createTicketmasterSource(): DiscoverySource {
  return {
    name: "ticketmaster",
    async fetchCandidates(): Promise<RawActivityCandidate[]> {
      const apiKey = process.env.TICKETMASTER_API_KEY;
      if (!apiKey) throw new Error("TICKETMASTER_API_KEY is not set");

      const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("latlong", `${PILOT_LAT},${PILOT_LNG}`);
      url.searchParams.set("radius", String(RADIUS_MILES));
      url.searchParams.set("unit", "miles");
      url.searchParams.set("size", "50");
      url.searchParams.set("sort", "date,asc");

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Ticketmaster API returned ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as { _embedded?: { events?: TmEvent[] } };
      const events = body._embedded?.events ?? [];

      return events.map((event): RawActivityCandidate => {
        const venue = event._embedded?.venues?.[0];
        const addressParts = [venue?.address?.line1, venue?.city?.name].filter(Boolean);
        return {
          title: event.name,
          description: event.info ?? null,
          category: mapCategory(event.classifications?.[0]?.segment?.name),
          address: addressParts.length ? addressParts.join(", ") : null,
          locationLat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
          locationLng: venue?.location?.longitude ? Number(venue.location.longitude) : null,
          dateTime: event.dates?.start?.dateTime ?? null,
          priceEstimate: event.priceRanges?.[0]?.min ?? null,
          bookingUrl: event.url,
          tags: event.classifications?.[0]?.segment?.name ? [event.classifications[0].segment!.name!.toLowerCase()] : [],
        };
      });
    },
  };
}
