import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.windy.com" },
      { protocol: "https", hostname: "webcams.windy.com" },
      { protocol: "https", hostname: "api.windy.com" },
    ],
  },
};

export default nextConfig;
