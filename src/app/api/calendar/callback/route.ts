import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createAppCalendar, exchangeCode, googleConfig, revokeToken } from "@/lib/calendar/google";
import { loadConnection, saveConnection } from "@/lib/calendar/service";
import { STATE_COOKIE, stateMatches } from "@/lib/calendar/state";

/**
 * Where Google sends the member back after they say yes (or no). The return is only
 * accepted for the signed-in member who started it, with the matching anti-forgery
 * value. On success the app makes its own calendar and keeps the (encrypted) credential.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const back = (outcome: string) => {
    const response = NextResponse.redirect(`${origin}/account?calendar=${outcome}`);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/calendar" });
    return response;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const config = googleConfig();
  if (!config) return back("unavailable");

  // Saying no at Google's screen is a decision, not a fault.
  if (searchParams.get("error") === "access_denied") return back("declined");

  const code = searchParams.get("code");
  if (!code || !stateMatches(request.cookies.get(STATE_COOKIE)?.value, searchParams.get("state"))) return back("error");

  try {
    const redirectUri = `${origin}/api/calendar/callback`;
    const tokens = await exchangeCode(config, code, redirectUri);
    const admin = createAdminClient();

    // Connecting again keeps the calendar we already made, rather than adding a second one.
    const previous = await loadConnection(admin, user.id, config.tokenKey);
    let calendarId = previous?.calendarId ?? null;
    if (!calendarId) {
      try {
        calendarId = await createAppCalendar(tokens.accessToken);
      } catch (err) {
        // No calendar means nothing was set up: withdraw what Google was just given rather than hold a credential we cannot use.
        await revokeToken(tokens.refreshToken);
        throw err;
      }
    }
    const { error } = await saveConnection(admin, user.id, tokens.refreshToken, calendarId, config.tokenKey, tokens.scope || undefined);
    if (error) {
      await revokeToken(tokens.refreshToken);
      return back("error");
    }
    return back("connected");
  } catch (err) {
    console.warn("calendar connect failed:", err instanceof Error ? err.message : err);
    return back("error");
  }
}
