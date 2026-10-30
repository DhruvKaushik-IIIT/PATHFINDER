import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files read from disk at runtime (fs) must be traced into the serverless bundles on Vercel.
  outputFileTracingIncludes: {
    "/api/risk/route": ["./data/seed/weather/replay.json"],
    "/api/risk/area": ["./data/seed/weather/replay.json"],
    // Bundled Inter for SVG text on annotated photos (lib/images/fonts.ts).
    "/api/**/*": ["./fonts/**/*"],
  },
  // Static assets that rarely change: let browsers + the CDN keep them.
  async headers() {
    const long = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    return [
      { source: "/geo/:path*", headers: long },
      { source: "/icons/:path*", headers: long },
      { source: "/splash/:path*", headers: long },
      { source: "/drive/:path*", headers: long },
      // The service worker must always be re-checked so updates reach installed apps.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
