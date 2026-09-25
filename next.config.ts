import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module (Skia canvas for PNG text overlays) — must not be bundled
  serverExternalPackages: ["@napi-rs/canvas"],
  images: {
    // Competitor ad/content creative comes straight from these CDNs (Meta,
    // Instagram, TikTok, and Apify's own image proxy) — confirmed against
    // real stored URLs, not guessed. Without this, next/image refuses to
    // optimize them and every thumbnail grid falls back to full-resolution,
    // unresized fetches.
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.tiktokcdn-us.com" },
      { protocol: "https", hostname: "**.tiktokcdn-eu.com" },
      { protocol: "https", hostname: "**.tiktokcdn.com" },
      { protocol: "https", hostname: "api.apify.com" },
    ],
  },
  outputFileTracingIncludes: {
    "/api/settings/agent-kit/*": ["./agent-kit/README.md", "./agent-kit/mcp/*.json", "./agent-kit/mcp/*.mjs", "./agent-kit/mcp/test/*.mjs", "./agent-kit/verticalflash-video/**/*.md"],
  },
};

export default nextConfig;
