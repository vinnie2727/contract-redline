import type { ContractStatus } from "@/lib/types/repository";

const STYLES: Record<ContractStatus, { color: string; bg: string }> = {
  Signed: { color: "#1a7a3a", bg: "#e6f4ea" },
  Expired: { color: "#6c757d", bg: "#e9ecef" },
  Amended: { color: "#92710a", bg: "#fef7e0" },
};

export function StatusPill({ status }: { status: ContractStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {status}
    </span>
  );
}
