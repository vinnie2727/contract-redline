"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { publicBasePath } from "@/lib/config";
import type { Contract, ContractType } from "@/lib/types/repository";
import { TypePill } from "@/components/repository/TypePill";
import { StatusPill } from "@/components/repository/StatusPill";

export default function RepositoryListPage() {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContractType>("all");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      setLoading(true);
      fetch(`${publicBasePath}/api/contracts?${params}`)
        .then((r) => r.json())
        .then((d) => setContracts(d.contracts || []))
        .catch(() => setContracts([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, typeFilter, refreshKey]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const res = await fetch(`${publicBasePath}/api/contracts/${id}`, { method: "DELETE" });
      if (res.ok) setRefreshKey((k) => k + 1);
      else alert("Failed to delete");
    } catch {
      alert("Failed to delete");
    }
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
          <div className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white border-l-[3px] border-[#6ea8d9] bg-[rgba(110,168,217,0.1)]">
            <span className="w-3.5 text-center text-xs">▤</span>
            All Contracts
          </div>
          <Link
            href="/repository/add"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-gray-500 border-l-2 border-transparent hover:text-gray-300 hover:bg-white/5"
          >
            <span className="w-3.5 text-center text-xs">+</span>
            Add Contract
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="bg-white border-b border-slate-200 px-7 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-slate-800 font-bold text-lg">Contract Repository</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {loading ? "Loading…" : `${contracts.length} contracts`}
            </p>
          </div>
          <Link
            href="/repository/add"
            className="text-sm font-semibold text-white bg-[#1a2942] hover:bg-[#243652] px-4 py-2 rounded-lg"
          >
            + Add Contract
          </Link>
        </div>
        <div className="p-7 max-w-6xl mx-auto space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or supplier…"
              className="max-w-[300px] w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
            <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              {(["all", "Materials / Equipment", "Services"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                    typeFilter === t
                      ? "bg-white shadow-sm text-slate-800"
                      : "text-slate-500"
                  }`}
                >
                  {t === "all" ? "All" : t === "Services" ? "Services" : "M&E"}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                    Contract
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                    Supplier
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500 w-20">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500 w-24">
                    Equipment
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500 w-20">
                    Value
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500 w-24">
                    Signed
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase text-slate-500 w-20">
                    Status
                  </th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-[#f8f9fa]"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/repository/${c.id}`}
                        className="font-bold text-[#1a2942] hover:underline"
                      >
                        {c.contractName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{c.supplierName}</td>
                    <td className="px-3 py-2.5">
                      <TypePill type={c.contractType} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-600">
                      {c.equipmentType || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-600">
                      {c.contractValueBand || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-600">
                      {c.signedDate}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.contractName); }}
                        className="text-[10px] text-red-400 hover:text-red-600 font-semibold"
                        title="Delete contract"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && contracts.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-10">No contracts.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
