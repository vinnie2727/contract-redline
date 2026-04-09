import { NextRequest, NextResponse } from "next/server";
import { getBenchmarkResults } from "@/lib/benchmark/engine";
import { getClausesArray, listContracts } from "@/lib/server/repository-store";
import type { ContractType } from "@/lib/types/repository";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      supplierName?: string;
      clientName?: string;
      contractType?: ContractType;
      issues?: {
        issueId: string;
        primaryCategory: string;
        clauseTitle: string;
        problem: string;
        supplierAsk?: string;
      }[];
    };
    const contractType = body.contractType;
    if (contractType !== "Services" && contractType !== "Materials / Equipment") {
      return NextResponse.json({ error: "contractType is required" }, { status: 400 });
    }
    const issues = body.issues || [];
    const results = getBenchmarkResults(
      issues.map((i) => ({
        issueId: i.issueId,
        primaryCategory: i.primaryCategory || "",
        clauseTitle: i.clauseTitle || "",
        problem: i.problem || "",
        supplierAsk:
          (i.supplierAsk && String(i.supplierAsk).trim()) ||
          i.problem ||
          i.clauseTitle ||
          "",
      })),
      body.supplierName || "",
      body.clientName || "",
      contractType,
      listContracts(),
      getClausesArray()
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
