import { describe, expect, it } from "vitest";
import { buildCoverageReport, TYPE_CHECKS, type ReportRow } from "@/lib/discovery/coverageReport";
import { validationRegion, VALIDATION_REGIONS } from "@/lib/discovery/validationRegions";

let n = 0;
const row = (overrides: Partial<ReportRow>): ReportRow => ({
  id: `r-${++n}`,
  title: `Place ${n}`,
  category: "Explore",
  address: "Stevenage",
  location_lat: 51.9017,
  location_lng: -0.2027,
  date_time: null,
  expires_at: null,
  status: "active",
  tags: [],
  booking_url: "https://www.openstreetmap.org/node/1",
  recurrence_rule: null,
  description: null,
  admin_notes: "Place data from OpenStreetMap (© OpenStreetMap contributors, ODbL)",
  source: "discovery_agent",
  created_at: "2026-10-01T00:00:00Z",
  price_type: "unknown",
  price_estimate: null,
  dog_access: "unknown",
  accessibility_notes: null,
  ...overrides,
});

const NOW = new Date("2026-10-09T12:00:00Z");
const CENTRE = { lat: 51.9017, lng: -0.2027 };
const report = (rows: ReportRow[], expected?: { name: string; aliases?: string[] }[]) => buildCoverageReport(rows, { now: NOW, centre: CENTRE, radiusKm: 12, expected });

describe("the counts", () => {
  const rows = [
    row({ category: "Move", tags: ["swimming"], price_type: "free", price_estimate: 0, recurrence_rule: "Mo-Su 06:00-21:00", booking_url: "https://venue.example/" }),
    row({ category: "Joy", tags: ["food-venue", "cafe"], dog_access: "allowed" }),
    row({ category: "Connect", tags: ["community", "social"], accessibility_notes: "Step-free entrance", price_type: "entry", price_estimate: 5 }),
    row({ category: "Learn", title: "Make It! Knitting", tags: ["knitting"], date_time: "2026-10-20T10:00:00Z", booking_url: "https://council.example/knit", admin_notes: "Dates and times from the council's own events page" }),
    row({ category: "Learn", title: "Old session", date_time: "2026-09-01T10:00:00Z", admin_notes: null }),
    row({ status: "removed", title: "Gone" }),
    row({ status: "needs_review", title: "Waiting" }),
  ];
  const r = report(rows);

  it("counts only what is active", () => {
    expect(r.total).toBe(5);
  });

  it("splits standing places from dated sessions, and upcoming from over", () => {
    expect(r.standingVenues).toBe(3);
    expect(r.datedSessions).toBe(2);
    expect(r.upcomingDated).toBe(1);
    expect(r.expiredStillActive).toBe(1);
  });

  it("counts by category, free, cost not known, and what has hours or a schedule", () => {
    expect(r.byCategory).toEqual({ Move: 1, Joy: 1, Connect: 1, Learn: 2 });
    expect(r.free).toBe(1);
    expect(r.costUnknown).toBe(3);
    expect(r.withSchedule).toBe(1);
  });

  it("counts who it suits and what is known about dogs and access", () => {
    expect(r.suitedToOlderAdults).toBe(2); // swimming, knitting
    expect(r.social).toBe(1);
    expect(r.dogAllowed).toBe(1);
    expect(r.dogUnknown).toBe(4);
    expect(r.withAccessibilityNotes).toBe(1);
  });
});

describe("how far to trust it", () => {
  it("is the share with a link to the organiser's own page rather than only a map listing", () => {
    const r = report([row({ booking_url: "https://venue.example/" }), row({}), row({}), row({ booking_url: "https://other.example/" })]);
    expect(r.officialLinkPercent).toBe(50);
  });

  it("is the share of dated sessions whose time was read from the organiser's page", () => {
    const rows = [
      row({ date_time: "2026-10-20T10:00:00Z", booking_url: "https://c.example/a", admin_notes: "Dates and times from the council's own events page" }),
      row({ date_time: "2026-10-21T10:00:00Z", booking_url: "https://c.example/b", admin_notes: "Auto-discovered by Claude web search" }),
    ];
    expect(report(rows).datedFromOrganiserPercent).toBe(50);
  });

  it("counts entries outside the radius, and those with no position", () => {
    const r = report([row({}), row({ location_lat: 52.5 }), row({ location_lat: null, location_lng: null })]);
    expect(r.outsideRadius).toBe(1);
    expect(r.coordinatesPercent).toBe(67);
  });

  it("finds the same place twice, and counts it as a share of standing places", () => {
    const a = row({ title: "Fairlands Valley Park", location_lat: 51.8992, location_lng: -0.1749 });
    const b = row({ title: "Fairlands Valley Park", location_lat: 51.9015, location_lng: -0.1795 });
    const r = report([a, b, row({}), row({})]);
    expect(r.duplicateGroups).toBe(1);
    expect(r.duplicatePercent).toBe(25);
  });

  it("has nothing to report, rather than a misleading 0%, when there is nothing stored", () => {
    const r = report([]);
    expect(r.total).toBe(0);
    expect(r.officialLinkPercent).toBeNull();
    expect(r.duplicatePercent).toBeNull();
    expect(r.datedFromOrganiserPercent).toBeNull();
  });
});

describe("the kinds of thing a person might look for", () => {
  const found = (title: string, tags: string[] = []) => report([row({ title, tags })]).types.filter((t) => t.count > 0).map((t) => t.label);

  it("finds walking groups, coffee mornings, social clubs, volunteering, creative workshops and history by what they say they are", () => {
    expect(found("Walking for Health: Fairlands")).toContain("Walking groups and guided walks");
    expect(found("Age Concern Stevenage Coffee Morning")).toContain("Coffee mornings and lunch clubs");
    expect(found("Stevenage Men's Shed")).toContain("Social clubs and meetups");
    expect(found("Befriending Volunteer")).toContain("Volunteering");
    expect(found("Make It! Sewing, Knitting and Crochet")).toContain("Creative workshops");
    expect(found("Stevenage Museum")).toContain("Local history");
  });

  it("finds indoor entertainment by name, and not a word inside a longer one", () => {
    expect(found("Hollywood Bowl and bowling alley")).toContain("Indoor entertainment and family venues");
    expect(found("Orbital Trampoline Park")).toContain("Indoor entertainment and family venues");
    expect(found("Dartsford Parish Hall")).not.toContain("Indoor entertainment and family venues");
  });

  it("does not find a walk in a café's description, only in what a thing calls itself", () => {
    const cafe = row({ title: "Oakwood Cafe", description: "A short walking distance from the park, with a walking group on Tuesdays." });
    expect(report([cafe]).types.every((t) => t.count === 0)).toBe(true);
  });

  it("shows distinct examples, not eight sessions of one", () => {
    const sessions = Array.from({ length: 8 }, (_, i) => row({ title: "Pop up Play at Stevenage Museum", date_time: `2026-10-${20 + i}T10:00:00Z` }));
    const museum = report(sessions).types.find((t) => t.label === "Local history")!;
    expect(museum.count).toBe(8);
    expect(museum.examples).toEqual(["Pop up Play at Stevenage Museum"]);
  });

  it("asks the same of every town: the list names no place", () => {
    expect(TYPE_CHECKS.length).toBeGreaterThanOrEqual(8);
    for (const check of TYPE_CHECKS) expect(check.pattern.source.toLowerCase()).not.toMatch(/stevenage|barnet|richmond/);
  });
});

describe("venues known to be there", () => {
  const expected = [{ name: "Hollywood Bowl" }, { name: "Mulligans", aliases: ["Mr Mulligan's Lost World Golf"] }, { name: "Gravity Active" }];

  it("says which are in the catalogue, by name or an alias, ignoring punctuation and capitals", () => {
    const r = report([row({ title: "HOLLYWOOD BOWL" }), row({ title: "Mr Mulligan's Lost World Golf" })], expected);
    const byName = Object.fromEntries(r.expected.map((e) => [e.name, e.found.length]));
    expect(byName).toEqual({ "Hollywood Bowl": 1, Mulligans: 1, "Gravity Active": 0 });
  });

  it("does not count an entry that was removed as being there", () => {
    const r = report([row({ title: "Hollywood Bowl", status: "removed" })], expected);
    const bowl = r.expected.find((e) => e.name === "Hollywood Bowl")!;
    expect(bowl.found).toEqual([{ title: "Hollywood Bowl", status: "removed" }]);
    expect(bowl.found.some((f) => f.status === "active")).toBe(false);
  });
});

describe("the validation list", () => {
  it("names the fourteen venues the audit was asked to check, and is only a yardstick", () => {
    const stevenage = validationRegion("stevenage")!;
    expect(stevenage.expectedVenues).toHaveLength(14);
    expect(VALIDATION_REGIONS.map((r) => r.label)).toContain("Stevenage");
    expect(validationRegion("Nowhere")).toBeNull();
  });

  it("is not read by the discovery engine, so nothing in it can be recommended", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const readers = walk(join(process.cwd(), "src")).filter((f) => /\.(ts|tsx)$/.test(f) && readFileSync(f, "utf8").includes("validationRegions"));
    const names = readers.map((f) => f.replace(process.cwd(), "").replace(/\\/g, "/"));
    expect(names.every((f) => /coverageReport|validationRegions|admin\/coverage/.test(f))).toBe(true);
  });
});
