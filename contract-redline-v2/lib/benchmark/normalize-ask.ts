import type { ClauseFamily, NormalizedUnit } from "@/lib/types/repository";

/** Best-effort numeric extraction for benchmark positioning. */
export function normalizeAskForFamily(
  text: string,
  family: ClauseFamily
): { value: number; unit: NormalizedUnit } | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;

  const net = t.match(/net\s*(\d+)/i);
  if (net && family === "Payment Terms") {
    return { value: Number(net[1]), unit: "days" };
  }

  const mo = t.match(/(\d+)\s*(months?|mo\b)/i);
  if (mo && (family === "Warranty Duration" || family === "Warranty Start Trigger")) {
    return { value: Number(mo[1]), unit: "months" };
  }

  const pct = t.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct && (family === "Liquidated Damages" || family === "Limitation of Liability")) {
    return { value: Number(pct[1]), unit: "%" };
  }

  const mult = t.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (mult && family === "Limitation of Liability") {
    return { value: Number(mult[1]), unit: "multiplier" };
  }

  let hash = 0;
  for (let i = 0; i < t.length; i++) {
    hash = (hash * 31 + t.charCodeAt(i)) >>> 0;
  }
  const score = 40 + (hash % 61);
  return { value: score, unit: "score" };
}
