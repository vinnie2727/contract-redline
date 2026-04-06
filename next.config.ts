import type { NextConfig } from "next";

/**
 * Public URL path for this app (keep in sync with `publicBasePath` in app/page.tsx).
 * Hardcoded so production always matches https://contract.veritasic.com/SMUD-contract-analyzer
 * even if Vercel env vars are missing at build time.
 */
const basePath = "/SMUD-contract-analyzer";

const nextConfig: NextConfig = {
  basePath,
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
    "mammoth",
    "word-extractor",
    "pdf-parse",
    "jsonrepair",
  ],
};

export default nextConfig;
