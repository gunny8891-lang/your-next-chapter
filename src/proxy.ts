import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Paths the sign-in check skips: static files, and the public "who we are" files a browser,
// a phone or a search engine fetches without any session (the icons, the home-screen
// manifest, the share image, robots and the sitemap). Without these they would all be sent
// to /login. Next needs this to be a plain literal, so it cannot be built from a list;
// proxy.test.ts holds the list of what must stay reachable.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|pwa-icon|opengraph-image|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
