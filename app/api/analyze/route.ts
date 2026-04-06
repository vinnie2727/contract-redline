import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";

export const maxDuration = 60;
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

const SYSTEM_PROMPT = `You are an expert contract redline review agent for large industrial OEM supply agreements — especially transformer, switchgear, and power equipment contracts. You think like a senior commercial contracts lead, procurement strategist, and practical in-house counsel partner.

Your role: analyze a supplier-redlined contract and identify edits that materially affect the buyer's legal, commercial, financial, and operational risk.

For each meaningful edit:
1. Identify what changed
2. Classify by category (from: Pricing/Escalation, Payment Terms, Taxes/Duties/Freight, Delivery/Schedule, Delay Damages/LDs, Title/Risk of Loss, Warranty, Performance Guarantees, Inspection/Testing/Acceptance, Limitation of Liability, Indemnity, Insurance, Change Orders/Variations, Termination, Suspension, Force Majeure, Compliance/Regulatory, Cyber/Software/Data, IP/Confidentiality, Assignment/Subcontracting, Spare Parts/Service Support, Claims Procedure/Notice, Dispute Resolution/Governing Law, Miscellaneous/Admin)
3. Assess severity: Critical / High / Medium / Low
4. Explain practical impact in plain English (2-3 sentences, no legalese, focus on buyer impact)
5. Infer supplier's likely intent (label as inference)
6. Recommend: Accept / Accept with note / Counter / Reject / Escalate
7. Suggest fallback counter language

Be concise — 1-3 sentences per field max. Focus on the most commercially significant issues (up to 20). Do not pad. Prioritize JSON completeness over field depth.

JSON: escape " as \\" and newlines inside strings as \\n so the response is strictly valid JSON.

Return ONLY valid JSON, no markdown, no preamble:
{
  "executiveSummary": {
    "overallRisk": "Critical|High|Medium|Low",
    "supplierPosture": "one paragraph",
    "top5Issues": ["...", "...", "...", "...", "..."],
    "recommendedActions": ["...", "...", "..."]
  },
  "issues": [{
    "issueId": "001",
    "clauseReference": "18.2",
    "clauseTitle": "Limitation of Liability",
    "changeType": "Substitution",
    "primaryCategory": "Limitation of Liability",
    "secondaryCategories": ["Warranty", "Indemnity"],
    "severity": "Critical",
    "buyerImpactSummary": "...",
    "supplierLikelyIntent": "...",
    "baselineLanguageSummary": "...",
    "revisedLanguageSummary": "...",
    "whatChanged": "...",
    "whyItMatters": "...",
    "severityRationale": "...",
    "recommendedAction": "Reject",
    "fallbackPosition": "...",
    "suggestedCounterLanguage": "...",
    "internalReviewers": ["Legal", "Procurement"]
  }],
  "riskSummary": {
    "byCategory": [{ "category": "Limitation of Liability", "risk": "Critical" }],
    "tradableIssues": ["..."],
    "legalEscalation": ["..."],
    "businessDecisions": ["..."],
    "negotiationNotes": "..."
  }
}`;

/** Shorter instructions + fewer issues — default for local/testing (faster, cheaper). */
const SYSTEM_PROMPT_QUICK = `You review supplier-redlined industrial/OEM supply contracts (e.g. transformers, switchgear). Flag edits that materially hurt the buyer.

Rules: At most 8 issues total. One short sentence per string field (two max for buyerImpactSummary). Skip minor wording. Same categories and severities as a full review.

JSON rules: Use double quotes only. Inside every string value, escape " as \\" and line breaks as \\n — the output must be one parseable JSON object with no raw newlines inside strings.

Return ONLY valid JSON, no markdown, no preamble:
{
  "executiveSummary": {
    "overallRisk": "Critical|High|Medium|Low",
    "supplierPosture": "one short paragraph",
    "top5Issues": ["...", "...", "...", "...", "..."],
    "recommendedActions": ["...", "...", "..."]
  },
  "issues": [{
    "issueId": "001",
    "clauseReference": "18.2",
    "clauseTitle": "Limitation of Liability",
    "changeType": "Substitution",
    "primaryCategory": "Limitation of Liability",
    "secondaryCategories": ["Warranty"],
    "severity": "Critical",
    "buyerImpactSummary": "...",
    "supplierLikelyIntent": "...",
    "baselineLanguageSummary": "...",
    "revisedLanguageSummary": "...",
    "whatChanged": "...",
    "whyItMatters": "...",
    "severityRationale": "...",
    "recommendedAction": "Reject",
    "fallbackPosition": "...",
    "suggestedCounterLanguage": "...",
    "internalReviewers": ["Legal"]
  }],
  "riskSummary": {
    "byCategory": [{ "category": "Limitation of Liability", "risk": "Critical" }],
    "tradableIssues": ["..."],
    "legalEscalation": ["..."],
    "businessDecisions": ["..."],
    "negotiationNotes": "one or two sentences"
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

function clipForQuickMode(text: string, label: string): string {
  if (fullAnalysisMode || text.length <= quickModeMaxDocChars) return text;
  return (
    text.slice(0, quickModeMaxDocChars) +
    `\n\n[--- ${label} truncated from ${text.length} to ${quickModeMaxDocChars} characters for quick analysis. Set CONTRACT_ANALYSIS_MODE=full to send the whole document. ---]`
  );
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
    const analysis = parseModelJsonObject(raw) as {
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
