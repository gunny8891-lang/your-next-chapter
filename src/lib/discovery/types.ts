import type { CategoryName } from "@/lib/categories";

export type RawActivityCandidate = {
  title: string;
  description: string | null;
  category: CategoryName;
  address: string | null;
  locationLat: number | null;
  locationLng: number | null;
  dateTime: string | null;
  priceEstimate: number | null;
  bookingUrl: string;
  tags: string[];
};

export interface DiscoverySource {
  name: string;
  fetchCandidates(): Promise<RawActivityCandidate[]>;
}
