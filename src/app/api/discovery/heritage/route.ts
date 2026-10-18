import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cronAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { ensureHeritageForRegions } from "@/lib/discovery/osmPlaces";
import { mergeDuplicateVenues } from "@/lib/discovery/duplicates";

// A region's heritage, museums, historic houses, gardens and local cultural venues (see lib/discovery/sources/heritage.ts) take a
// couple of minutes to find across a whole county, so this is a job of its own, with the whole of its own time limit, one region a
// run. Each region is done once and looked at again twice a year. Triggered by Vercel Cron (see vercel.json), or by hand with the
// same bearer token.
export const maxDuration = 300;

const MAX_HERITAGE_FETCHES_PER_RUN = 1;

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
    const heritage = await ensureHeritageForRegions(admin, regions, { maxFetches: MAX_HERITAGE_FETCHES_PER_RUN });
    // The same place found by two layers is one place.
    const duplicates = await mergeDuplicateVenues(admin).catch((err: unknown) => ({ merged: 0, error: err instanceof Error ? err.message : "Merge failed" }));
    return NextResponse.json({ heritage, duplicates });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Heritage failed" }, { status: 500 });
  }
}
