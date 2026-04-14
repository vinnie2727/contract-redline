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

/** Full origin of the contract-repo deployment. No trailing slash. */
const repoOrigin = "https://contract-repo.vercel.app";

const nextConfig: NextConfig = {
  basePath,
  async rewrites() {
    const rules: { source: string; destination: string; basePath: false }[] = [];

    if (smudV2Origin) {
      rules.push(
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
      );
    }

    if (repoOrigin) {
      rules.push(
        {
          source: "/SMUD-contract-repo",
          destination: `${repoOrigin}/SMUD-contract-repo`,
          basePath: false,
        },
        {
          source: "/SMUD-contract-repo/:path*",
          destination: `${repoOrigin}/SMUD-contract-repo/:path*`,
          basePath: false,
        },
      );
    }

    return rules;
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
