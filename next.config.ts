import type { NextConfig } from "next";

/**
 * Origins allowed to iframe-embed this dashboard. Sets the CSP
 * `frame-ancestors` directive, which supersedes `X-Frame-Options`. Add
 * an origin here and redeploy to grant embedding rights.
 *
 *   - `'self'` is implicit; we also include it for clarity.
 *   - `https://insectid.org` covers the apex; `https://*.insectid.org`
 *     covers subdomains (www, docs, …).
 *   - `http://localhost:*` lets local dev pages embed during testing.
 */
const EMBED_ALLOWED_ORIGINS = [
  "'self'",
  "https://insectid.org",
  "https://*.insectid.org",
  "https://indianabugs.com",
  "https://*.indianabugs.com",
  // Allow embedding from any *.vercel.app — covers our own preview URLs
  // and lets other Vercel-hosted properties embed without extra config.
  "https://*.vercel.app",
  "http://localhost:*",
  "http://127.0.0.1:*",
];

const nextConfig: NextConfig = {
  // Hide the floating Next.js dev indicator (the small N badge in the
  // bottom-left corner during `npm run dev`). It never shows in
  // production, but the dashboard reads cleaner without it locally too.
  devIndicators: false,

  // Bundle the data/ and config/ directories into server functions so the
  // API routes can read them on Vercel.
  outputFileTracingIncludes: {
    "/api/views/**": ["./data/**", "./config/**"],
    "/[viewSlug]": ["./data/**", "./config/**"],
    "/": ["./config/**"],
  },

  async headers() {
    const frameAncestors = EMBED_ALLOWED_ORIGINS.join(" ");
    return [
      {
        // Apply to every route. The CSP `frame-ancestors` directive
        // controls who may iframe this site; we deliberately do NOT
        // emit `X-Frame-Options` (CSP supersedes it and is the modern,
        // allow-list-capable form).
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
