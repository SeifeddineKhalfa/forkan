import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// In production Caddy routes /api to the backend; in dev Next proxies it so the
// browser only ever talks to one origin (cookies, no CORS).
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
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
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      // Public receipt links shared on WhatsApp (no login).
      { source: "/r/:token", destination: `${BACKEND_URL}/api/r/:token` },
    ];
  },
};

export default withNextIntl(nextConfig);
