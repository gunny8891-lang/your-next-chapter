import Link from "next/link";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";
import { buildCoverageReport, type ReportRow } from "@/lib/discovery/coverageReport";
import { validationRegion, VALIDATION_REGIONS } from "@/lib/discovery/validationRegions";
import { coverageBox } from "@/lib/discovery/osmPlaces";
import { geocodeLocation } from "@/lib/geo/geocode";
import styles from "@/app/admin/coverage/Coverage.module.css";

export const metadata = { title: "Coverage" };

const DEFAULT_RADIUS_KM = 12;
const MAX_RADIUS_KM = 30;
const MAX_ROWS = 4000;

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export default async function AdminCoveragePage({ searchParams }: { searchParams: Promise<{ region?: string; radius?: string }> }) {
  const { region: regionParam, radius: radiusParam } = await searchParams;
  const supabase = await requireAdmin();

  const label = (regionParam ?? VALIDATION_REGIONS[0]?.label ?? "").trim().slice(0, 80);
  const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(2, Number(radiusParam) || DEFAULT_RADIUS_KM));
  const known = validationRegion(label);
  const centre = known ? { lat: known.lat, lng: known.lng } : label ? await geocodeLocation(label) : null;

  const links = (
    <p className={styles.regions}>
      {VALIDATION_REGIONS.map((r) => (
        <Link key={r.label} href={`/admin/coverage?region=${encodeURIComponent(r.label)}`}>
          {r.label}
        </Link>
      ))}
    </p>
  );

  if (!centre) {
    return (
      <Page>
        <PageHeader title="Coverage" lead="How well the catalogue covers a place." />
        {links}
        <p>That place could not be located. Add <code>?region=Town name</code> to the address.</p>
      </Page>
    );
  }

  const box = coverageBox(centre, radiusKm);
  const { data } = await supabase
    .from("activities")
    .select(
      "id, title, category, address, location_lat, location_lng, date_time, expires_at, status, tags, booking_url, recurrence_rule, description, admin_notes, source, created_at, price_type, price_estimate, dog_access, accessibility_notes"
    )
    .gte("location_lat", box.latMin)
    .lte("location_lat", box.latMax)
    .gte("location_lng", box.lngMin)
    .lte("location_lng", box.lngMax)
    .limit(MAX_ROWS);

  const report = buildCoverageReport((data ?? []) as ReportRow[], { now: new Date(), centre, radiusKm, expected: known?.expectedVenues });
  const missing = report.expected.filter((e) => !e.found.some((f) => f.status === "active"));

  return (
    <Page>
      <PageHeader title={`Coverage: ${label}`} lead={`Active entries within ${radiusKm} km, measured against what is really there.`} />
      {links}

      <section aria-labelledby="counts" className={styles.section}>
        <SectionTitle id="counts">What is stored</SectionTitle>
        <Card>
          <dl className={styles.grid}>
            <dt>Active entries</dt><dd>{report.total}</dd>
            <dt>Standing places</dt><dd>{report.standingVenues}</dd>
            <dt>Dated sessions</dt><dd>{report.datedSessions} ({report.upcomingDated} upcoming)</dd>
            <dt>With opening hours or a schedule</dt><dd>{report.withSchedule}</dd>
            <dt>Free</dt><dd>{report.free}</dd>
            <dt>Price not known</dt><dd>{report.costUnknown}</dd>
            <dt>Suited to older adults</dt><dd>{report.suitedToOlderAdults}</dd>
            <dt>Social or community</dt><dd>{report.social}</dd>
            <dt>Dogs allowed / not known</dt><dd>{report.dogAllowed} / {report.dogUnknown}</dd>
            <dt>Accessibility notes / wheelchair tag</dt><dd>{report.withAccessibilityNotes} / {report.withWheelchairTag}</dd>
          </dl>
          <p className={styles.categories}>
            {Object.entries(report.byCategory).map(([name, n]) => `${name} ${n}`).join(" · ")}
          </p>
        </Card>
      </section>

      <section aria-labelledby="quality" className={styles.section}>
        <SectionTitle id="quality">How far to trust it</SectionTitle>
        <Card>
          <dl className={styles.grid}>
            <dt>With a link to the organiser&apos;s own page</dt><dd>{pct(report.officialLinkPercent)}</dd>
            <dt>Dated sessions read from the organiser&apos;s page</dt><dd>{pct(report.datedFromOrganiserPercent)}</dd>
            <dt>With a position on the map</dt><dd>{pct(report.coordinatesPercent)}</dd>
            <dt>Outside the {radiusKm} km radius</dt><dd>{report.outsideRadius}</dd>
            <dt>Over but still active</dt><dd>{report.expiredStillActive}</dd>
            <dt>Same place twice</dt><dd>{report.duplicateGroups} ({pct(report.duplicatePercent)} of standing places)</dd>
          </dl>
        </Card>
      </section>

      <section aria-labelledby="types" className={styles.section}>
        <SectionTitle id="types">Kinds of thing a person might look for</SectionTitle>
        <Card>
          <ul className={styles.list}>
            {report.types.map((t) => (
              <li key={t.label}>
                <strong>{t.label}</strong>: {t.count}
                {t.count > 0 ? <span className={styles.examples}> {t.examples.join(", ")}</span> : <span className={styles.none}> none found</span>}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {report.expected.length > 0 && (
        <section aria-labelledby="named" className={styles.section}>
          <SectionTitle id="named">Venues known to be there</SectionTitle>
          <Card>
            <p>
              {report.expected.length - missing.length} of {report.expected.length} found.
            </p>
            <ul className={styles.list}>
              {report.expected.map((e) => {
                const active = e.found.filter((f) => f.status === "active");
                return (
                  <li key={e.name}>
                    <strong>{e.name}</strong>: {active.length > 0 ? active.map((f) => f.title).join("; ") : <span className={styles.none}>not in the catalogue</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}
    </Page>
  );
}
