import type { ContractType } from "@/lib/types/repository";

const STYLES: Record<ContractType, { color: string; bg: string }> = {
  "Materials / Equipment": { color: "#0c5460", bg: "#d1ecf1" },
  Services: { color: "#856404", bg: "#fff3cd" },
};

export function TypePill({ type }: { type: ContractType }) {
  const s = STYLES[type];
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {type === "Materials / Equipment" ? "M&E" : "Svc"}
    </span>
  );
}
