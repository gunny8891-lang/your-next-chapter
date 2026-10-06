import type { MetadataRoute } from "next";
import { MARK_COLORS } from "@/lib/brand/mark";

/**
 * Lets a phone add Lark Hour to its home screen so it opens like an app: no browser bars,
 * straight to today's ideas. The colours are the app's own (cream page, forest green).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lark Hour",
    short_name: "Lark Hour",
    description: "You have time. Here's something good to do with it.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en-GB",
    background_color: "#F5F2EB",
    theme_color: MARK_COLORS.ground,
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
