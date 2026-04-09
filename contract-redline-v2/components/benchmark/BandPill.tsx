import type { AcceptabilityBand } from "@/lib/types/repository";
import { BAND_CONFIG } from "@/lib/types/repository";

export function BandPill({
  band,
  className = "",
}: {
  band: AcceptabilityBand;
  className?: string;
}) {
  const c = BAND_CONFIG[band];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${className}`}
      style={{
        color: c.color,
        backgroundColor: c.bg,
        borderColor: `${c.color}40`,
      }}
    >
      <span aria-hidden>{c.icon}</span>
      {c.label}
    </span>
  );
}
