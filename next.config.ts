import type { NextConfig } from "next";

// When building the bundled native app (CAPACITOR_BUILD=1) we emit a fully static
// front-end and leave images unoptimized — there is no Next image server inside
// the app bundle. On Vercel/web this stays a normal server build.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild ? { output: "export" as const } : {}),
  images: {
    unoptimized: isCapacitorBuild,
    remotePatterns: [
      { protocol: "https", hostname: "**.windy.com" },
      { protocol: "https", hostname: "webcams.windy.com" },
      { protocol: "https", hostname: "api.windy.com" },
    ],
  },
};

export default nextConfig;
