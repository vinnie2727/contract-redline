import type { NextConfig } from "next";

/** Set in Vercel (and optionally .env.local) to serve the app under a subpath, e.g. /SMUD-contract-redline-analyzer */
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "").trim() || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  serverExternalPackages: [
    "mammoth",
    "word-extractor",
    "pdf-parse",
    "jsonrepair",
  ],
};

export default nextConfig;
