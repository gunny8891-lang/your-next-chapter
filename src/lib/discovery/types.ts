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
  /** True only when bookingUrl is a genuine per-event/per-listing URL the source
   * actually found — not a synthetic fallback (e.g. a fragment anchor on a
   * generic source page). Used alongside a resolved location to auto-activate
   * otherwise-needs_review candidates without a human review pass. */
  bookingUrlVerified?: boolean;
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
