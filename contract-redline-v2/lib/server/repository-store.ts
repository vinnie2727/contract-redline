import type {
  ClauseRecord,
  Contract,
  ContractStatus,
  ContractType,
  ContractValueBand,
} from "@/lib/types/repository";

function nowIso() {
  return new Date().toISOString();
}

const seedContracts: Contract[] = [
  {
    id: "C-001",
    contractName: "2022 Distribution Transformers Supply",
    supplierName: "Eaton Corporation",
    clientName: "SMUD",
    contractType: "Materials / Equipment",
    equipmentType: "Distribution Transformers",
    contractValueBand: "$5–20M",
    signedDate: "2022-06-15",
    dealType: "Supply",
    status: "Signed",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "C-002",
    contractName: "2020 Padmount Transformer Supply",
    supplierName: "Eaton Corporation",
    clientName: "SMUD",
    contractType: "Materials / Equipment",
    equipmentType: "Padmount Transformers",
    contractValueBand: "$5–20M",
    signedDate: "2020-11-03",
    dealType: "Supply",
    status: "Expired",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "C-003",
    contractName: "2023 Switchgear Supply Agreement",
    supplierName: "Eaton Corporation",
    clientName: "SMUD",
    contractType: "Materials / Equipment",
    equipmentType: "Switchgear",
    contractValueBand: "$1–5M",
    signedDate: "2023-02-28",
    dealType: "Supply",
    status: "Signed",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "C-005",
    contractName: "2023 Substation Commissioning",
    supplierName: "Eaton Corporation",
    clientName: "SMUD",
    contractType: "Services",
    equipmentType: "Substation",
    contractValueBand: "$1–5M",
    signedDate: "2023-08-22",
    dealType: "Commissioning",
    status: "Signed",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
];

const seedClauses: ClauseRecord[] = [
  {
    id: "CR-001",
    contractId: "C-001",
    clauseFamily: "Limitation of Liability",
    finalSignedValue:
      "Narrow consequential exclusion; LDs capped at 5% of PO value",
    normalizedValue: 70,
    normalizedUnit: "score",
    supplierProposedValue: "Full consequential exclusion including LDs",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "CR-002",
    contractId: "C-002",
    clauseFamily: "Limitation of Liability",
    finalSignedValue: "Moderate exclusion; LDs at 3% of PO, capped at 10%",
    normalizedValue: 60,
    normalizedUnit: "score",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "CR-003",
    contractId: "C-001",
    clauseFamily: "Warranty Duration",
    finalSignedValue: "24 months from delivery",
    normalizedValue: 24,
    normalizedUnit: "months",
    supplierProposedValue: "12 months from shipment",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "CR-004",
    contractId: "C-002",
    clauseFamily: "Warranty Duration",
    finalSignedValue: "18 months from delivery",
    normalizedValue: 18,
    normalizedUnit: "months",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "CR-005",
    contractId: "C-001",
    clauseFamily: "Termination for Convenience",
    finalSignedValue: "ETO charges accepted with receipts required",
    normalizedValue: 65,
    normalizedUnit: "score",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "CR-006",
    contractId: "C-001",
    clauseFamily: "Payment Terms",
    finalSignedValue: "Net 45",
    normalizedValue: 45,
    normalizedUnit: "days",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "CR-007",
    contractId: "C-002",
    clauseFamily: "Payment Terms",
    finalSignedValue: "Net 60",
    normalizedValue: 60,
    normalizedUnit: "days",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
];

declare global {
  var __smudRepoContracts: Contract[] | undefined;
  var __smudRepoClauses: ClauseRecord[] | undefined;
}

function getContracts(): Contract[] {
  if (!globalThis.__smudRepoContracts) {
    globalThis.__smudRepoContracts = seedContracts.map((c) => ({ ...c }));
  }
  return globalThis.__smudRepoContracts;
}

function getClauses(): ClauseRecord[] {
  if (!globalThis.__smudRepoClauses) {
    globalThis.__smudRepoClauses = seedClauses.map((c) => ({ ...c }));
  }
  return globalThis.__smudRepoClauses;
}

export function getClausesArray(): ClauseRecord[] {
  return getClauses();
}

export function listContracts(): Contract[] {
  return [...getContracts()].sort(
    (a, b) => new Date(b.signedDate).getTime() - new Date(a.signedDate).getTime()
  );
}

export function getContract(id: string): Contract | undefined {
  return getContracts().find((c) => c.id === id);
}

export function listClausesForContract(contractId: string): ClauseRecord[] {
  return getClauses().filter((r) => r.contractId === contractId);
}

export interface CreateContractInput {
  contractName: string;
  supplierName: string;
  clientName: string;
  contractType: ContractType;
  equipmentType?: string;
  contractValueBand?: ContractValueBand;
  signedDate: string;
  dealType?: string;
  status?: ContractStatus;
  notes?: string;
  fileUrl?: string;
}

export function createContract(input: CreateContractInput): Contract {
  const t = nowIso();
  const c: Contract = {
    id: crypto.randomUUID(),
    contractName: input.contractName.trim(),
    supplierName: input.supplierName.trim(),
    clientName: input.clientName.trim(),
    contractType: input.contractType,
    equipmentType: input.equipmentType?.trim() || undefined,
    contractValueBand: input.contractValueBand,
    signedDate: input.signedDate,
    dealType: input.dealType?.trim() || undefined,
    status: input.status || "Signed",
    notes: input.notes?.trim() || undefined,
    fileUrl: input.fileUrl?.trim() || undefined,
    createdAt: t,
    updatedAt: t,
  };
  getContracts().push(c);
  return c;
}

export function addClauseRecord(record: Omit<ClauseRecord, "id" | "createdAt">): ClauseRecord {
  const r: ClauseRecord = {
    ...record,
    id: crypto.randomUUID(),
    createdAt: nowIso(),
  };
  getClauses().push(r);
  return r;
}

export function filterContracts(
  list: Contract[],
  q: string,
  typeFilter: "all" | ContractType
): Contract[] {
  const qq = q.trim().toLowerCase();
  return list.filter((c) => {
    if (typeFilter !== "all" && c.contractType !== typeFilter) return false;
    if (!qq) return true;
    return (
      c.contractName.toLowerCase().includes(qq) ||
      c.supplierName.toLowerCase().includes(qq)
    );
  });
}
