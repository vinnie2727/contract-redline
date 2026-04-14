import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  console.error(`\n[deploy-guard] ${message}\n`);
  process.exit(1);
}

const vercelJsonPath = resolve(process.cwd(), "vercel.json");
let vercelConfig;

try {
  vercelConfig = JSON.parse(readFileSync(vercelJsonPath, "utf-8"));
} catch (error) {
  fail(`Unable to read/parse vercel.json: ${error instanceof Error ? error.message : String(error)}`);
}

const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];

const required = [
  {
    source: "/SMUD-contract-repo",
    destination: "https://contract-repo.vercel.app/SMUD-contract-repo",
  },
  {
    source: "/SMUD-contract-repo/:path*",
    destination: "https://contract-repo.vercel.app/SMUD-contract-repo/:path*",
  },
];

for (const entry of required) {
  const found = rewrites.some(
    (rewrite) =>
      rewrite &&
      rewrite.source === entry.source &&
      rewrite.destination === entry.destination,
  );
  if (!found) {
    fail(
      `Missing required rewrite:\n  source: ${entry.source}\n  destination: ${entry.destination}\n\n` +
        "This guard prevents breaking contract.veritasic.com/SMUD-contract-repo routing.",
    );
  }
}

console.log("[deploy-guard] Routing checks passed.");
