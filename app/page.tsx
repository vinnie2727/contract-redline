"use client";

import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";

const ANALYZE_TIMEOUT_MS = 180_000;

/** Inlined at build; must match next.config `basePath` for subpath deploys */
const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

type Severity = "Critical" | "High" | "Medium" | "Low";
type Action =
  | "Accept"
  | "Accept with note"
  | "Counter"
  | "Reject"
  | "Escalate";

interface Issue {
  issueId: string;
  clauseReference: string;
  clauseTitle: string;
  changeType: string;
  primaryCategory: string;
  secondaryCategories: string[];
  severity: Severity;
  buyerImpactSummary: string;
  supplierLikelyIntent: string;
  baselineLanguageSummary: string;
  revisedLanguageSummary: string;
  whatChanged: string;
  whyItMatters: string;
  severityRationale: string;
  recommendedAction: Action;
  fallbackPosition: string;
  suggestedCounterLanguage: string;
  internalReviewers: string[];
}

interface Analysis {
  executiveSummary: {
    overallRisk: Severity;
    supplierPosture: string;
    top5Issues: string[];
    recommendedActions: string[];
  };
  counts: Record<Severity, number>;
  issues: Issue[];
  riskSummary: {
    byCategory: { category: string; risk: Severity }[];
    tradableIssues: string[];
    legalEscalation: string[];
    businessDecisions: string[];
    negotiationNotes: string;
  };
}

const SEV_COLORS: Record<Severity, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Low: "bg-green-50 text-green-700 border-green-200",
};

const ACT_COLORS: Record<string, string> = {
  Reject: "bg-red-50 text-red-700",
  Counter: "bg-blue-50 text-blue-700",
  Accept: "bg-green-50 text-green-700",
  Escalate: "bg-purple-50 text-purple-700",
  "Accept with note": "bg-slate-100 text-slate-600",
};

const RISK_BAR: Record<Severity, string> = {
  Critical: "w-full bg-red-500",
  High: "w-3/4 bg-orange-500",
  Medium: "w-1/2 bg-yellow-500",
  Low: "w-1/4 bg-green-500",
};

export default function Home() {
  const [tab, setTab] = useState<"upload" | "summary" | "issues" | "risk">(
    "upload"
  );
  const [redlineFile, setRedlineFile] = useState<File | null>(null);
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const redlineRef = useRef<HTMLInputElement>(null);
  const baselineRef = useRef<HTMLInputElement>(null);

  const [ctx, setCtx] = useState({
    supplier: "",
    equipment: "",
    buyer: "",
    project: "",
    value: "",
    focus: "",
    priorities: "",
  });

  const sevCounts = analysis?.counts || {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  const risk = analysis?.executiveSummary.overallRisk;
  const riskEmoji: Record<string, string> = {
    Critical: "🔴",
    High: "🟠",
    Medium: "🟡",
    Low: "🟢",
  };

  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return;
    }
    setLoadingSeconds(0);
    const id = window.setInterval(() => {
      setLoadingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  async function runAnalysis() {
    if (!redlineFile && !baselineFile) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    if (redlineFile) fd.append("redline", redlineFile);
    if (baselineFile) fd.append("baseline", baselineFile);
    fd.append("context", JSON.stringify(ctx));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
    try {
      const res = await fetch(`${publicBasePath}/api/analyze`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const rawText = await res.text();
      let data: { error?: string } & Partial<Analysis>;
      try {
        data = JSON.parse(rawText) as { error?: string } & Partial<Analysis>;
      } catch {
        throw new Error(
          res.ok
            ? "Server returned invalid JSON."
            : `Server error (${res.status}). If the page is on the wrong port, open the URL from the terminal where npm run dev is running.`
        );
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setAnalysis(data as Analysis);
      setTab("summary");
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setError(
          `Timed out after ${ANALYZE_TIMEOUT_MS / 1000}s. Try a smaller PDF, or ensure you are on the correct dev port (see terminal).`
        );
      } else {
        setError(e instanceof Error ? e.message : "Analysis failed");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function reset() {
    setAnalysis(null);
    setError(null);
    setTab("upload");
    setRedlineFile(null);
    setBaselineFile(null);
    setFilter("All");
    setExpanded(new Set());
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const navItems = [
    { key: "upload", label: "Upload & Analyze", icon: "↑" },
    { key: "summary", label: "Executive Summary", icon: "◎" },
    { key: "issues", label: "Issue Register", icon: "≡" },
    { key: "risk", label: "Risk Summary", icon: "◈" },
  ];

  const filteredIssues = (analysis?.issues || []).filter(
    (i) => filter === "All" || i.severity === filter
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 relative">
      {loading && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white px-8 py-7 text-center shadow-xl">
            <div
              className="mx-auto mb-4 h-11 w-11 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
              role="status"
            />
            <p className="text-sm font-semibold text-slate-800">
              Analyzing contract…
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Uploading your file, extracting text, then calling the model. Large
              PDFs can take a minute or two—the window stays open until it
              finishes or times out.
            </p>
            <p className="mt-4 font-mono text-xs tabular-nums text-slate-400">
              {loadingSeconds}s elapsed
            </p>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <div
        className="w-52 min-w-52 flex flex-col overflow-y-auto"
        style={{ background: "#0d1117" }}
      >
        <div className="px-4 py-5 border-b border-white/10">
          <div className="text-white font-bold text-xs tracking-widest uppercase">
            SMUD
          </div>
          <div className="text-gray-500 text-xs mt-1">
            Contract Redline Analyzer
          </div>
        </div>
        <div className="pt-3">
          <div className="px-4 pb-2 text-gray-600 text-xs font-bold tracking-widest uppercase">
            Workflow
          </div>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key as typeof tab)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-all border-l-2 ${tab === item.key ? "text-white border-blue-500 bg-white/10" : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"}`}
            >
              <span className="w-3.5 text-center text-xs">{item.icon}</span>
              {item.label}
              {item.key === "issues" && analysis && (
                <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                  {analysis.issues.length}
                </span>
              )}
              {item.key === "summary" && risk && (
                <span
                  className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full text-white ${risk === "Critical" ? "bg-red-500" : risk === "High" ? "bg-orange-500" : risk === "Medium" ? "bg-yellow-500" : "bg-green-500"}`}
                >
                  {risk}
                </span>
              )}
            </button>
          ))}
        </div>
        {analysis && (
          <div className="mt-auto p-4 border-t border-white/10">
            <div className="text-gray-600 text-xs uppercase tracking-widest font-bold mb-1">
              Current Analysis
            </div>
            <div className="text-gray-200 text-sm font-semibold">
              {ctx.supplier || "Unknown Supplier"}
            </div>
            <div className="text-gray-500 text-xs mt-1">
              {[ctx.equipment, ctx.value].filter(Boolean).join(" · ")}
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
        <div className="bg-white border-b border-slate-200 px-7 py-3.5 flex items-center justify-between shrink-0">
          <div>
            <div className="text-slate-800 font-bold text-sm">
              {tab === "upload"
                ? "Contract Redline Analyzer"
                : tab === "summary"
                  ? "Executive Summary"
                  : tab === "issues"
                    ? "Issue Register"
                    : "Risk Summary"}
            </div>
            <div className="text-slate-400 text-xs mt-0.5">
              {tab === "upload"
                ? "Upload the supplier redlined contract to begin analysis"
                : analysis
                  ? `${ctx.supplier || ""}${ctx.equipment ? " · " + ctx.equipment : ""}`.trim()
                  : "Run analysis first"}
            </div>
          </div>
          <button
            onClick={reset}
            className="text-slate-500 border border-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-slate-50"
          >
            New Analysis
          </button>
        </div>

        <div className="p-7 flex-1">
          {/* UPLOAD */}
          {tab === "upload" && (
            <div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  🔴 Supplier Redlined Draft
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Upload the supplier&apos;s redlined PDF — tracked changes will
                  be read directly
                </p>
                <div
                  onClick={() => redlineRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver("redline");
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const f = e.dataTransfer.files[0];
                    if (f) setRedlineFile(f);
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragOver === "redline" ? "border-blue-400 bg-blue-50" : redlineFile ? "border-green-400 bg-green-50" : "border-slate-200 hover:border-blue-300"}`}
                >
                  <div className="text-2xl mb-1">📂</div>
                  <div
                    className={`text-sm ${redlineFile ? "text-green-700 font-semibold" : "text-slate-500"}`}
                  >
                    {redlineFile
                      ? `✓ ${redlineFile.name}`
                      : "Click or drag PDF here"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    PDF, Word (.doc, .docx), or .txt
                  </div>
                </div>
                <input
                  ref={redlineRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setRedlineFile(f);
                  }}
                />
              </div>

              <div className="mb-4">
                <button
                  onClick={() => setShowBaseline(!showBaseline)}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2"
                >
                  <span
                    className={`text-slate-400 transition-transform ${showBaseline ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  Add baseline contract
                  <span className="text-slate-400 font-normal">
                    (optional — only needed if supplier sent a clean draft without
                    tracked changes)
                  </span>
                </button>
                {showBaseline && (
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-slate-800 mb-1">
                      📄 Baseline Contract
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Your buyer paper — used for comparison if redline has no
                      markup
                    </p>
                    <div
                      onClick={() => baselineRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver("baseline");
                      }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const f = e.dataTransfer.files[0];
                        if (f) setBaselineFile(f);
                      }}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${dragOver === "baseline" ? "border-blue-400 bg-blue-50" : baselineFile ? "border-green-400 bg-green-50" : "border-slate-200 hover:border-blue-300"}`}
                    >
                      <div className="text-2xl mb-1">📂</div>
                      <div
                        className={`text-sm ${baselineFile ? "text-green-700 font-semibold" : "text-slate-500"}`}
                      >
                        {baselineFile
                          ? `✓ ${baselineFile.name}`
                          : "Click or drag PDF here"}
                      </div>
                    </div>
                    <input
                      ref={baselineRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setBaselineFile(f);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                <h3 className="text-sm font-bold text-slate-800 mb-4">
                  Deal Context
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      key: "supplier",
                      label: "Supplier Name",
                      ph: "e.g. Siemens Energy",
                    },
                    {
                      key: "equipment",
                      label: "Equipment Type",
                      ph: "e.g. Power Transformer 345kV",
                    },
                    {
                      key: "buyer",
                      label: "Buyer / Project Owner",
                      ph: "e.g. SMUD",
                    },
                    {
                      key: "project",
                      label: "Project Name",
                      ph: "e.g. Substation X Upgrade",
                    },
                    {
                      key: "value",
                      label: "Contract Value",
                      ph: "e.g. $12M",
                    },
                    {
                      key: "focus",
                      label: "Key Focus Areas",
                      ph: "e.g. warranty, LDs, payment",
                    },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        {f.label}
                      </label>
                      <input
                        value={ctx[f.key as keyof typeof ctx]}
                        onChange={(e) =>
                          setCtx((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        placeholder={f.ph}
                        className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400"
                      />
                    </div>
                  ))}
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Additional Context
                    </label>
                    <textarea
                      value={ctx.priorities}
                      onChange={(e) =>
                        setCtx((p) => ({ ...p, priorities: e.target.value }))
                      }
                      placeholder="Any special project constraints, schedule criticality, or priorities..."
                      className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 resize-none h-14"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-3">
                <span
                  className={`text-xs font-semibold ${redlineFile || baselineFile ? "text-green-600" : "text-slate-400"}`}
                >
                  {redlineFile || baselineFile
                    ? "✓ Ready to analyze"
                    : "Upload a contract to begin"}
                </span>
                <button
                  onClick={runAnalysis}
                  disabled={loading || (!redlineFile && !baselineFile)}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-200 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all"
                >
                  {loading ? "Analyzing..." : "⚡ Analyze Contract"}
                </button>
              </div>
            </div>
          )}

          {/* SUMMARY */}
          {tab === "summary" &&
            (!analysis ? (
              <Empty icon="◎" label="No analysis yet" />
            ) : (
              <div>
                <div
                  className={`rounded-xl p-5 mb-5 flex gap-4 border ${risk === "Critical" ? "bg-red-50 border-red-200" : risk === "High" ? "bg-orange-50 border-orange-200" : risk === "Medium" ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}
                >
                  <div className="text-3xl mt-0.5">{riskEmoji[risk!]}</div>
                  <div>
                    <div
                      className={`text-xs font-bold uppercase tracking-widest mb-1 ${risk === "Critical" ? "text-red-700" : risk === "High" ? "text-orange-700" : risk === "Medium" ? "text-yellow-700" : "text-green-700"}`}
                    >
                      Overall Risk — {risk}
                    </div>
                    <div className="text-slate-800 font-bold text-lg">
                      {ctx.supplier}
                      {ctx.equipment ? ` · ${ctx.equipment}` : ""}
                    </div>
                    <div className="text-slate-600 text-sm mt-1 leading-relaxed max-w-2xl">
                      {analysis.executiveSummary.supplierPosture}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mb-5">
                  {(["Critical", "High", "Medium", "Low"] as Severity[]).map(
                    (s) => (
                      <div
                        key={s}
                        className={`flex-1 text-center py-3 rounded-lg ${s === "Critical" ? "bg-red-50" : s === "High" ? "bg-orange-50" : s === "Medium" ? "bg-yellow-50" : "bg-green-50"}`}
                      >
                        <div
                          className={`text-2xl font-black ${s === "Critical" ? "text-red-600" : s === "High" ? "text-orange-600" : s === "Medium" ? "text-yellow-600" : "text-green-600"}`}
                        >
                          {sevCounts[s]}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {s}
                        </div>
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      title: "Top Issues",
                      items: analysis.executiveSummary.top5Issues,
                    },
                    {
                      title: "Recommended Actions",
                      items: analysis.executiveSummary.recommendedActions,
                    },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="bg-white border border-slate-200 rounded-xl p-5"
                    >
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {card.title}
                      </h4>
                      <ul className="space-y-1">
                        {card.items.map((item, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-slate-700 py-1 border-b border-slate-50 last:border-0 leading-snug"
                          >
                            <span className="text-blue-400 text-xs mt-0.5 shrink-0">
                              →
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* ISSUES */}
          {tab === "issues" &&
            (!analysis ? (
              <Empty icon="≡" label="No issues yet" />
            ) : (
              <div>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {["All", "Critical", "High", "Medium", "Low"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filter === s ? (s === "Critical" ? "bg-red-600 border-red-600 text-white" : s === "High" ? "bg-orange-600 border-orange-600 text-white" : s === "Medium" ? "bg-yellow-600 border-yellow-600 text-white" : s === "Low" ? "bg-green-600 border-green-600 text-white" : "bg-slate-800 border-slate-800 text-white") : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"}`}
                    >
                      {s}
                      {s !== "All"
                        ? ` (${(analysis.issues || []).filter((i) => i.severity === s).length})`
                        : ""}
                    </button>
                  ))}
                </div>
                <div className="space-y-2.5">
                  {filteredIssues.map((iss) => (
                    <div
                      key={iss.issueId}
                      className={`bg-white border rounded-xl overflow-hidden transition-all ${expanded.has(iss.issueId) ? "border-blue-400" : "border-slate-200 hover:shadow-sm"}`}
                    >
                      <div
                        onClick={() => toggleExpand(iss.issueId)}
                        className="flex items-center gap-2.5 px-4 py-3 cursor-pointer"
                      >
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${SEV_COLORS[iss.severity]}`}
                        >
                          {iss.severity}
                        </span>
                        <span className="text-xs text-slate-400 font-semibold shrink-0 w-10">
                          {iss.clauseReference}
                        </span>
                        <span className="text-sm font-bold text-slate-800 flex-1 truncate">
                          {iss.clauseTitle}
                        </span>
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0 hidden sm:block max-w-32 truncate">
                          {iss.primaryCategory}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${ACT_COLORS[iss.recommendedAction] || "bg-slate-100 text-slate-600"}`}
                        >
                          {iss.recommendedAction}
                        </span>
                        <span
                          className={`text-slate-400 text-xs transition-transform shrink-0 ${expanded.has(iss.issueId) ? "rotate-180" : ""}`}
                        >
                          ▼
                        </span>
                      </div>
                      {expanded.has(iss.issueId) && (
                        <div className="px-4 pb-4 border-t border-slate-100">
                          <div className="mt-3">
                            <Label>Buyer Impact</Label>
                            <p className="text-sm text-slate-700 leading-relaxed">
                              {iss.buyerImpactSummary}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <Label>Baseline Language</Label>
                              <LangBlock variant="baseline">
                                {iss.baselineLanguageSummary}
                              </LangBlock>
                            </div>
                            <div>
                              <Label>Revised Language</Label>
                              <LangBlock variant="revised">
                                {iss.revisedLanguageSummary}
                              </LangBlock>
                            </div>
                            <div>
                              <Label>What Changed</Label>
                              <p className="text-sm text-slate-700 leading-relaxed">
                                {iss.whatChanged}
                              </p>
                            </div>
                            <div>
                              <Label>Why It Matters</Label>
                              <p className="text-sm text-slate-700 leading-relaxed">
                                {iss.whyItMatters}
                              </p>
                            </div>
                            <div>
                              <Label>
                                Supplier Intent{" "}
                                <span className="font-normal normal-case tracking-normal">
                                  (inference)
                                </span>
                              </Label>
                              <p className="text-sm text-slate-700 leading-relaxed">
                                {iss.supplierLikelyIntent}
                              </p>
                            </div>
                            <div>
                              <Label>Severity Rationale</Label>
                              <p className="text-sm text-slate-700 leading-relaxed">
                                {iss.severityRationale}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3">
                            <Label>Suggested Counter Language</Label>
                            <LangBlock variant="counter">
                              {iss.suggestedCounterLanguage ||
                                iss.fallbackPosition}
                            </LangBlock>
                          </div>
                          {iss.internalReviewers?.length > 0 && (
                            <div className="flex gap-2 mt-3 flex-wrap">
                              {iss.internalReviewers.map((r) => (
                                <span
                                  key={r}
                                  className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* RISK */}
          {tab === "risk" &&
            (!analysis ? (
              <Empty icon="◈" label="No risk summary yet" />
            ) : (
              <div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <h4 className="text-sm font-bold text-slate-800 px-5 py-3 border-b border-slate-100">
                    Risk by Category
                  </h4>
                  {(analysis.riskSummary?.byCategory ?? []).map((c) => (
                    <div
                      key={c.category}
                      className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-50 last:border-0"
                    >
                      <span className="text-sm text-slate-700 flex-1">
                        {c.category}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${RISK_BAR[c.risk]}`}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded min-w-16 text-center border ${SEV_COLORS[c.risk]}`}
                      >
                        {c.risk}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    {
                      title: "Tradable Issues",
                      items: analysis.riskSummary.tradableIssues,
                    },
                    {
                      title: "Legal Escalation Required",
                      items: analysis.riskSummary.legalEscalation,
                    },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="bg-white border border-slate-200 rounded-xl p-4"
                    >
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {card.title}
                      </h4>
                      <ul className="space-y-1">
                        {(card.items || []).map((item, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-slate-700 py-1 border-b border-slate-50 last:border-0 leading-snug"
                          >
                            <span className="text-blue-400 shrink-0">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {(analysis.riskSummary.businessDecisions?.length ?? 0) >
                  0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Business Decisions (Not Legal)
                    </h4>
                    <ul className="space-y-1">
                      {analysis.riskSummary.businessDecisions.map(
                        (item, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-slate-700 py-1 border-b border-slate-50 last:border-0 leading-snug"
                          >
                            <span className="text-blue-400 shrink-0">•</span>
                            {item}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
                {analysis.riskSummary.negotiationNotes && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Negotiation Strategy
                    </h4>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {analysis.riskSummary.negotiationNotes}
                    </p>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="text-center py-20 text-slate-400">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-sm">{label}</p>
      <p className="text-xs mt-1">Run analysis first</p>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
      {children}
    </h5>
  );
}

function LangBlock({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "baseline" | "revised" | "counter";
}) {
  const border =
    variant === "baseline"
      ? "border-l-slate-300"
      : variant === "revised"
        ? "border-l-blue-400"
        : "border-l-green-400";
  return (
    <div
      className={`bg-slate-50 border border-slate-200 border-l-4 ${border} rounded-lg p-3 text-xs text-slate-600 leading-relaxed`}
    >
      {children}
    </div>
  );
}
