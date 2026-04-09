import { NextResponse } from "next/server";
import {
  getContract,
  listClausesForContract,
} from "@/lib/server/repository-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const contract = getContract(id);
  if (!contract) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const clauseRecords = listClausesForContract(id);
  return NextResponse.json({ contract, clauseRecords });
}
