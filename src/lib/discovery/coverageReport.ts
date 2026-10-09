import { haversineKm } from "@/lib/discovery/sources/openStreetMap";
import { planMerges, type VenueRow } from "@/lib/discovery/duplicates";

/**
 * How well the catalogue covers a place, measured rather than guessed. It reads what is stored near a point and reports
 * what is there, what is missing, and how much of it can be trusted: counts by kind, how many dated sessions are real
 * and upcoming, how many entries have a link to the organiser's own page, how many are the same place twice. It sets no
 * target for how many there should be: the way to know whether coverage is good is to compare it with what is really
 * there (the venues named in a validation list, and what local sources show), not to chase a number.
 *
 * Pure, so the same report can be produced for any town, and tested.
 */

export type ReportRow = VenueRow & {
  category: string;
  price_type: string | null;
  price_estimate: number | null;
  dog_access: string | null;
  accessibility_notes: string | null;
  expires_at: string | null;
  address: string | null;
};

export type ExpectedVenue = { name: string; /** Other names it goes by. */ aliases?: string[] };

export type CoverageOptions = {
  now: Date;
  centre: { lat: number; lng: number };
  radiusKm: number;
  expected?: ExpectedVenue[];
};

export type TypeCheck = { label: string; count: number; examples: string[] };

export type CoverageReport = {
  region: { radiusKm: number };
  total: number;
  byCategory: Record<string, number>;
  /** Places that are there whenever open (a park, a museum, a café), as against things on at a particular time. */
  standingVenues: number;
  datedSessions: number;
  upcomingDated: number;
  /** Still marked active though over: should be none, since the recommender also ignores them. */
  expiredStillActive: number;
  /** Entries with opening hours or a schedule recorded. */
  withSchedule: number;
  free: number;
  costUnknown: number;
  suitedToOlderAdults: number;
  social: number;
  dogAllowed: number;
  dogUnknown: number;
  withAccessibilityNotes: number;
  withWheelchairTag: number;
  /** Percentages of active entries, 0 to 100, or null when there are none. */
  officialLinkPercent: number | null;
  coordinatesPercent: number | null;
  /** Dated sessions whose time was read from the organiser's own page, as a percentage of dated sessions. */
  datedFromOrganiserPercent: number | null;
  outsideRadius: number;
  duplicateGroups: number;
  /** Entries that would be merged away, as a percentage of standing venues. */
  duplicatePercent: number | null;
  types: TypeCheck[];
  expected: { name: string; found: { title: string; status: string }[] }[];
};

const isOsmLink = (url: string | null) => /openstreetmap\.org/i.test(url ?? "");

const normalise = (name: string) =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|and)\b/g, " ").replace(/\s+/g, " ").trim();

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

const OLDER_ADULT_TAGS = ["walking", "gentle exercise", "fitness", "yoga", "tai-chi", "knitting", "history", "books", "museum", "gardens", "craft", "swimming", "heritage", "art", "dance", "bowling"];
const SOCIAL_TAGS = ["social", "community", "community-centre", "friendship", "coffee morning", "u3a", "new members"];

/**
 * The kinds of thing a person might hope to find locally, each asked of the stored entries by what they say about
 * themselves. The same list is used for every town. The words are tested against the title and tags (not the whole
 * description, which would match "walk" in a sentence about a café).
 */
export const TYPE_CHECKS: { label: string; pattern: RegExp }[] = [
  { label: "Walking groups and guided walks", pattern: /\b(walking group|walking for health|health walk|guided walk|ramblers?|nordic walking|walk(?:s)? with)\b/i },
  { label: "Coffee mornings and lunch clubs", pattern: /\b(coffee morning|lunch club|tea dance|afternoon tea|friendship club|drop[- ]in)\b/i },
  { label: "Social clubs and meetups", pattern: /\b(social club|meet ?up|u3a|men'?s shed|women'?s institute|wi group|friendship group|newcomers)\b/i },
  { label: "Volunteering", pattern: /\b(volunteer|befriend|charity shop|conservation|community garden)\b/i },
  { label: "Gardening and conservation", pattern: /\b(gardening|allotment|community garden|conservation|wildlife trust|nature reserve)\b/i },
  { label: "Fitness classes for older adults", pattern: /\b(walking football|over[- ]?(?:50|55|60)s?|seniors?|silver|strength and balance|tai chi|chair|gentle|pilates|yoga|aqua)\b/i },
  { label: "Creative workshops", pattern: /\b(craft|knitting|crochet|sewing|pottery|painting|art class|photograph|workshop|drawing)\b/i },
  { label: "Indoor entertainment and family venues", pattern: /\b(trampoline|soft play|bowling|crazy golf|adventure golf|mini golf|escape room|axe throwing|darts|play centre|laser|cinema|gravity|battle bar)\b/i },
  { label: "Local history", pattern: /\b(history|heritage|museum|archive|local studies)\b/i },
  { label: "Book groups and libraries", pattern: /\b(book club|reading group|library|bookshop)\b/i },
];

const WHEELCHAIR_TAG = "wheelchair-accessible";

/** Pure: the report for these stored entries around a centre. */
export function buildCoverageReport(allRows: ReportRow[], options: CoverageOptions): CoverageReport {
  const { now, centre, radiusKm } = options;
  const nowIso = now.toISOString().slice(0, 16);
  const active = allRows.filter((r) => r.status === "active");
  const has = (r: ReportRow, tags: string[]) => tags.some((t) => (r.tags ?? []).includes(t));

  const byCategory: Record<string, number> = {};
  for (const r of active) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

  const dated = active.filter((r) => r.date_time);
  const standing = active.filter((r) => !r.date_time);
  const withPosition = active.filter((r) => r.location_lat != null && r.location_lng != null);

  const merges = planMerges(active);
  const duplicateEntries = merges.reduce((n, m) => n + m.dropIds.length, 0);

  const expired = active.filter((r) => (r.date_time && r.date_time.slice(0, 16) < nowIso) || (r.expires_at && r.expires_at.slice(0, 16) < nowIso));

  const types: TypeCheck[] = TYPE_CHECKS.map(({ label, pattern }) => {
    const matches = active.filter((r) => pattern.test(`${r.title} ${(r.tags ?? []).join(" ")}`));
    // Examples are of distinct things, not eight sessions of one.
    const examples = [...new Set(matches.map((m) => m.title))].slice(0, 4);
    return { label, count: matches.length, examples };
  });

  const expected = (options.expected ?? []).map((venue) => {
    const names = [venue.name, ...(venue.aliases ?? [])].map(normalise).filter(Boolean);
    const found = allRows
      .filter((r) => {
        const title = normalise(r.title);
        return names.some((n) => title === n || title.includes(n));
      })
      .map((r) => ({ title: r.title, status: r.status }));
    return { name: venue.name, found };
  });

  return {
    region: { radiusKm },
    total: active.length,
    byCategory,
    standingVenues: standing.length,
    datedSessions: dated.length,
    upcomingDated: dated.filter((r) => (r.date_time ?? "").slice(0, 16) >= nowIso).length,
    expiredStillActive: expired.length,
    withSchedule: active.filter((r) => r.recurrence_rule).length,
    free: active.filter((r) => r.price_type === "free" || r.price_estimate === 0).length,
    costUnknown: active.filter((r) => !r.price_type || r.price_type === "unknown").length,
    suitedToOlderAdults: active.filter((r) => has(r, OLDER_ADULT_TAGS)).length,
    social: active.filter((r) => has(r, SOCIAL_TAGS)).length,
    dogAllowed: active.filter((r) => r.dog_access === "allowed").length,
    dogUnknown: active.filter((r) => !r.dog_access || r.dog_access === "unknown").length,
    withAccessibilityNotes: active.filter((r) => r.accessibility_notes).length,
    withWheelchairTag: active.filter((r) => (r.tags ?? []).includes(WHEELCHAIR_TAG)).length,
    officialLinkPercent: percent(active.filter((r) => r.booking_url && !isOsmLink(r.booking_url)).length, active.length),
    coordinatesPercent: percent(withPosition.length, active.length),
    datedFromOrganiserPercent: percent(dated.filter((r) => /dates and times from/i.test(r.admin_notes ?? "") && !isOsmLink(r.booking_url)).length, dated.length),
    outsideRadius: withPosition.filter((r) => haversineKm(centre, { lat: r.location_lat!, lng: r.location_lng! }) > radiusKm).length,
    duplicateGroups: merges.length,
    duplicatePercent: percent(duplicateEntries, standing.length),
    types,
    expected,
  };
}
