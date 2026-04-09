import type { NextConfig } from "next";

/**
 * Public URL path for this app (keep in sync with `publicBasePath` in app/page.tsx).
 * Hardcoded so production always matches https://contract.veritasic.com/SMUD-contract-analyzer
 * even if Vercel env vars are missing at build time.
 */
const basePath = "/SMUD-contract-analyzer";

/** Full origin of the v2 deployment (e.g. https://your-v2-project.vercel.app). No trailing slash. */
const smudV2Origin =
  process.env.SMUD_V2_ORIGIN?.trim().replace(/\/+$/, "") || "";

const nextConfig: NextConfig = {
  basePath,
  /**
   * Same-domain v2 URL: contract.veritasic.com/SMUD-contract-analyzer-v2
   * Requires a separate Vercel project for `contract-redline-v2` and SMUD_V2_ORIGIN
   * set on *this* (v1) project to that deployment’s origin.
   */
  async rewrites() {
    if (!smudV2Origin) return [];
    return [
      {
        source: "/SMUD-contract-analyzer-v2",
        destination: `${smudV2Origin}/SMUD-contract-analyzer-v2`,
        basePath: false,
      },
      {
        source: "/SMUD-contract-analyzer-v2/:path*",
        destination: `${smudV2Origin}/SMUD-contract-analyzer-v2/:path*`,
        basePath: false,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: `${basePath}/`,
        permanent: false,
        basePath: false,
      },
    ];
  },
  serverExternalPackages: [
    "@anthropic-ai/sdk",
    "mammoth",
    "word-extractor",
    "pdf-parse",
    "jsonrepair",
  ],
};

export default nextConfig;
