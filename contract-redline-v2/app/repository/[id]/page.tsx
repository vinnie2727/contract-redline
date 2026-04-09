"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { publicBasePath } from "@/lib/config";
import type { ClauseRecord, Contract } from "@/lib/types/repository";
import { TypePill } from "@/components/repository/TypePill";
import { StatusPill } from "@/components/repository/StatusPill";

export default function ContractDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [contract, setContract] = useState<Contract | null>(null);
  const [clauses, setClauses] = useState<ClauseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${publicBasePath}/api/contracts/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setContract(d.contract);
        setClauses(d.clauseRecords || []);
      })
      .catch(() => {
        setContract(null);
        setClauses([]);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
    );
  }
  if (!contract) {
    return (
      <div className="p-10 text-center text-slate-500 text-sm">
        Contract not found.{" "}
        <Link href="/repository" className="text-blue-600 underline">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <div
        className="w-52 min-w-52 flex flex-col overflow-y-auto border-r border-white/10"
        style={{ background: "#0d1117" }}
      >
        <div className="px-4 py-5 border-b border-white/10">
          <div className="text-white font-bold text-xs tracking-widest uppercase">
            SMUD
          </div>
          <div className="text-gray-500 text-xs mt-1">Contract Analyzer v2</div>
        </div>
        <div className="pt-3">
          <div className="px-4 pb-2 text-gray-600 text-[9px] font-bold tracking-widest uppercase">
            Analyzer
          </div>
          <Link
            href="/"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-gray-500 border-l-2 border-transparent hover:text-gray-300 hover:bg-white/5"
          >
            <span className="w-3.5 text-center text-xs">↑</span>
            Upload &amp; Analyze
          </Link>
        </div>
        <div className="pt-4 mt-2 border-t border-white/10">
          <div className="px-4 pb-2 text-gray-600 text-[9px] font-bold tracking-widest uppercase">
            Repository
          </div>
          <Link
            href="/repository"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-gray-500 border-l-2 border-transparent hover:text-gray-300 hover:bg-white/5"
          >
            <span className="w-3.5 text-center text-xs">▤</span>
            All Contracts
          </Link>
          <Link
            href="/repository/add"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-gray-500 border-l-2 border-transparent hover:text-gray-300 hover:bg-white/5"
          >
            <span className="w-3.5 text-center text-xs">+</span>
            Add Contract
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-w-0 p-7">
        <div className="max-w-3xl mx-auto space-y-6">
          <Link href="/repository" className="text-xs text-blue-600 font-semibold">
            ← All contracts
          </Link>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-[#1a2942]">{contract.contractName}</h1>
              <div className="flex gap-2">
                <TypePill type={contract.contractType} />
                <StatusPill status={contract.status} />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Supplier</dt>
                <dd className="text-slate-800">{contract.supplierName}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Client</dt>
                <dd className="text-slate-800">{contract.clientName}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Equipment</dt>
                <dd className="text-slate-800">{contract.equipmentType || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Signed</dt>
                <dd className="text-slate-800">{contract.signedDate}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Value band</dt>
                <dd className="text-slate-800">{contract.contractValueBand || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Deal type</dt>
                <dd className="text-slate-800">{contract.dealType || "—"}</dd>
              </div>
            </dl>
            {contract.notes ? (
              <p className="mt-4 text-sm text-slate-600 border-t border-slate-100 pt-4">
                {contract.notes}
              </p>
            ) : null}
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Clause records
            </h2>
            <div className="space-y-2">
              {clauses.length === 0 ? (
                <p className="text-sm text-slate-500">No clause records for this contract.</p>
              ) : (
                clauses.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white border border-slate-200 rounded-lg p-4 text-sm"
                  >
                    <div className="font-bold text-slate-800">{c.clauseFamily}</div>
                    <p className="text-xs text-slate-600 mt-1">
                      <span className="font-semibold text-slate-500">Signed: </span>
                      {c.finalSignedValue}
                    </p>
                    {c.supplierProposedValue ? (
                      <p className="text-xs text-slate-500 mt-1">
                        Proposed: {c.supplierProposedValue}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
