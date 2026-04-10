import type {
  AcceptabilityBand,
  BenchmarkResult,
  ClauseFamily,
  ClauseRecord,
  Contract,
  ContractType,
} from "@/lib/types/repository";
import { BAND_CONFIG } from "@/lib/types/repository";
import { mapIssueTextToClauseFamily } from "@/lib/benchmark/map-family";
import { normalizeAskForFamily } from "@/lib/benchmark/normalize-ask";

export interface BenchmarkIssueInput {
  issueId: string;
  primaryCategory: string;
  clauseTitle: string;
  problem: string;
  /** Supplier’s current redline / ask */
  supplierAsk: string;
}

function assignBand(normalizedPosition: number): AcceptabilityBand {
  const p = normalizedPosition;
  if (p >= 0.37) return 1;
  if (p >= 0.25) return 2;
  if (p >= 0.15) return 3;
  if (p >= 0.05) return 4;
  return 5;
}

function buildVerdict(
  band: AcceptabilityBand,
  family: ClauseFamily,
  supplierName: string,
  recordCount: number
): string {
  const s = supplierName.trim() || "The supplier";
  if (band <= 2) {
    return `${s}'s ask on ${family} is broadly in line with or close to ${recordCount} prior signed ${recordCount === 1 ? "deal" : "deals"} in the repository for this contract type.`;
  }
  if (band === 3) {
    return `${s}'s position on ${family} is more aggressive than typical signed outcomes; limited precedent supports partial movement.`;
  }
  return `${s}'s ask on ${family} is materially outside historical signed ranges with this client/type (${recordCount} prior ${recordCount === 1 ? "data point" : "data points"}).`;
}

export function getBenchmarkResults(
  issues: BenchmarkIssueInput[],
  supplierName: string,
  clientName: string,
  contractType: ContractType,
  contracts: Contract[],
  clauseRecords: ClauseRecord[]
): BenchmarkResult[] {
  const eligible = contracts.filter((c) => c.contractType === contractType);
  const tier1 = eligible.filter(
    (c) =>
      c.supplierName.trim().toLowerCase() === supplierName.trim().toLowerCase() &&
      c.clientName.trim().toLowerCase() === clientName.trim().toLowerCase()
  );
  const tier2 = eligible.filter(
    (c) =>
      c.supplierName.trim().toLowerCase() === supplierName.trim().toLowerCase() &&
      !tier1.some((x) => x.id === c.id)
  );
  const tier3 = eligible.filter(
    (c) => !tier1.some((x) => x.id === c.id) && !tier2.some((x) => x.id === c.id)
  );

  const source =
    tier1.length > 0
      ? tier1
      : tier2.length > 0
        ? [...tier1, ...tier2]
        : [...tier1, ...tier2, ...tier3];

  const sourceIds = new Set(source.map((c) => c.id));

  const out: BenchmarkResult[] = [];

  for (const issue of issues) {
    const family: ClauseFamily | null = mapIssueTextToClauseFamily(
      issue.primaryCategory,
      issue.clauseTitle,
      issue.problem
    );
    if (!family) continue;

    const records = clauseRecords.filter(
      (r) => sourceIds.has(r.contractId) && r.clauseFamily === family
    );
    if (records.length === 0) continue;

    const withNorm = records.filter(
      (r) => typeof r.normalizedValue === "number" && !Number.isNaN(r.normalizedValue)
    );
    const values = withNorm.map((r) => r.normalizedValue!);
    const minN = values.length ? Math.min(...values) : 0;
    const maxN = values.length ? Math.max(...values) : 1;

    const askNorm = normalizeAskForFamily(issue.supplierAsk, family);
    let position = 0.5;
    if (askNorm && values.length > 0) {
      const v = askNorm.value;
      if (maxN === minN) position = 0.5;
      else position = (v - minN) / (maxN - minN);
      position = Math.max(0, Math.min(1, position));
    }

    const sortedByNorm = [...records].sort(
      (a, b) => (a.normalizedValue ?? 0) - (b.normalizedValue ?? 0)
    );
    const sortedByTime = [...records].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const low = sortedByNorm[0];
    const high = sortedByNorm[sortedByNorm.length - 1];
    const last = sortedByTime[0];

    const band = assignBand(position);
    const priorDealCount = source.length;

    out.push({
      issueId: issue.issueId,
      clauseFamily: family,
      currentAsk: issue.supplierAsk || issue.problem,
      signedRangeLow: low?.finalSignedValue ?? "—",
      signedRangeHigh: high?.finalSignedValue ?? "—",
      lastSigned: last?.finalSignedValue ?? "—",
      normalizedPosition: position,
      band,
      bandLabel: BAND_CONFIG[band].label,
      verdict: buildVerdict(band, family, supplierName, records.length),
      priorDealCount,
      sourceContractIds: [...new Set(records.map((r) => r.contractId))],
      contractTypeUsed: contractType,
    });
  }

  return out;
}

export function benchmarkResultByIssueId(
  results: BenchmarkResult[]
): Map<string, BenchmarkResult> {
  const m = new Map<string, BenchmarkResult>();
  for (const r of results) {
    if (r.issueId) m.set(r.issueId, r);
  }
  return m;
}
