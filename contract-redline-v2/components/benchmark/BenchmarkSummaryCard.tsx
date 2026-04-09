"use client";

import Link from "next/link";
import type { BenchmarkResult, ContractType } from "@/lib/types/repository";
import { BenchmarkTrack } from "@/components/benchmark/BenchmarkTrack";
import { BandPill } from "@/components/benchmark/BandPill";

export function BenchmarkSummaryCard({
  results,
  contractType,
}: {
  results: BenchmarkResult[];
  contractType: ContractType;
}) {
  const typeLabel =
    contractType === "Services" ? "Services" : "Materials / Equipment";
  const other =
    contractType === "Services" ? "Materials / Equipment" : "Services";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
        Precedent benchmark summary
      </h3>
      <p className="text-[11px] text-slate-500 mb-4">
        Compared against the repository for{" "}
        <span className="font-semibold text-slate-600">{typeLabel}</span> only (
        <span className="font-medium">{other}</span> excluded per business rules).
      </p>
      {results.length === 0 ? (
        <p className="text-sm text-slate-500">
          No benchmark rows yet — run analysis with contract type set, or add
          precedent contracts in the repository.
        </p>
      ) : (
        <ul className="space-y-3">
          {results.map((r) => (
            <li
              key={`${r.issueId}-${r.clauseFamily}`}
              className="flex flex-wrap items-center gap-2 gap-y-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
            >
              <span className="w-[160px] shrink-0 text-xs font-bold text-slate-800 leading-snug">
                {r.clauseFamily}
              </span>
              <div className="flex-1 min-w-[120px] max-w-md">
                <BenchmarkTrack
                  position={r.normalizedPosition}
                  band={r.band}
                  compact
                  supplierLabel="Supplier"
                />
              </div>
              <div className="w-[155px] shrink-0 flex justify-end">
                <BandPill band={r.band} />
              </div>
              <div className="w-full text-[10px] text-slate-400 pl-[160px]">
                Source:{" "}
                {r.sourceContractIds.slice(0, 3).map((id, i) => (
                  <span key={id}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/repository/${id}`} className="text-[#0f4c75] underline">
                      {id}
                    </Link>
                  </span>
                ))}
                {r.sourceContractIds.length > 3 ? " …" : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
