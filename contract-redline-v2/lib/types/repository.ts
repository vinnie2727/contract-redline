export type ContractType = "Services" | "Materials / Equipment";
export type ContractValueBand = "Under $1M" | "$1–5M" | "$5–20M" | "$20M+";
export type ContractStatus = "Signed" | "Amended" | "Expired";
export type NormalizedUnit =
  | "days"
  | "%"
  | "multiplier"
  | "score"
  | "months"
  | "currency";

export type AcceptabilityBand = 1 | 2 | 3 | 4 | 5;

export type ClauseFamily =
  | "Payment Terms"
  | "Warranty Duration"
  | "Limitation of Liability"
  | "Liquidated Damages"
  | "Indemnity Scope"
  | "Termination for Convenience"
  | "Delivery / Delay Penalties"
  | "Price Escalation"
  | "Governing Law"
  | "Warranty Start Trigger";

export interface Contract {
  id: string;
  contractName: string;
  supplierName: string;
  clientName: string;
  contractType: ContractType;
  equipmentType?: string;
  contractValueBand?: ContractValueBand;
  signedDate: string;
  dealType?: string;
  status: ContractStatus;
  notes?: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClauseRecord {
  id: string;
  contractId: string;
  clauseFamily: ClauseFamily;
  clauseSubtype?: string;
  supplierProposedValue?: string;
  finalSignedValue: string;
  clientPreferredValue?: string;
  normalizedValue?: number;
  normalizedUnit?: NormalizedUnit;
  notes?: string;
  createdAt: string;
}

export interface BenchmarkResult {
  issueId?: string;
  clauseFamily: ClauseFamily;
  currentAsk: string;
  signedRangeLow: string;
  signedRangeHigh: string;
  lastSigned: string;
  normalizedPosition: number;
  band: AcceptabilityBand;
  bandLabel: string;
  verdict: string;
  priorDealCount: number;
  sourceContractIds: string[];
  contractTypeUsed: ContractType;
}

export const BAND_CONFIG: Record<
  AcceptabilityBand,
  { label: string; color: string; bg: string; icon: string }
> = {
  1: {
    label: "Historically Acceptable",
    color: "#1a7a3a",
    bg: "#e6f4ea",
    icon: "✓",
  },
  2: {
    label: "Acceptable w/ Negotiation",
    color: "#4a7a1a",
    bg: "#edf5e0",
    icon: "○",
  },
  3: {
    label: "Borderline / Stretch",
    color: "#92710a",
    bg: "#fef7e0",
    icon: "⚠",
  },
  4: {
    label: "Hard to Accept",
    color: "#b44d12",
    bg: "#fef0e6",
    icon: "✕",
  },
  5: {
    label: "Near Non-Starter",
    color: "#b91c28",
    bg: "#fde8ea",
    icon: "⛔",
  },
};
