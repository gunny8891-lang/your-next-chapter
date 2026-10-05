import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { buildAuthUrl, googleConfig } from "@/lib/calendar/google";
import { STATE_COOKIE, STATE_MAX_AGE_SECONDS, newState } from "@/lib/calendar/state";

/** Sends a signed-in member to Google to say yes to "add outings to your calendar". */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const config = googleConfig();
  if (!config) return NextResponse.redirect(`${origin}/account?calendar=unavailable`);

  const state = newState();
  const response = NextResponse.redirect(buildAuthUrl(config, `${origin}/api/calendar/callback`, state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/calendar",
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  return response;
}
