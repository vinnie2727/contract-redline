import { NextRequest, NextResponse } from "next/server";
import { addClauseRecord, createContract } from "@/lib/server/repository-store";
import { mapIssueTextToClauseFamily } from "@/lib/benchmark/map-family";
import { normalizeAskForFamily } from "@/lib/benchmark/normalize-ask";
import type { ContractType } from "@/lib/types/repository";

export const runtime = "nodejs";

interface IssuePayload {
  issueId: string;
  primaryCategory?: string;
  clauseTitle?: string;
  problem?: string;
  action?: string;
  revisedLanguageSummary?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      contractName?: string;
      supplierName?: string;
      clientName?: string;
      contractType?: ContractType;
      equipmentType?: string;
      contractValueBand?: string;
      signedDate?: string;
      dealType?: string;
      notes?: string;
      issues?: IssuePayload[];
    };
    const contractType = body.contractType;
    if (contractType !== "Services" && contractType !== "Materials / Equipment") {
      return NextResponse.json({ error: "contractType is required" }, { status: 400 });
    }
    const contractName = String(body.contractName || "").trim();
    const supplierName = String(body.supplierName || "").trim();
    const clientName = String(body.clientName || "").trim();
    const signedDate = String(body.signedDate || "").trim();
    if (!contractName || !supplierName || !clientName || !signedDate) {
      return NextResponse.json(
        { error: "contractName, supplierName, clientName, signedDate required" },
        { status: 400 }
      );
    }
    const contract = createContract({
      contractName,
      supplierName,
      clientName,
      contractType,
      equipmentType: body.equipmentType,
      contractValueBand: body.contractValueBand as
        | import("@/lib/types/repository").ContractValueBand
        | undefined,
      signedDate,
      dealType: body.dealType,
      status: "Signed",
      notes: body.notes,
    });

    let clausesCreated = 0;
    for (const iss of body.issues || []) {
      const fam = mapIssueTextToClauseFamily(
        iss.primaryCategory || "",
        iss.clauseTitle || "",
        iss.problem || ""
      );
      if (!fam) continue;
      const proposed =
        iss.revisedLanguageSummary ||
        iss.problem ||
        iss.clauseTitle ||
        "—";
      const finalSigned =
        iss.action ||
        iss.problem ||
        proposed;
      const norm = normalizeAskForFamily(proposed, fam);
      addClauseRecord({
        contractId: contract.id,
        clauseFamily: fam,
        supplierProposedValue: proposed,
        finalSignedValue: finalSigned.slice(0, 500),
        normalizedValue: norm?.value,
        normalizedUnit: norm?.unit,
      });
      clausesCreated += 1;
    }

    return NextResponse.json({ contract, clausesCreated });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
