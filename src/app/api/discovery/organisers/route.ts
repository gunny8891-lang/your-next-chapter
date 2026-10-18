import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cronAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { refreshOrganisers } from "@/lib/discovery/organisers";
import { mergeDuplicateVenues } from "@/lib/discovery/duplicates";
import { searchAllowed } from "@/lib/ai/limits";

// Rereads the pages of the organisers members have shown an interest in, for new events (see lib/discovery/organisers.ts).
// A separate job from the nightly search, so each has the whole of its own time limit: the search alone can take most of it.
// Triggered by Vercel Cron (see vercel.json), or by hand with the same bearer token; `?force=1` rereads a due-or-not organiser.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const admin = createAdminClient();

  // The same system-wide daily budget that holds every other search holds this one.
  const budget = await searchAllowed(admin, null);
  if (!budget.allowed) return NextResponse.json({ skipped: "search budget used up for today", budget });

  try {
    const { organisers, summary } = await refreshOrganisers(admin, { force, allowed: async () => (await searchAllowed(admin, null)).allowed });
    // What was just added may be the same event as one already held, from another page.
    const duplicates = await mergeDuplicateVenues(admin).catch((err: unknown) => ({ merged: 0, error: err instanceof Error ? err.message : "Merge failed" }));
    return NextResponse.json({ organisers: organisers.map((o) => ({ host: o.host, engaged: o.engaged, upcoming: o.upcoming, score: o.score })), summary, duplicates });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Organiser refresh failed" }, { status: 500 });
  }
}
