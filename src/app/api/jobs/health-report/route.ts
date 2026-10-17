import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cronAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { buildHealthReport, sendHealthReport } from "@/lib/admin/healthReport";

// The week in numbers, emailed to whoever runs the app (see lib/admin/healthReport.ts). Triggered by Vercel Cron on Monday
// morning (see vercel.json), or by hand with the same bearer token; `?dry=1` returns the numbers without sending anything.
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    if (new URL(request.url).searchParams.get("dry") === "1") {
      return NextResponse.json({ report: await buildHealthReport(createAdminClient()), sentTo: [] });
    }
    const { report, sentTo } = await sendHealthReport();
    return NextResponse.json({ report, sentTo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Health report failed" }, { status: 500 });
  }
}
