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
  /** Defaults to 'active' in the pipeline if omitted. Sources with lower-confidence
   * extraction (e.g. LLM-parsed pages) should set 'needs_review' + adminNotes. */
  status?: "active" | "needs_review";
  adminNotes?: string | null;
};

export interface DiscoverySource {
  name: string;
  fetchCandidates(): Promise<RawActivityCandidate[]>;
}
