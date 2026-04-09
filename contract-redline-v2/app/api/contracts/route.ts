import { NextRequest, NextResponse } from "next/server";
import {
  createContract,
  filterContracts,
  listContracts,
} from "@/lib/server/repository-store";
import type { ContractType } from "@/lib/types/repository";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const type = (searchParams.get("type") || "all") as "all" | ContractType;
  const typeFilter =
    type === "Services" || type === "Materials / Equipment" ? type : "all";
  const all = listContracts();
  return NextResponse.json({ contracts: filterContracts(all, q, typeFilter) });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const contractName = String(body.contractName || "").trim();
    const supplierName = String(body.supplierName || "").trim();
    const clientName = String(body.clientName || "").trim();
    const contractType = body.contractType as ContractType;
    if (!contractName || !supplierName || !clientName) {
      return NextResponse.json(
        { error: "contractName, supplierName, and clientName are required" },
        { status: 400 }
      );
    }
    if (contractType !== "Services" && contractType !== "Materials / Equipment") {
      return NextResponse.json({ error: "Invalid contractType" }, { status: 400 });
    }
    const signedDate = String(body.signedDate || "").trim();
    if (!signedDate) {
      return NextResponse.json({ error: "signedDate is required" }, { status: 400 });
    }
    const c = createContract({
      contractName,
      supplierName,
      clientName,
      contractType,
      equipmentType: body.equipmentType ? String(body.equipmentType) : undefined,
      contractValueBand: body.contractValueBand as
        | import("@/lib/types/repository").ContractValueBand
        | undefined,
      signedDate,
      dealType: body.dealType ? String(body.dealType) : undefined,
      status: body.status as import("@/lib/types/repository").ContractStatus | undefined,
      notes: body.notes ? String(body.notes) : undefined,
      fileUrl: body.fileUrl ? String(body.fileUrl) : undefined,
    });
    return NextResponse.json({ contract: c });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
