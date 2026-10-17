import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cronAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { ensureDayTripsForRegions } from "@/lib/discovery/osmPlaces";

// A region's well-known places for a day out (see lib/discovery/sources/dayTrips.ts) take a couple of minutes to find, so this is a
// job of its own, with the whole of its own time limit, one region a run. They hardly ever change, so each region is done once.
// Triggered by Vercel Cron (see vercel.json), or by hand with the same bearer token.
export const maxDuration = 300;

const MAX_DAY_TRIP_FETCHES_PER_RUN = 1;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin.from("member_profiles").select("location_text, location_lat, location_lng");
  // Only a place that was found on a map: text that could not be found may not be a place at all.
  const regions = Array.from(
    new Set(
      (profiles ?? [])
        .filter((p) => p.location_lat != null && p.location_lng != null)
        .map((p) => p.location_text?.replace(/^Near /, "").trim())
        .filter((region): region is string => !!region && region !== "Somewhere else")
    )
  );

  try {
    const dayTrips = await ensureDayTripsForRegions(admin, regions, { maxFetches: MAX_DAY_TRIP_FETCHES_PER_RUN });
    return NextResponse.json({ dayTrips });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Day trips failed" }, { status: 500 });
  }
}
