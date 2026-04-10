import type { NextConfig } from "next";

/**
 * v2 deployment — isolated from production `/SMUD-contract-analyzer`.
 * Keep in sync with `publicBasePath` in app/page.tsx.
 */
const basePath = "/SMUD-contract-analyzer-v2";

const nextConfig: NextConfig = {
  basePath,
  serverExternalPackages: [
    "@anthropic-ai/sdk",
    "mammoth",
    "word-extractor",
    "pdf-parse",
    "jsonrepair",
  ],
};

export default nextConfig;
