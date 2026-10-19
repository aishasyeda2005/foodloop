import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: '/lots', destination: '/api/lots' },
      { source: '/offers/:id/accept', destination: '/api/offers/:id/accept' },
      { source: '/pickups/:id/handover', destination: '/api/pickups/:id/handover' },
    ];
  },
};

export default nextConfig;
