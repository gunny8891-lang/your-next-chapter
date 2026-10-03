import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runDiscoveryAgent } from "@/lib/discovery/run";
import { searchRegionsThrottled } from "@/lib/discovery/regional";
import { ensureOpenStreetMapPlacesForRegions } from "@/lib/discovery/osmPlaces";
import { enrichDueImages } from "@/lib/imagery/store";
import { createTicketmasterSource, RICHMOND_AREA } from "@/lib/discovery/sources/ticketmaster";
import { memberAreas } from "@/lib/discovery/areas";
import { createClaudeWebSource } from "@/lib/discovery/sources/claudeWeb";

// A regional web search has been observed taking ~4.5 minutes, so one
// invocation only runs one. Regions beyond that are reported as "deferred" and
// picked up by a later run. If this ever needs to cover more than a handful of
// regions a week, add more cron slots rather than raising this.
const MAX_REGIONAL_SEARCHES_PER_RUN = 1;
// The free place layer is quick (about 20 requests a region); this just stops a
// long backlog of new regions turning into one very long run.
const MAX_PLACE_FETCHES_PER_RUN = 2;
// Photographs are looked for a few places a night (two quick requests each, spaced out),
// newest places first, so the catalogue fills in over time without a long run.
const MAX_IMAGE_LOOKUPS_PER_RUN = 12;

// Triggered by Vercel Cron (see vercel.json) once deployed, or manually via
// curl with the same bearer token in the meantime. `?force=1` searches a due-
// or-not region (still capped, still never one that's mid-search).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const admin = createAdminClient();

  // Drives the location-dynamic search from wherever members actually are,
  // rather than a hardcoded region list.
  const { data: profiles } = await admin
    .from("member_profiles")
    .select("location_text, location_lat, location_lng, travel_radius_km");
  const regions = Array.from(
    new Set(
      (profiles ?? [])
        .map((p) => p.location_text?.replace(/^Near /, "").trim())
        // "Somewhere else" is a leftover placeholder from onboarding's old fixed
        // option list, not a real place — searching for it wastes a call.
        .filter((region): region is string => !!region && region !== "Somewhere else")
    )
  );

  // Events come from where members actually live, not one fixed town (Richmond is
  // only the fallback when nobody has a resolved location). The key is checked
  // once here so a missing one is reported once, not once per area.
  const hasTicketmasterKey = Boolean(process.env.TICKETMASTER_API_KEY);
  const areas = memberAreas(profiles ?? []);
  const ticketmasterSources = hasTicketmasterKey
    ? (areas.length ? areas : [RICHMOND_AREA]).map((area) => createTicketmasterSource(area))
    : [];
  const ticketmasterSkipped = hasTicketmasterKey ? null : "TICKETMASTER_API_KEY is not set — Ticketmaster skipped";

  // The cheap sources run every night as before; the expensive regional web
  // search goes through the throttle.
  const results = await runDiscoveryAgent(admin, [...ticketmasterSources, createClaudeWebSource()]);

  let regional = null;
  let regionalError: string | null = null;
  // The free place layer runs alongside the paid search rather than after it,
  // since the search alone can take most of the function's time limit.
  const [regionalSettled, places, images] = await Promise.all([
    searchRegionsThrottled(admin, regions, { maxSearches: MAX_REGIONAL_SEARCHES_PER_RUN, force }).then(
      (summary) => ({ summary, error: null as string | null }),
      // Fails closed — if the throttle can't be consulted, nothing is searched.
      (err: unknown) => ({ summary: null, error: err instanceof Error ? err.message : "Regional search failed" })
    ),
    ensureOpenStreetMapPlacesForRegions(admin, regions, { maxFetches: MAX_PLACE_FETCHES_PER_RUN }),
    // A bonus: it never fails the run.
    enrichDueImages(admin, MAX_IMAGE_LOOKUPS_PER_RUN, { budgetMs: 30_000 }).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : "Image lookups failed",
    })),
  ]);
  regional = regionalSettled.summary;
  regionalError = regionalSettled.error;

  return NextResponse.json({ results, regional, regionalError, places, images, ticketmasterSkipped });
}
