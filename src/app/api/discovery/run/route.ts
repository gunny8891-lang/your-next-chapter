import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runDiscoveryAgent } from "@/lib/discovery/run";
import { createTicketmasterSource } from "@/lib/discovery/sources/ticketmaster";
import { createClaudeWebSource } from "@/lib/discovery/sources/claudeWeb";
import { createClaudeWebSearchSource } from "@/lib/discovery/sources/claudeWebSearch";

// Triggered by Vercel Cron (see vercel.json) once deployed, or manually via
// curl with the same bearer token in the meantime.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();

  // Drives the location-dynamic source from wherever members actually are,
  // rather than a hardcoded region list.
  const { data: profiles } = await admin.from("member_profiles").select("location_text");
  const regions = Array.from(
    new Set(
      (profiles ?? [])
        .map((p) => p.location_text?.replace(/^Near /, "").trim())
        // "Somewhere else" is a leftover placeholder from onboarding's old fixed
        // option list, not a real place — searching for it wastes a call.
        .filter((region): region is string => !!region && region !== "Somewhere else")
    )
  );

  const sources = [createTicketmasterSource(), createClaudeWebSource()];
  if (regions.length > 0) sources.push(createClaudeWebSearchSource(regions));

  const results = await runDiscoveryAgent(admin, sources);
  return NextResponse.json({ results });
}
