"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { publicBasePath } from "@/lib/config";
import type {
  ContractStatus,
  ContractType,
  ContractValueBand,
} from "@/lib/types/repository";

const VALUE_BANDS: ContractValueBand[] = [
  "Under $1M",
  "$1–5M",
  "$5–20M",
  "$20M+",
];

export default function AddContractPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contractName: "",
    supplierName: "",
    clientName: "",
    contractType: "" as "" | ContractType,
    equipmentType: "",
    dealType: "",
    contractValueBand: "" as "" | ContractValueBand,
    signedDate: "",
    status: "Signed" as ContractStatus,
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.contractName.trim() ||
      !form.supplierName.trim() ||
      !form.clientName.trim() ||
      !form.contractType ||
      !form.equipmentType.trim() ||
      !form.signedDate
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${publicBasePath}/api/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName: form.contractName,
          supplierName: form.supplierName,
          clientName: form.clientName,
          contractType: form.contractType,
          equipmentType: form.equipmentType,
          dealType: form.dealType || undefined,
          contractValueBand: form.contractValueBand || undefined,
          signedDate: form.signedDate,
          status: form.status,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push(`/repository/${data.contract.id}`);
    } catch {
      setSaving(false);
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
          <Link
            href="/repository"
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-gray-500 border-l-2 border-transparent hover:text-gray-300 hover:bg-white/5"
          >
            <span className="w-3.5 text-center text-xs">▤</span>
            All Contracts
          </Link>
          <div className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white border-l-[3px] border-[#6ea8d9] bg-[rgba(110,168,217,0.1)]">
            <span className="w-3.5 text-center text-xs">+</span>
            Add Contract
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-w-0 p-7">
        <div className="max-w-[640px] mx-auto">
          <h1 className="text-slate-800 font-bold text-lg mb-6">Add contract</h1>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Contract name *
              </label>
              <input
                required
                value={form.contractName}
                onChange={(e) => setForm((f) => ({ ...f, contractName: e.target.value }))}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Supplier name *
                </label>
                <input
                  required
                  value={form.supplierName}
                  onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Client name *
                </label>
                <input
                  required
                  value={form.clientName}
                  onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Contract type *
              </label>
              <div className="flex gap-2">
                {(["Materials / Equipment", "Services"] as ContractType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, contractType: t }))}
                    className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md border-2 transition-all ${
                      form.contractType === t
                        ? "border-[#1a2942] bg-slate-50 text-slate-900 font-bold"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Equipment type *
                </label>
                <input
                  required
                  value={form.equipmentType}
                  onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Deal type
                </label>
                <input
                  value={form.dealType}
                  onChange={(e) => setForm((f) => ({ ...f, dealType: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Value band
                </label>
                <select
                  value={form.contractValueBand}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      contractValueBand: e.target.value as ContractValueBand | "",
                    }))
                  }
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {VALUE_BANDS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Signed date *
                </label>
                <input
                  required
                  type="date"
                  value={form.signedDate}
                  onChange={(e) => setForm((f) => ({ ...f, signedDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as ContractStatus }))
                  }
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                >
                  <option value="Signed">Signed</option>
                  <option value="Amended">Amended</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Notes
                </label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center text-xs text-slate-500">
              📄 Attach signed contract (PDF, Word — optional, reference only; not parsed in v1)
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Link
                href="/repository"
                className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#1a2942] rounded-lg hover:bg-[#243652] disabled:opacity-50"
              >
                {saving ? "Saving…" : "✓ Save contract"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
