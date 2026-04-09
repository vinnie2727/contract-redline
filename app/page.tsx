"use client";

import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";

/** Slightly above Vercel `maxDuration` (300s) so the browser does not abort first */
const ANALYZE_TIMEOUT_MS = 330_000;

/** Must match `basePath` in next.config.ts */
const publicBasePath = "/SMUD-contract-analyzer";

type Severity = "Critical" | "High" | "Medium" | "Low";

interface IssueDetails {
  whatChanged: string;
  whyItMatters: string;
  whatToDo: string;
  counterLanguage: string;
  confidence: string;
  marketContext: string;
}

interface Issue {
  issueId: string;
  clauseReference: string;
  clauseTitle: string;
  primaryCategory: string;
  severity: Severity;
  problem: string;
  action: string;
  details: IssueDetails;
  /** Present when API returned legacy-shaped issues */
  buyerImpactSummary?: string;
  baselineLanguageSummary?: string;
  revisedLanguageSummary?: string;
  suggestedCounterLanguage?: string;
  fallbackPosition?: string;
  supplierLikelyIntent?: string;
  severityRationale?: string;
  internalReviewers?: string[];
  whatChanged?: string;
  whyItMatters?: string;
}

interface TopMustFix {
  clauseReference?: string;
  title?: string;
  problem?: string;
  action?: string;
}

interface ExecutiveSummary {
  overallRisk: Severity;
  oneLineBlunt: string;
  ifYouDoNothing: string[];
  top3MustFix: TopMustFix[];
  cumulativeRiskNote: string;
}

interface NegotiationPlanItem {
  severity: Severity;
  headline: string;
  detail: string;
}

interface NegotiationPlan {
  context: string;
  items: NegotiationPlanItem[];
  checklist: string[];
}

interface RiskSummary {
  whereTheyrePushing: { area: string; level: string }[];
  whereYoureSafe: string[];
  whereToPushBack: string[];
  negotiationNotes: string;
  negotiationPlan?: NegotiationPlan;
}

interface TradeMapRow {
  topic?: string;
  give: string;
  get: string;
  severity?: Severity;
  linkedIssueIds?: string[];
}

interface BatnaRow {
  topic: string;
  theirAsk: string;
  ourTarget: string;
  ourWalkAway: string;
  ourBatna: string;
  leverageNote: string;
}

interface TradeStrategy {
  tradeMap: TradeMapRow[];
  /** Negotiation floor / BATNA rows; optional for older API responses */
  batnaTable?: BatnaRow[];
}

interface Analysis {
  executiveSummary: ExecutiveSummary;
  counts: Record<Severity, number>;
  issues: Issue[];
  riskSummary: RiskSummary;
  tradeStrategy: TradeStrategy;
}

const SEV_COLORS: Record<Severity, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Low: "bg-green-50 text-green-700 border-green-200",
};

type WorkflowTab =
  | "upload"
  | "overview"
  | "summary"
  | "issues"
  | "risk"
  | "trade";

function pushLevelClass(level: string): string {
  const L = (level || "").toLowerCase();
  if (L.includes("critical"))
    return "bg-red-100 text-red-900 border-red-200";
  if (L === "high" || L.includes("high"))
    return "bg-orange-100 text-orange-900 border-orange-200";
  if (L.includes("medium"))
    return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-green-50 text-green-900 border-green-200";
}

function nonemptyBatnaRows(rows: BatnaRow[] | undefined): BatnaRow[] {
  return (rows || []).filter((r) =>
    [
      r.topic,
      r.theirAsk,
      r.ourTarget,
      r.ourWalkAway,
      r.ourBatna,
      r.leverageNote,
    ].some((s) => (s || "").trim().length > 0)
  );
}

function severityRank(s: Severity): number {
  switch (s) {
    case "Critical":
      return 0;
    case "High":
      return 1;
    case "Medium":
      return 2;
    case "Low":
    default:
      return 3;
  }
}

function tradeRowSeverity(row: TradeMapRow): Severity {
  return row.severity ?? "Medium";
}

function sortedTradeRows(rows: TradeMapRow[] | undefined): TradeMapRow[] {
  return [...(rows || [])].sort(
    (a, b) => severityRank(tradeRowSeverity(a)) - severityRank(tradeRowSeverity(b))
  );
}

function legacyNegotiationParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function negotiationPlanIsPopulated(plan: NegotiationPlan | undefined): boolean {
  if (!plan) return false;
  const items = (plan.items || []).filter(
    (i) => (i.headline || "").trim() || (i.detail || "").trim()
  );
  const checklist = (plan.checklist || []).filter((c) => (c || "").trim());
  return (
    (plan.context || "").trim().length > 0 ||
    items.length > 0 ||
    checklist.length > 0
  );
}

function previewText(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

/**
 * Smooth estimate from elapsed seconds (asymptotic — not real server progress).
 * Capped below 100% so the bar does not imply we’re “almost done” while the model still runs.
 */
function estimatedProgressPercent(seconds: number): number {
  const raw = 100 * (1 - Math.exp(-seconds / 38));
  return Math.min(96, Math.round(raw));
}

const LOADING_STAGES: { s: number; label: string }[] = [
  { s: 0, label: "Preparing and sending your file…" },
  { s: 10, label: "Extracting text from the document…" },
  { s: 28, label: "Calling the model — usually the longest step…" },
  { s: 55, label: "Generating structured findings…" },
  { s: 95, label: "Almost there — finishing the report…" },
];

function loadingStageLabel(seconds: number): string {
  let label = LOADING_STAGES[0]!.label;
  for (const stage of LOADING_STAGES) {
    if (seconds >= stage.s) label = stage.label;
  }
  return label;
}

export default function Home() {
  const [tab, setTab] = useState<WorkflowTab>("upload");
  const [redlineFile, setRedlineFile] = useState<File | null>(null);
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [counterOpen, setCounterOpen] = useState<Set<string>>(new Set());
  const [detailedView, setDetailedView] = useState(false);
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

      if (res.status === 504 || rawText.includes("FUNCTION_INVOCATION_TIMEOUT")) {
        throw new Error(
          "Vercel stopped the analysis because it ran past the server time limit (504). Deploy the latest code (5 min limit) and redeploy. If you are on Vercel Hobby, functions are capped at ~10s — use Pro for long AI jobs, or try a smaller document."
        );
      }

      let data: { error?: string } & Partial<Analysis>;
      try {
        data = JSON.parse(rawText) as { error?: string } & Partial<Analysis>;
      } catch {
        const looksLikeHtml = rawText.trimStart().startsWith("<");
        throw new Error(
          res.ok
            ? "Server returned invalid JSON."
            : looksLikeHtml
              ? `Server error (${res.status}): the API returned an HTML page instead of JSON — often a crash, cold-start failure, or request too large. In Vercel: open this project → Logs (or Deployments → failed build). Also confirm ANTHROPIC_API_KEY is set for Production.`
              : `Server error (${res.status}). ${rawText.slice(0, 200)}`
        );
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setAnalysis(data as Analysis);
      setTab("overview");
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
    setCounterOpen(new Set());
    setDetailedView(false);
  }

  function toggleCounter(id: string) {
    setCounterOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const navItems: { key: WorkflowTab; label: string; icon: string }[] = [
    { key: "upload", label: "Upload & Analyze", icon: "↑" },
    { key: "overview", label: "Results overview", icon: "◫" },
    { key: "summary", label: "Executive Summary", icon: "◎" },
    { key: "issues", label: "Issue Register", icon: "≡" },
    { key: "risk", label: "Risk Summary", icon: "◈" },
    { key: "trade", label: "Trade / Negotiation Mapping", icon: "⇄" },
  ];

  const filteredIssues = (analysis?.issues || []).filter(
    (i) => filter === "All" || i.severity === filter
  );

  const riskSummary = analysis?.riskSummary;
  const negPlan = riskSummary?.negotiationPlan;
  const negPlanOk = negotiationPlanIsPopulated(negPlan);
  const negPlanItems = (negPlan?.items || []).filter(
    (i) => (i.headline || "").trim() || (i.detail || "").trim()
  );
  const negPlanChecklist = (negPlan?.checklist || []).filter((c) =>
    (c || "").trim()
  );
  const negRaw = (riskSummary?.negotiationNotes || "").trim();
  const showNegotiationCard = negPlanOk || negRaw.length > 0;

  const sortedTrades = sortedTradeRows(analysis?.tradeStrategy?.tradeMap);
  const issueById = new Map(
    (analysis?.issues || []).map((i) => [i.issueId, i])
  );

  function jumpToIssue(issueId: string) {
    setTab("issues");
    setFilter("All");
    setExpanded(new Set([issueId]));
  }

  const loadPct = loading ? estimatedProgressPercent(loadingSeconds) : 0;
  const loadStage = loading ? loadingStageLabel(loadingSeconds) : "";
  const ringSize = 132;
  const ringStroke = 9;
  const ringR = (ringSize - ringStroke) / 2;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - loadPct / 100);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 relative">
      {loading && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white px-8 py-7 text-center shadow-xl">
            <div className="relative mx-auto mb-5" style={{ width: ringSize, height: ringSize }}>
              <svg
                width={ringSize}
                height={ringSize}
                className="absolute inset-0 -rotate-90"
                aria-hidden
              >
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringR}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={ringStroke}
                />
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringR}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={ringStroke}
                  strokeLinecap="round"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
                aria-live="polite"
              >
                <span className="text-2xl font-black tabular-nums text-slate-800">
                  {loadPct}
                  <span className="text-base font-bold text-slate-500">%</span>
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">
                  est.
                </span>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Analyzing contract…
            </p>
            <p className="mt-2 text-xs font-medium text-blue-600 leading-snug min-h-[2.5rem] px-1">
              {loadStage}
            </p>
            <div className="mt-4 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-[width] duration-700 ease-out"
                style={{ width: `${loadPct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Progress is an <span className="font-medium text-slate-500">estimate</span>{" "}
              from elapsed time — it often sits in the 90s while the AI finishes (not
              frozen). Large files or complex contracts can take several minutes (timeout{" "}
              {ANALYZE_TIMEOUT_MS / 60_000} min).
            </p>
            <p className="mt-3 font-mono text-xs tabular-nums text-slate-500">
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
              type="button"
              onClick={() => setTab(item.key)}
              disabled={item.key !== "upload" && !analysis}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-all border-l-2 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent ${tab === item.key ? "text-white border-blue-500 bg-white/10" : "text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5"}`}
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
                : tab === "overview"
                  ? "Results overview"
                  : tab === "summary"
                    ? "Executive Summary"
                    : tab === "issues"
                      ? "Issue Register"
                      : tab === "risk"
                        ? "Risk Summary"
                        : "Trade / Negotiation Mapping"}
            </div>
            <div className="text-slate-400 text-xs mt-0.5">
              {tab === "upload"
                ? "Upload the supplier redlined contract to begin analysis"
                : tab === "overview"
                  ? "Summary of each report section — open one below for full detail"
                : analysis
                  ? `${ctx.supplier || ""}${ctx.equipment ? " · " + ctx.equipment : ""}`.trim()
                  : "Run analysis first"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {analysis && tab !== "upload" && (
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setDetailedView(false)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md ${!detailedView ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setDetailedView(true)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md ${detailedView ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}
                >
                  Detailed
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={reset}
              className="text-slate-500 border border-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-slate-50"
            >
              New Analysis
            </button>
          </div>
        </div>

        <div
          className={`p-7 flex-1 min-h-0 ${tab === "upload" ? "bg-white" : "bg-[#e8edf5]"}`}
        >
          {/* RESULTS OVERVIEW — first screen after analyze */}
          {tab === "overview" &&
            (!analysis ? (
              <Empty icon="◫" label="No results yet" />
            ) : (
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="rounded-xl border border-green-200 bg-green-50/80 px-5 py-4">
                  <p className="text-sm font-semibold text-green-900">
                    Analysis complete
                  </p>
                  <p className="text-xs text-green-800/90 mt-1 leading-relaxed">
                    Below is a short summary of each part of the report. Use{" "}
                    <span className="font-medium">Open section</span> to read
                    the full Executive Summary, every issue, or the full risk
                    breakdown.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
                  {/* Card: Executive summary */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      1 · Executive summary
                    </h3>
                    <p className="text-sm font-bold text-slate-800 mb-2">
                      Overall risk:{" "}
                      <span
                        className={
                          risk === "Critical"
                            ? "text-red-600"
                            : risk === "High"
                              ? "text-orange-600"
                              : risk === "Medium"
                                ? "text-yellow-700"
                                : "text-green-600"
                        }
                      >
                        {risk}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed flex-1">
                      {previewText(
                        analysis.executiveSummary?.oneLineBlunt || ""
                      )}
                    </p>
                    <ul className="mt-3 text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
                      <li>
                        • If you do nothing:{" "}
                        {(analysis.executiveSummary?.ifYouDoNothing || []).length}{" "}
                        bullets
                      </li>
                      <li>
                        • Must-fix items:{" "}
                        {(analysis.executiveSummary?.top3MustFix || []).length}
                      </li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => setTab("summary")}
                      className="mt-4 w-full text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg py-2"
                    >
                      Open executive summary →
                    </button>
                  </div>
                  {/* Card: Issues */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      2 · Issue register
                    </h3>
                    <p className="text-2xl font-black text-slate-800 mb-1">
                      {analysis.issues?.length ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 mb-3">issues flagged</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(["Critical", "High", "Medium", "Low"] as Severity[]).map(
                        (s) => (
                          <span
                            key={s}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SEV_COLORS[s]}`}
                          >
                            {s} {sevCounts[s]}
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Sample
                    </p>
                    <ul className="text-xs text-slate-600 space-y-1.5 flex-1">
                      {(analysis.issues || []).slice(0, 4).map((i) => (
                        <li key={i.issueId} className="leading-snug">
                          <span className="text-slate-400">{i.clauseReference}</span>{" "}
                          {previewText(i.problem || i.clauseTitle, 72)}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setTab("issues")}
                      className="mt-4 w-full text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg py-2"
                    >
                      Open issue register →
                    </button>
                  </div>
                  {/* Card: Risk */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      3 · Risk summary
                    </h3>
                    <ul className="text-xs text-slate-600 space-y-2 flex-1">
                      <li>
                        • Where they&apos;re pushing:{" "}
                        <span className="font-semibold text-slate-800">
                          {(analysis.riskSummary?.whereTheyrePushing || []).length}
                        </span>
                      </li>
                      <li>
                        • Where you&apos;re safe:{" "}
                        <span className="font-semibold text-slate-800">
                          {(analysis.riskSummary?.whereYoureSafe || []).length}
                        </span>
                      </li>
                      <li>
                        • Trade pairs:{" "}
                        <span className="font-semibold text-slate-800">
                          {(analysis.tradeStrategy?.tradeMap || []).length}
                        </span>
                      </li>
                      <li>
                        • BATNA / nego rows:{" "}
                        <span className="font-semibold text-slate-800">
                          {nonemptyBatnaRows(
                            analysis.tradeStrategy?.batnaTable
                          ).length}
                        </span>
                      </li>
                    </ul>
                    {analysis.riskSummary?.negotiationNotes ? (
                      <p className="text-xs text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-100">
                        {previewText(analysis.riskSummary.negotiationNotes, 120)}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setTab("risk")}
                      className="mt-4 w-full text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg py-2"
                    >
                      Open risk summary →
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("trade")}
                      className="mt-2 w-full text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg py-2"
                    >
                      Open trade / negotiation mapping →
                    </button>
                  </div>
                </div>
              </div>
            ))}

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
                      {analysis.executiveSummary.oneLineBlunt ||
                        "No executive headline returned."}
                    </div>
                    {detailedView &&
                      analysis.executiveSummary.cumulativeRiskNote && (
                        <p className="text-sm text-slate-600 mt-3 max-w-2xl leading-relaxed border-t border-slate-200/80 pt-3">
                          {analysis.executiveSummary.cumulativeRiskNote}
                        </p>
                      )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      If you do nothing
                    </h4>
                    <ul className="space-y-2">
                      {(analysis.executiveSummary.ifYouDoNothing || []).map(
                        (item, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-slate-700 leading-snug"
                          >
                            <span className="text-amber-500 shrink-0">!</span>
                            {item}
                          </li>
                        )
                      )}
                      {(analysis.executiveSummary.ifYouDoNothing || [])
                        .length === 0 && (
                        <li className="text-sm text-slate-400">
                          No items listed.
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      Top must-fix
                    </h4>
                    <ul className="space-y-3">
                      {(analysis.executiveSummary.top3MustFix || []).map(
                        (m, i) => (
                          <li
                            key={i}
                            className="text-sm text-slate-700 border-b border-slate-50 last:border-0 pb-3 last:pb-0"
                          >
                            <div className="font-bold text-slate-800">
                              <span className="text-slate-400 font-semibold mr-1">
                                {m.clauseReference || "—"}
                              </span>
                              {m.title || "Untitled"}
                            </div>
                            {m.problem ? (
                              <p className="text-slate-600 mt-1 leading-relaxed">
                                {detailedView
                                  ? m.problem
                                  : previewText(m.problem, 140)}
                              </p>
                            ) : null}
                            {detailedView && m.action ? (
                              <p className="text-slate-700 mt-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                Action: {m.action}
                              </p>
                            ) : null}
                          </li>
                        )
                      )}
                      {(analysis.executiveSummary.top3MustFix || []).length ===
                        0 && (
                        <li className="text-sm text-slate-400">
                          No must-fix items listed.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            ))}

          {/* ISSUES */}
          {tab === "issues" &&
            (!analysis ? (
              <Empty icon="≡" label="No issues yet" />
            ) : (
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-2 mb-5 flex-wrap">
                  {["All", "Critical", "High", "Medium", "Low"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilter(s)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all shadow-sm ${filter === s ? (s === "Critical" ? "bg-red-600 border-red-600 text-white shadow-red-200/50" : s === "High" ? "bg-orange-600 border-orange-600 text-white shadow-orange-200/50" : s === "Medium" ? "bg-yellow-500 border-yellow-500 text-white" : s === "Low" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-800 border-slate-800 text-white") : "bg-white border-slate-200/90 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      {s}
                      {s !== "All"
                        ? ` (${(analysis.issues || []).filter((i) => i.severity === s).length})`
                        : ""}
                    </button>
                  ))}
                </div>
                <div className="space-y-4">
                  {filteredIssues.map((iss) => {
                    const d = iss.details;
                    const whatChanged =
                      d?.whatChanged || iss.whatChanged || "";
                    const whyMatters =
                      d?.whyItMatters || iss.whyItMatters || "";
                    const counterText =
                      d?.counterLanguage ||
                      iss.suggestedCounterLanguage ||
                      iss.fallbackPosition ||
                      "";
                    const hasLegacyExtra =
                      detailedView &&
                      (iss.baselineLanguageSummary ||
                        iss.revisedLanguageSummary ||
                        iss.supplierLikelyIntent ||
                        iss.severityRationale ||
                        (iss.internalReviewers &&
                          iss.internalReviewers.length > 0));
                    return (
                      <div
                        key={iss.issueId}
                        className={`rounded-2xl border bg-white overflow-hidden transition-shadow ${expanded.has(iss.issueId) ? "border-blue-400 shadow-md shadow-blue-500/10 ring-1 ring-blue-100" : "border-slate-200/90 shadow-sm hover:shadow-md"}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleExpand(iss.issueId)}
                          className="w-full text-left px-5 pt-4 pb-3 hover:bg-slate-50/60 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-md border shrink-0 ${SEV_COLORS[iss.severity]}`}
                              >
                                {iss.severity}
                              </span>
                              <span className="text-xs font-mono text-slate-500 font-medium">
                                {iss.clauseReference}
                              </span>
                            </div>
                            <span
                              className={`text-slate-400 text-sm transition-transform shrink-0 mt-0.5 ${expanded.has(iss.issueId) ? "rotate-180" : ""}`}
                              aria-hidden
                            >
                              ▼
                            </span>
                          </div>
                          {iss.primaryCategory ? (
                            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-[0.12em] mt-3">
                              {iss.primaryCategory}
                            </p>
                          ) : null}
                          <h3 className="text-base font-bold text-slate-900 mt-1.5 leading-snug">
                            {iss.clauseTitle}
                          </h3>
                          <p className="text-sm text-slate-600 mt-2 leading-relaxed line-clamp-4">
                            {iss.problem ||
                              iss.buyerImpactSummary ||
                              "—"}
                          </p>
                          {iss.action ? (
                            <div className="mt-4 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50/40 border border-sky-200/60 px-4 py-3 text-left">
                              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-900/70">
                                Recommended action
                              </span>
                              <p className="text-sm font-semibold text-slate-800 mt-1.5 leading-snug">
                                {iss.action}
                              </p>
                            </div>
                          ) : null}
                          <p className="text-[11px] text-slate-400 mt-3 font-medium">
                            {expanded.has(iss.issueId)
                              ? "Hide details"
                              : "Show full analysis & counter-language"}
                          </p>
                        </button>
                        {expanded.has(iss.issueId) && (
                          <div className="px-5 pb-5 pt-1 border-t border-slate-100 bg-slate-50/50">
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <Label>Problem</Label>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                  {iss.problem || iss.buyerImpactSummary || "—"}
                                </p>
                              </div>
                              {iss.action ? (
                                <div className="sm:col-span-2">
                                  <Label>Action</Label>
                                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                    {iss.action}
                                  </p>
                                </div>
                              ) : null}
                              {whatChanged ? (
                                <div>
                                  <Label>What changed</Label>
                                  <p className="text-sm text-slate-700 leading-relaxed">
                                    {whatChanged}
                                  </p>
                                </div>
                              ) : null}
                              {whyMatters ? (
                                <div>
                                  <Label>Why it matters</Label>
                                  <p className="text-sm text-slate-700 leading-relaxed">
                                    {whyMatters}
                                  </p>
                                </div>
                              ) : null}
                              {d?.whatToDo ? (
                                <div className="sm:col-span-2">
                                  <Label>What to do</Label>
                                  <p className="text-sm text-slate-700 leading-relaxed">
                                    {d.whatToDo}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            {counterText ? (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCounter(iss.issueId);
                                  }}
                                  className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 hover:text-blue-600"
                                >
                                  Counter language{" "}
                                  {counterOpen.has(iss.issueId) ? "▼" : "▶"}
                                </button>
                                {counterOpen.has(iss.issueId) ? (
                                  <LangBlock variant="counter">
                                    {counterText}
                                  </LangBlock>
                                ) : null}
                              </div>
                            ) : null}
                            {detailedView && (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                {d?.confidence ? (
                                  <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-1 rounded">
                                    Confidence: {d.confidence}
                                  </span>
                                ) : null}
                                {d?.marketContext ? (
                                  <span className="bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded max-w-full">
                                    Market: {d.marketContext}
                                  </span>
                                ) : null}
                              </div>
                            )}
                            {hasLegacyExtra ? (
                              <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                  Additional detail (legacy fields)
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                  {iss.baselineLanguageSummary ? (
                                    <div>
                                      <Label>Baseline language</Label>
                                      <LangBlock variant="baseline">
                                        {iss.baselineLanguageSummary}
                                      </LangBlock>
                                    </div>
                                  ) : null}
                                  {iss.revisedLanguageSummary ? (
                                    <div>
                                      <Label>Revised language</Label>
                                      <LangBlock variant="revised">
                                        {iss.revisedLanguageSummary}
                                      </LangBlock>
                                    </div>
                                  ) : null}
                                  {iss.supplierLikelyIntent ? (
                                    <div className="col-span-2">
                                      <Label>
                                        Supplier intent (inference)
                                      </Label>
                                      <p className="text-sm text-slate-700 leading-relaxed">
                                        {iss.supplierLikelyIntent}
                                      </p>
                                    </div>
                                  ) : null}
                                  {iss.severityRationale ? (
                                    <div className="col-span-2">
                                      <Label>Severity rationale</Label>
                                      <p className="text-sm text-slate-700 leading-relaxed">
                                        {iss.severityRationale}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                                {iss.internalReviewers &&
                                iss.internalReviewers.length > 0 ? (
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
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          {/* RISK — layout matches stakeholder mockup: 4 cards, tinted canvas */}
          {tab === "risk" &&
            (!analysis ? (
              <Empty icon="◈" label="No risk summary yet" />
            ) : (
              <div className="max-w-4xl mx-auto space-y-5">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 shadow-sm p-6">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em] mb-4">
                    Where they&apos;re pushing
                  </h4>
                  <ul className="divide-y divide-slate-200/70">
                    {(analysis.riskSummary?.whereTheyrePushing || []).map(
                      (row, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
                        >
                          <span className="text-sm text-slate-800 font-medium leading-snug min-w-0 flex-1 pr-2">
                            {row.area}
                          </span>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-md border shrink-0 ${pushLevelClass(row.level)}`}
                          >
                            {row.level || "—"}
                          </span>
                        </li>
                      )
                    )}
                    {(analysis.riskSummary?.whereTheyrePushing || []).length ===
                      0 && (
                      <li className="text-sm text-slate-400 py-2">
                        None listed.
                      </li>
                    )}
                  </ul>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50 shadow-sm p-6">
                    <h4 className="text-[11px] font-bold text-blue-700 uppercase tracking-[0.16em] mb-4">
                      Where you&apos;re safe
                    </h4>
                    <ul className="space-y-3">
                      {(analysis.riskSummary?.whereYoureSafe || []).map(
                        (line, i) => (
                          <li
                            key={i}
                            className="text-sm text-slate-800 leading-relaxed flex gap-3"
                          >
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold"
                              aria-hidden
                            >
                              ✓
                            </span>
                            <span className="min-w-0 pt-0.5">
                              {detailedView ? line : previewText(line, 220)}
                            </span>
                          </li>
                        )
                      )}
                      {(analysis.riskSummary?.whereYoureSafe || []).length ===
                        0 && (
                        <li className="text-sm text-slate-400">None listed.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50 shadow-sm p-6">
                    <h4 className="text-[11px] font-bold text-blue-700 uppercase tracking-[0.16em] mb-4">
                      Where to push back
                    </h4>
                    <ul className="space-y-3">
                      {(analysis.riskSummary?.whereToPushBack || []).map(
                        (line, i) => (
                          <li
                            key={i}
                            className="text-sm text-slate-800 leading-relaxed flex gap-3"
                          >
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold"
                              aria-hidden
                            >
                              →
                            </span>
                            <span className="min-w-0 pt-0.5">
                              {detailedView ? line : previewText(line, 220)}
                            </span>
                          </li>
                        )
                      )}
                      {(analysis.riskSummary?.whereToPushBack || []).length ===
                        0 && (
                        <li className="text-sm text-slate-400">None listed.</li>
                      )}
                    </ul>
                  </div>
                </div>
                {showNegotiationCard ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50 shadow-sm p-6">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em] mb-1">
                      Negotiation playbook
                    </h4>
                    <p className="text-xs text-slate-500 mb-4">
                      Severity matches the issue register (Critical → Low). Use
                      it to see what matters most in the room.
                    </p>
                    {negPlanOk ? (
                      <div className="space-y-4">
                        {(negPlan?.context || "").trim() ? (
                          <p className="text-sm text-slate-800 leading-relaxed border-b border-slate-200/80 pb-4">
                            {negPlan?.context}
                          </p>
                        ) : null}
                        {negPlanItems.length > 0 ? (
                          <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                              Priority moves
                            </h5>
                            <ol className="space-y-3 list-none m-0 p-0">
                              {negPlanItems.map((it, idx) => (
                                <li
                                  key={idx}
                                  className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
                                >
                                  <div className="flex flex-wrap items-center gap-2 gap-y-1 mb-2">
                                    <span className="text-xs font-black text-slate-400 tabular-nums w-6 shrink-0">
                                      {idx + 1}.
                                    </span>
                                    <span
                                      className={`text-xs font-bold px-2 py-0.5 rounded-md border shrink-0 ${SEV_COLORS[it.severity]}`}
                                    >
                                      {it.severity}
                                    </span>
                                    {it.headline ? (
                                      <span className="text-sm font-bold text-slate-900 min-w-0">
                                        {it.headline}
                                      </span>
                                    ) : null}
                                  </div>
                                  {it.detail ? (
                                    <p className="text-sm text-slate-700 leading-relaxed pl-8">
                                      {it.detail}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                        {negPlanChecklist.length > 0 ? (
                          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 mb-2">
                              Before you sign
                            </h5>
                            <ul className="space-y-2 m-0 p-0 list-none">
                              {negPlanChecklist.map((line, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-slate-800 leading-relaxed flex gap-2"
                                >
                                  <span
                                    className="text-emerald-600 font-bold shrink-0"
                                    aria-hidden
                                  >
                                    ✓
                                  </span>
                                  <span>{line}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {legacyNegotiationParagraphs(negRaw).map((para, i) => (
                          <p
                            key={i}
                            className="text-sm text-slate-800 leading-relaxed"
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                    )}
                    {negPlanOk && negRaw ? (
                      <details className="mt-4 rounded-lg border border-slate-200 bg-white/60 px-3 py-2 text-sm">
                        <summary className="cursor-pointer font-semibold text-slate-600 text-xs">
                          Raw negotiation text from model
                        </summary>
                        <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {riskSummary?.negotiationNotes}
                        </p>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}

          {/* TRADE */}
          {tab === "trade" &&
            (!analysis ? (
              <Empty icon="⇄" label="No trade / negotiation mapping yet" />
            ) : (
              <div className="max-w-6xl mx-auto space-y-10">
                <section>
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em] mb-2">
                    Trade / Negotiation Mapping
                  </h3>
                  <p className="text-sm text-slate-600 mb-4 max-w-2xl">
                    Sorted by risk (Critical first). Each row is numbered;{" "}
                    <strong className="font-semibold text-slate-700">
                      severity
                    </strong>{" "}
                    matches the issue register. Open linked issues to see full
                    clauses.
                  </p>
                  {sortedTrades.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-slate-400 text-sm shadow-sm">
                      No trade pairs in this analysis.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-left">
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-10 align-top">
                              #
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[88px] align-top">
                              Risk
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[22%] align-top">
                              Topic
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 align-top">
                              Give
                            </th>
                            <th className="px-1 py-2.5 text-center text-slate-400 text-xs font-bold align-top">
                              ⇄
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 align-top">
                              Get
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[20%] align-top">
                              Issues
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTrades.map((row, i) => {
                            const sev = tradeRowSeverity(row);
                            const ids = row.linkedIssueIds || [];
                            return (
                              <tr
                                key={i}
                                className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/60"
                              >
                                <td className="px-3 py-3 text-xs font-black text-slate-400 tabular-nums align-top">
                                  {i + 1}
                                </td>
                                <td className="px-3 py-3 align-top">
                                  <span
                                    className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-md border ${SEV_COLORS[sev]}`}
                                  >
                                    {sev}
                                  </span>
                                </td>
                                <td className="px-3 py-3 align-top font-semibold text-slate-900">
                                  {(row.topic || "").trim() || (
                                    <span className="text-slate-400 font-normal italic">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-slate-700 leading-relaxed align-top">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800/80 block mb-0.5 sm:hidden">
                                    Give
                                  </span>
                                  {detailedView
                                    ? row.give
                                    : previewText(row.give || "—", 200)}
                                </td>
                                <td className="px-1 py-3 text-center text-slate-300 text-lg align-top hidden sm:table-cell">
                                  ⇄
                                </td>
                                <td className="px-3 py-3 text-slate-700 leading-relaxed align-top border-t border-slate-50 sm:border-t-0">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-green-800/80 block mb-0.5 sm:hidden">
                                    Get
                                  </span>
                                  {detailedView
                                    ? row.get
                                    : previewText(row.get || "—", 200)}
                                </td>
                                <td className="px-3 py-3 align-top">
                                  {ids.length === 0 ? (
                                    <span className="text-xs text-slate-400">
                                      —
                                    </span>
                                  ) : (
                                    <div className="flex flex-col gap-1.5">
                                      {ids.map((id) => {
                                        const iss = issueById.get(id);
                                        return (
                                          <button
                                            key={id}
                                            type="button"
                                            onClick={() => jumpToIssue(id)}
                                            className="text-left text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline rounded px-1 -mx-1 py-0.5"
                                          >
                                            {iss ? (
                                              <>
                                                <span className="font-mono text-slate-500">
                                                  {id}
                                                </span>
                                                <span className="text-slate-600 font-normal">
                                                  {" "}
                                                  ·{" "}
                                                  {previewText(
                                                    iss.clauseTitle,
                                                    48
                                                  )}
                                                </span>
                                              </>
                                            ) : (
                                              <span className="font-mono">
                                                {id}
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em] mb-2">
                    BATNA &amp; negotiation floor
                  </h3>
                  <p className="text-sm text-slate-600 mb-4 max-w-3xl leading-relaxed">
                    For each theme: what the supplier is demanding, where you
                    want to land, your minimum acceptable position, and your
                    best alternative if the deal does not close. Use the
                    walk-away and BATNA columns to anchor discipline in the
                    room—not as legal advice.
                  </p>
                  {nonemptyBatnaRows(analysis.tradeStrategy?.batnaTable)
                    .length === 0 ? (
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-slate-400 text-sm shadow-sm">
                      No BATNA table rows in this analysis. Re-run with the
                      latest app version, or the model may have omitted this
                      block.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                      <table className="w-full min-w-[720px] text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left">
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[11%] align-top">
                              Topic
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[17%] align-top">
                              Their ask
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[17%] align-top">
                              Our target
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[17%] align-top">
                              Walk-away
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[20%] align-top">
                              Our BATNA
                            </th>
                            <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-[18%] align-top">
                              Leverage
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {nonemptyBatnaRows(
                            analysis.tradeStrategy?.batnaTable
                          ).map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                            >
                              <td className="px-3 py-3 align-top font-semibold text-slate-900">
                                {row.topic || "—"}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-700 leading-relaxed">
                                {detailedView
                                  ? row.theirAsk || "—"
                                  : previewText(row.theirAsk || "—", 160)}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-700 leading-relaxed">
                                {detailedView
                                  ? row.ourTarget || "—"
                                  : previewText(row.ourTarget || "—", 160)}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-700 leading-relaxed border-l border-amber-100/80 bg-amber-50/25">
                                {detailedView
                                  ? row.ourWalkAway || "—"
                                  : previewText(row.ourWalkAway || "—", 140)}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-700 leading-relaxed border-l border-indigo-100/80 bg-indigo-50/20">
                                {detailedView
                                  ? row.ourBatna || "—"
                                  : previewText(row.ourBatna || "—", 160)}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-600 leading-relaxed text-xs">
                                {detailedView
                                  ? row.leverageNote || "—"
                                  : previewText(row.leverageNote || "—", 120)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
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
