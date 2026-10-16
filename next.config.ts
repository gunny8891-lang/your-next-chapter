import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Going back to a screen seen in the last half minute shows it at once instead of fetching it again. Anything that
    // changes what a screen shows (a server action that calls revalidatePath) clears this, so it is never stale after a change.
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    // Photographs of places come from Wikimedia Commons (see src/lib/imagery) and
    // nowhere else, so that is the only remote host the image optimiser will fetch.
    remotePatterns: [{ protocol: "https", hostname: "upload.wikimedia.org", pathname: "/wikipedia/commons/**" }],
  },
};

export default nextConfig;
