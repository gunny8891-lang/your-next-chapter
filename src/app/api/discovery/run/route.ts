import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { runDiscoveryAgent } from "@/lib/discovery/run";
import { createTicketmasterSource } from "@/lib/discovery/sources/ticketmaster";
import { createClaudeWebSource } from "@/lib/discovery/sources/claudeWeb";

// Triggered by Vercel Cron (see vercel.json) once deployed, or manually via
// curl with the same bearer token in the meantime.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const results = await runDiscoveryAgent(admin, [createTicketmasterSource(), createClaudeWebSource()]);
  return NextResponse.json({ results });
}
