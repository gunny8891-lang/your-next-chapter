import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.larkhour.com";

/**
 * Search engines may list the front page and the two legal pages. Everything else is a
 * member's own screens or behind sign-in, so there is nothing for them to read there.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/$", "/privacy", "/terms"],
        disallow: ["/api/", "/admin/", "/account", "/today", "/week", "/explore", "/chapter", "/chat", "/people", "/onboarding", "/unsubscribe", "/auth/"],
      },
    ],
    sitemap: `${SITE.replace(/\/$/, "")}/sitemap.xml`,
  };
}
