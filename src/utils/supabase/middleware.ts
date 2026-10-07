import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { LEGAL_VERSION } from "@/lib/legal/details";
import { AGREE_PATH, AGREEMENT_COOKIE_OPTIONS, LEGAL_COOKIE, agreementCookieValue, hasAgreedToCurrent, pathNeedsAgreement } from "@/lib/legal/gate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // API routes authenticate themselves (e.g. bearer tokens for cron jobs) —
  // they're never gated by the member session cookie.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Refreshes the session cookie if needed — required before reading user
  // state in Server Components, which can't set cookies themselves.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password");
  // The privacy notice and terms must be readable before anyone has an account.
  // The unsubscribe page too: someone stopping an email may have no password to hand.
  const isLegalRoute = ["/privacy", "/terms", "/unsubscribe"].includes(request.nextUrl.pathname);
  const isPublicRoute = request.nextUrl.pathname === "/" || isAuthRoute || isLegalRoute;

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // A signed-in member who has not agreed to the current wording of the terms and privacy
  // notice (a new member whose agreement did not save, one who signed up before agreements
  // were recorded, or anyone after the wording changed) is asked to, once, before anything else.
  if (user && pathNeedsAgreement(request.nextUrl.pathname)) {
    const remembered = request.cookies.get(LEGAL_COOKIE)?.value === agreementCookieValue(user.id);
    if (!remembered) {
      const { data, error } = await supabase.from("legal_acceptances").select("document").eq("member_id", user.id).eq("version", LEGAL_VERSION);
      if (error) {
        // If the record cannot be read, let them in rather than lock everyone out over our own fault.
        console.warn("could not check the terms agreement (letting the member through):", error.message);
      } else if (!hasAgreedToCurrent(data ?? [])) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = AGREE_PATH;
        redirectUrl.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
        const redirect = NextResponse.redirect(redirectUrl);
        // Keep any refreshed sign-in cookies that were set on the way.
        supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        return redirect;
      } else {
        supabaseResponse.cookies.set(LEGAL_COOKIE, agreementCookieValue(user.id), AGREEMENT_COOKIE_OPTIONS);
      }
    }
  }

  return supabaseResponse;
}
