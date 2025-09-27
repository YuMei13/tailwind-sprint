import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.windy.com' },
      { protocol: 'https', hostname: 'webcams.windy.com' },
      { protocol: 'https', hostname: 'api.windy.com' },
    ],
  },
};
