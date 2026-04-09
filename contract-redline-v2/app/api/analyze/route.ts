import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";

/** Vercel Pro: up to 300s. Hobby caps serverless at ~10s — upgrade or use shorter docs. */
export const maxDuration = 300;
export const runtime = "nodejs";

const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
const anthropicClient = anthropicApiKey
  ? new Anthropic({ apiKey: anthropicApiKey })
  : null;

/** Lazy-load parsers so a Vercel bundle/init issue returns JSON instead of an HTML 500. */
async function pdfBufferToText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function fileExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const i = lower.lastIndexOf(".");
  return i >= 0 ? lower.slice(i) : "";
}

/** When extension is missing or wrong (e.g. export without suffix). */
function sniffBinaryFormat(buffer: Buffer): ".pdf" | ".doc" | ".docx" | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return ".pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return ".doc";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return ".docx";
  }
  return null;
}

function resolveExtension(filename: string, buffer: Buffer): string {
  const ext = fileExtension(filename);
  if (ext && [".pdf", ".doc", ".docx", ".txt"].includes(ext)) return ext;
  return sniffBinaryFormat(buffer) || ext || "";
}

async function legacyDocBufferToText(buffer: Buffer): Promise<string> {
  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const parts = [
    doc.getBody(),
    doc.getFootnotes(),
    doc.getEndnotes(),
    doc.getHeaders(),
  ].filter((s) => typeof s === "string" && s.trim().length > 0);
  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("No text could be extracted from this DOC file");
  return text;
}

async function docxBufferToText(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer });
  const text = (value || "").trim();
  if (!text) throw new Error("No text could be extracted from this DOCX file");
  return text;
}

async function bufferToContractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const ext = resolveExtension(filename, buffer);
  switch (ext) {
    case ".pdf":
      return pdfBufferToText(buffer);
    case ".docx":
      return docxBufferToText(buffer);
    case ".doc":
      return legacyDocBufferToText(buffer);
    case ".txt":
      return buffer.toString("utf8");
    default:
      throw new Error(
        `Unsupported file type "${ext || "unknown"}". Use PDF, DOC, DOCX, or TXT.`
      );
  }
}

const OUTPUT_RULES = `
OUTPUT RULES (strict):
- Active voice only. No passive voice, no filler, no legal-essay tone.
- problem/action/oneLineBlunt: blunt, buyer-focused ("Buyer owns X" not "risk is created").
- If overallRisk is High or Critical but no issue has severity Critical, set executiveSummary.cumulativeRiskNote to explain cumulative exposure OR add at least one Critical issue.
- Every tradeMap row MUST set severity and linkedIssueIds to match the issue register (same Critical/High/Medium/Low as the linked issues). Number trades in order of severity (Critical first).
- Put negotiation strategy in riskSummary.negotiationPlan (context + severity-tagged items + checklist). Do not dump long unstructured paragraphs into negotiationNotes.
- Escape " as \\" and newlines in strings as \\n. Return ONLY valid JSON, no markdown.
`;

const SYSTEM_PROMPT = `You are a senior commercial + contracts lead reviewing supplier redlines on industrial/OEM supply deals (transformers, switchgear, power equipment).

Goal: a busy exec understands overall risk, top problems, and what to do in under 30 seconds skimming.

${OUTPUT_RULES}

Up to 12 issues. Each issue: one-line problem, one-line action; put depth in details (max 2 lines each field).
Include 4–8 rows in tradeStrategy.batnaTable for the highest-stakes negotiation themes (not every minor clause).

Return ONLY valid JSON:
{
  "executiveSummary": {
    "overallRisk": "Critical|High|Medium|Low",
    "oneLineBlunt": "One blunt sentence on supplier posture and main buyer exposures.",
    "ifYouDoNothing": ["max 3 bullets: what gets worse if buyer accepts as-is"],
    "top3MustFix": [
      { "clauseReference": "3.5.1", "title": "Short title", "problem": "One line", "action": "One line" }
    ],
    "cumulativeRiskNote": "If overall is High/Critical with no Critical issues: explain cumulative exposure; else empty string"
  },
  "issues": [{
    "issueId": "001",
    "clauseReference": "3.5.1",
    "clauseTitle": "Drawing Review",
    "primaryCategory": "Delivery/Schedule",
    "severity": "Critical|High|Medium|Low",
    "problem": "One line, active voice",
    "action": "One line: what buyer should do",
    "details": {
      "whatChanged": "max 2 lines",
      "whyItMatters": "max 2 lines",
      "whatToDo": "max 2 lines",
      "counterLanguage": "suggested counter wording",
      "confidence": "High|Medium|Low",
      "marketContext": "Common supplier position|More aggressive than typical|Unusual / high-risk deviation"
    }
  }],
  "riskSummary": {
    "whereTheyrePushing": [{ "area": "Schedule", "level": "High|Medium|Low" }],
    "whereYoureSafe": ["short items"],
    "whereToPushBack": ["top 2-3 category or theme names"],
    "negotiationNotes": "Optional 1 sentence only if negotiationPlan is empty; otherwise leave empty string",
    "negotiationPlan": {
      "context": "2-4 sentences: parties, leverage, overall posture — not a wall of text",
      "items": [
        {
          "severity": "Critical|High|Medium|Low",
          "headline": "Short label e.g. Tariff pass-through",
          "detail": "What to do in the room; reference trades or issues by theme"
        }
      ],
      "checklist": ["before-signing items: appendices, studies, approvals"]
    }
  },
  "tradeStrategy": {
    "tradeMap": [
      {
        "topic": "short theme e.g. Tariffs, Acceptance, Guaranty",
        "give": "what buyer might concede",
        "get": "what buyer must get in return",
        "severity": "Critical|High|Medium|Low — must match how you rated the underlying risk in issues[]",
        "linkedIssueIds": ["001", "003"]
      }
    ],
    "batnaTable": [
      {
        "topic": "short row label e.g. Acceptance, Liability cap, LDs",
        "theirAsk": "supplier redline / what they are demanding (one line)",
        "ourTarget": "buyer's ideal outcome for this topic",
        "ourWalkAway": "minimum acceptable / walk-away boundary if supplier will not move",
        "ourBatna": "buyer's best alternative if this deal fails — timing, cost, alternate supplier or scope",
        "leverageNote": "one line: how to use BATNA or walk-away in the conversation"
      }
    ]
  }
}`;

const SYSTEM_PROMPT_QUICK = `Same role and tone as full analysis, faster scan.

${OUTPUT_RULES}

At most 8 issues. Shorter strings everywhere. Include 3–5 batnaTable rows (same fields, terse text).

Return ONLY valid JSON (same schema as full mode):
{
  "executiveSummary": {
    "overallRisk": "Critical|High|Medium|Low",
    "oneLineBlunt": "one sentence",
    "ifYouDoNothing": ["bullet", "bullet", "bullet"],
    "top3MustFix": [
      { "clauseReference": "x", "title": "x", "problem": "one line", "action": "one line" }
    ],
    "cumulativeRiskNote": ""
  },
  "issues": [{
    "issueId": "001",
    "clauseReference": "",
    "clauseTitle": "",
    "primaryCategory": "",
    "severity": "High",
    "problem": "",
    "action": "",
    "details": {
      "whatChanged": "",
      "whyItMatters": "",
      "whatToDo": "",
      "counterLanguage": "",
      "confidence": "Medium",
      "marketContext": "Common supplier position"
    }
  }],
  "riskSummary": {
    "whereTheyrePushing": [{ "area": "", "level": "High" }],
    "whereYoureSafe": [""],
    "whereToPushBack": [""],
    "negotiationNotes": "",
    "negotiationPlan": {
      "context": "",
      "items": [{ "severity": "High", "headline": "", "detail": "" }],
      "checklist": [""]
    }
  },
  "tradeStrategy": {
    "tradeMap": [
      {
        "topic": "",
        "give": "",
        "get": "",
        "severity": "High",
        "linkedIssueIds": ["001"]
      }
    ],
    "batnaTable": [
      {
        "topic": "",
        "theirAsk": "",
        "ourTarget": "",
        "ourWalkAway": "",
        "ourBatna": "",
        "leverageNote": ""
      }
    ]
  }
}`;

const fullAnalysisMode =
  process.env.CONTRACT_ANALYSIS_MODE?.trim().toLowerCase() === "full";

const anthropicModel =
  process.env.ANTHROPIC_MODEL?.trim() ||
  (fullAnalysisMode ? "claude-sonnet-4-5" : "claude-haiku-4-5");

/** Quick mode needs enough room for 8 rich issue objects; too low causes truncated JSON. */
const anthropicMaxTokens = fullAnalysisMode ? 16000 : 12288;

const quickModeMaxDocChars = Math.min(
  500_000,
  Math.max(
    20_000,
    Number(process.env.CONTRACT_ANALYSIS_QUICK_MAX_CHARS || 120_000) || 120_000
  )
);

function extractJsonObjectSlice(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return text.slice(start, end + 1);
}

function parseModelJsonObject(text: string): unknown {
  const slice = extractJsonObjectSlice(text);
  try {
    return JSON.parse(slice);
  } catch (first) {
    try {
      return JSON.parse(jsonrepair(slice));
    } catch {
      const hint =
        first instanceof Error ? first.message : "Invalid JSON from model";
      throw new Error(
        `Model returned invalid JSON (${hint}). Try again, or use CONTRACT_ANALYSIS_MODE=full with a shorter document.`
      );
    }
  }
}

type NormalizedSeverity = "Critical" | "High" | "Medium" | "Low";

function coerceIssueSeverity(raw: string): NormalizedSeverity {
  const x = raw.trim().toLowerCase();
  if (x.startsWith("crit")) return "Critical";
  if (x.startsWith("high")) return "High";
  if (x.startsWith("low")) return "Low";
  if (x.startsWith("med")) return "Medium";
  return "Medium";
}

function clipForQuickMode(text: string, label: string): string {
  if (fullAnalysisMode || text.length <= quickModeMaxDocChars) return text;
  return (
    text.slice(0, quickModeMaxDocChars) +
    `\n\n[--- ${label} truncated from ${text.length} to ${quickModeMaxDocChars} characters for quick analysis. Set CONTRACT_ANALYSIS_MODE=full to send the whole document. ---]`
  );
}

function normalizeAnalysis(raw: Record<string, unknown>): Record<string, unknown> {
  const es = (raw.executiveSummary as Record<string, unknown>) || {};
  raw.executiveSummary = {
    ...es,
    overallRisk: es.overallRisk ?? "Medium",
    oneLineBlunt:
      typeof es.oneLineBlunt === "string"
        ? es.oneLineBlunt
        : typeof es.supplierPosture === "string"
          ? es.supplierPosture
          : "",
    ifYouDoNothing: Array.isArray(es.ifYouDoNothing)
      ? es.ifYouDoNothing
      : [],
    top3MustFix: Array.isArray(es.top3MustFix) ? es.top3MustFix : [],
    cumulativeRiskNote:
      typeof es.cumulativeRiskNote === "string" ? es.cumulativeRiskNote : "",
  };

  const issuesIn = Array.isArray(raw.issues) ? raw.issues : [];
  raw.issues = issuesIn.map((item: unknown) => {
    const i = item as Record<string, unknown>;
    const d = (i.details as Record<string, unknown>) || {};
    return {
      ...i,
      problem: String(i.problem ?? i.buyerImpactSummary ?? ""),
      action: String(i.action ?? i.recommendedAction ?? ""),
      details: {
        whatChanged: String(d.whatChanged ?? i.whatChanged ?? ""),
        whyItMatters: String(d.whyItMatters ?? i.whyItMatters ?? ""),
        whatToDo: String(d.whatToDo ?? ""),
        counterLanguage: String(
          d.counterLanguage ?? i.suggestedCounterLanguage ?? i.fallbackPosition ?? ""
        ),
        confidence: String(d.confidence ?? "Medium"),
        marketContext: String(
          d.marketContext ?? "Common supplier position"
        ),
      },
    };
  });

  const rs = (raw.riskSummary as Record<string, unknown>) || {};
  const planRaw = rs.negotiationPlan;
  let negotiationPlan: Record<string, unknown> | undefined;
  if (
    planRaw &&
    typeof planRaw === "object" &&
    !Array.isArray(planRaw)
  ) {
    const p = planRaw as Record<string, unknown>;
    const itemsIn = Array.isArray(p.items) ? p.items : [];
    const items = itemsIn.map((it: unknown) => {
      const x = it as Record<string, unknown>;
      return {
        severity: coerceIssueSeverity(String(x.severity ?? "Medium")),
        headline: String(x.headline ?? x.title ?? ""),
        detail: String(x.detail ?? x.body ?? x.text ?? ""),
      };
    });
    const checklistIn = Array.isArray(p.checklist) ? p.checklist : [];
    const checklist = checklistIn.map((c: unknown) => String(c)).filter(Boolean);
    const context = String(p.context ?? "");
    if (
      context.trim() ||
      items.some(
        (i: { headline: string; detail: string }) =>
          i.headline.trim() || i.detail.trim()
      ) ||
      checklist.length > 0
    ) {
      negotiationPlan = { context, items, checklist };
    }
  }

  raw.riskSummary = {
    ...rs,
    whereTheyrePushing: Array.isArray(rs.whereTheyrePushing)
      ? rs.whereTheyrePushing
      : [],
    whereYoureSafe: Array.isArray(rs.whereYoureSafe) ? rs.whereYoureSafe : [],
    whereToPushBack: Array.isArray(rs.whereToPushBack)
      ? rs.whereToPushBack
      : [],
    negotiationNotes:
      typeof rs.negotiationNotes === "string" ? rs.negotiationNotes : "",
    ...(negotiationPlan ? { negotiationPlan } : {}),
  };

  const ts = (raw.tradeStrategy as Record<string, unknown>) || {};
  const batnaIn = Array.isArray(ts.batnaTable) ? ts.batnaTable : [];
  const tradeMapIn = Array.isArray(ts.tradeMap) ? ts.tradeMap : [];
  raw.tradeStrategy = {
    tradeMap: tradeMapIn.map((item: unknown) => {
      const t = item as Record<string, unknown>;
      const idsRaw = t.linkedIssueIds ?? t.issueIds ?? t.links;
      const linkedIssueIds = Array.isArray(idsRaw)
        ? idsRaw.map((id: unknown) => String(id).trim()).filter(Boolean)
        : [];
      return {
        topic: String(t.topic ?? t.theme ?? ""),
        give: String(t.give ?? ""),
        get: String(t.get ?? ""),
        severity: coerceIssueSeverity(
          String(t.severity ?? t.riskLevel ?? "Medium")
        ),
        linkedIssueIds,
      };
    }),
    batnaTable: batnaIn.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        topic: String(r.topic ?? ""),
        theirAsk: String(
          r.theirAsk ?? r.supplierPosition ?? r.supplierAsk ?? ""
        ),
        ourTarget: String(r.ourTarget ?? ""),
        ourWalkAway: String(
          r.ourWalkAway ?? r.walkAway ?? r.minimumAcceptable ?? ""
        ),
        ourBatna: String(r.ourBatna ?? r.buyerBatna ?? ""),
        leverageNote: String(r.leverageNote ?? r.notes ?? ""),
      };
    }),
  };

  return raw;
}

export async function POST(req: NextRequest) {
  try {
    if (!anthropicClient) {
      return NextResponse.json(
        {
          error:
            "ANTHROPIC_API_KEY is missing. Locally: add it to .env.local and restart npm run dev. On Vercel: Project → Settings → Environment Variables → add ANTHROPIC_API_KEY for Production, then Redeploy.",
        },
        { status: 500 }
      );
    }

    const formData = await req.formData();

    const redlineFile = formData.get("redline") as File | null;
    const baselineFile = formData.get("baseline") as File | null;
    const redlineText = formData.get("redlineText") as string | null;
    const baselineText = formData.get("baselineText") as string | null;
    const contextRaw = formData.get("context");
    const context = JSON.parse(
      (typeof contextRaw === "string" && contextRaw) || "{}"
    );

    let redlineContent = redlineText || "";
    let baselineContent = baselineText || "";

    if (redlineFile && redlineFile.size > 0) {
      const buffer = Buffer.from(await redlineFile.arrayBuffer());
      redlineContent = await bufferToContractText(buffer, redlineFile.name);
    }
    if (baselineFile && baselineFile.size > 0) {
      const buffer = Buffer.from(await baselineFile.arrayBuffer());
      baselineContent = await bufferToContractText(buffer, baselineFile.name);
    }

    if (!redlineContent && !baselineContent) {
      return NextResponse.json(
        { error: "No contract content provided" },
        { status: 400 }
      );
    }

    redlineContent = clipForQuickMode(redlineContent, "Redlined contract");
    baselineContent = clipForQuickMode(baselineContent, "Baseline contract");

    const userPrompt = `Analyze the following contract.

Supplier: ${context.supplier || "Unknown"}
Equipment: ${context.equipment || "Industrial Equipment"}
Buyer: ${context.buyer || "Buyer"}
Project: ${context.project || "Project"}
Contract Value: ${context.value || "Undisclosed"}
Focus Areas: ${context.focus || "General review"}
Additional Context: ${context.priorities || "None"}

${baselineContent ? `BASELINE CONTRACT:\n${baselineContent}\n\n` : ""}REDLINED CONTRACT:\n${redlineContent}`;

    const response = await anthropicClient.messages.create({
      model: anthropicModel,
      max_tokens: anthropicMaxTokens,
      system: fullAnalysisMode ? SYSTEM_PROMPT : SYSTEM_PROMPT_QUICK,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = response.content
      .map((b) => ("text" in b ? b.text : ""))
      .join("");
    const analysis = normalizeAnalysis(
      parseModelJsonObject(raw) as Record<string, unknown>
    ) as {
      issues?: { severity: string }[];
      [key: string]: unknown;
    };

    const counts: Record<string, number> = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };
    (analysis.issues ?? []).forEach((i) => {
      if (counts[i.severity] !== undefined) counts[i.severity]++;
    });
    analysis.counts = counts;

    return NextResponse.json(analysis);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Quick check that the route is up (and whether the API key is configured). */
export async function GET() {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return NextResponse.json({
    ok: true,
    anthropicConfigured: hasKey,
  });
}
