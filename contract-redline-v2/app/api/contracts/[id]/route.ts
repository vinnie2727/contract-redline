import { NextResponse } from "next/server";
import {
  getContract,
  deleteContract,
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const deleted = deleteContract(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
