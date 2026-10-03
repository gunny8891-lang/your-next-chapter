import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Photographs of places come from Wikimedia Commons (see src/lib/imagery) and
    // nowhere else, so that is the only remote host the image optimiser will fetch.
    remotePatterns: [{ protocol: "https", hostname: "upload.wikimedia.org", pathname: "/wikipedia/commons/**" }],
  },
};

export default nextConfig;
