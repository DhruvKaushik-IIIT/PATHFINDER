import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files read from disk at runtime (fs) must be traced into the serverless bundles on Vercel.
  outputFileTracingIncludes: {
    "/api/risk/route": ["./data/seed/weather/replay.json"],
    "/api/risk/area": ["./data/seed/weather/replay.json"],
  },
};

export default nextConfig;
