import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { applyUnsubscribe, readUnsubscribeLink } from "@/lib/email/unsubscribeApply";

/**
 * The one-step unsubscribe that mail programs offer next to a message ("Unsubscribe" in
 * Gmail, for example). They call this themselves with POST, with no page to click
 * through, so it acts straight away. A person following the link in the email by hand
 * lands on the confirm page instead (GET), so a link-checker that merely visits it can
 * never unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const link = readUnsubscribeLink(new URL(request.url).searchParams.get("token"));
  if (!link) return new NextResponse("This link isn't valid.", { status: 400 });
  const done = await applyUnsubscribe(createAdminClient(), link.memberId, link.kind);
  return new NextResponse(done ? "Unsubscribed." : "Something went wrong.", { status: done ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  return NextResponse.redirect(`${origin}/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ""}`);
}
