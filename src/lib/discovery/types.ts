import type { CategoryName } from "@/lib/categories";
import type { DogFactsFromSource } from "@/lib/discovery/dogTags";

export type RawActivityCandidate = {
  title: string;
  description: string | null;
  category: CategoryName;
  address: string | null;
  locationLat: number | null;
  locationLng: number | null;
  /** Start of a single one-off event only. Null for anything that runs on many dates. */
  dateTime: string | null;
  /** Last date a multi-date item (ongoing exhibition, seasonal series) is available, when the source states one. */
  availableUntil?: string | null;
  priceEstimate: number | null;
  /** Weekly opening hours for a standing venue, in OpenStreetMap syntax ("Mo-Fr 09:00-17:00; Sa 10:00-16:00"). Stored in activities.recurrence_rule. */
  openingHours?: string | null;
  /** Typical visit length, when known. Stored in activities.duration_minutes. */
  durationMinutes?: number | null;
  bookingUrl: string;
  /** Whether dogs are allowed, when the source says so (and where it says so from). Absent means unknown, which is not the same as no. */
  dog?: DogFactsFromSource | null;
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
