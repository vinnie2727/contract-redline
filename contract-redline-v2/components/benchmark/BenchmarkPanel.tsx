"use client";

import { useState } from "react";
import Link from "next/link";
import type { BenchmarkResult } from "@/lib/types/repository";
import { BAND_CONFIG } from "@/lib/types/repository";
import { BenchmarkTrack } from "@/components/benchmark/BenchmarkTrack";

export function BenchmarkPanel({
  benchmark,
  supplierName,
  contractTypeLabel,
  contractCount,
  defaultOpen = true,
}: {
  benchmark: BenchmarkResult | null;
  supplierName: string;
  contractTypeLabel: string;
  contractCount: number;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!benchmark) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-[#fafbfc] px-4 py-6 text-center text-xs text-slate-500">
        No precedent data available for this clause.
      </div>
    );
  }

  const b = BAND_CONFIG[benchmark.band];
  const sl = supplierName.trim() || "Supplier";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-[#fafbfc] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-100/80 transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Precedent benchmark
        </span>
        <span className="text-[10px] text-slate-500 truncate">
          {contractTypeLabel} · {contractCount} contracts
        </span>
        <span className="text-slate-400 text-xs shrink-0">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-200/80">
          <BenchmarkTrack
            position={benchmark.normalizedPosition}
            band={benchmark.band}
            supplierLabel={sl}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#e5e7eb] rounded-lg overflow-hidden border border-[#e5e7eb]">
            <div className="p-3" style={{ background: b.bg }}>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                Current ask
              </div>
              <p
                className="text-xs font-bold mt-1 leading-snug"
                style={{ color: b.color }}
              >
                {benchmark.currentAsk}
              </p>
            </div>
            <div className="bg-[#e6f4ea] p-3">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                Signed range
              </div>
              <p className="text-xs font-bold text-[#1a7a3a] mt-1 leading-snug">
                {benchmark.signedRangeLow} → {benchmark.signedRangeHigh}
              </p>
            </div>
            <div className="bg-white p-3">
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                Last signed
              </div>
              <p className="text-xs text-slate-700 mt-1 leading-snug">
                {benchmark.lastSigned}
              </p>
            </div>
          </div>
          <div
            className="rounded-lg p-3 text-xs leading-relaxed text-[#374151]"
            style={{
              background: b.bg,
              borderLeft: `3px solid ${b.color}`,
            }}
          >
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <span className="text-[15px]" aria-hidden>
                {b.icon}
              </span>
              <span className="text-[11px] font-bold" style={{ color: b.color }}>
                {benchmark.bandLabel}
              </span>
              <span className="text-[9px] text-slate-500">
                ({benchmark.priorDealCount} prior contracts)
              </span>
            </div>
            <p>{benchmark.verdict}</p>
          </div>
          <p className="text-[10px] text-slate-500">
            Source contracts:{" "}
            {benchmark.sourceContractIds.map((id, i) => (
              <span key={id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/repository/${id}`}
                  className="text-[#0f4c75] underline font-medium"
                >
                  {id}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
