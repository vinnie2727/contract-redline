import type { AcceptabilityBand } from "@/lib/types/repository";
import { BAND_CONFIG } from "@/lib/types/repository";

export function BenchmarkTrack({
  position,
  band,
  compact,
  supplierLabel,
}: {
  position: number;
  band: AcceptabilityBand;
  compact?: boolean;
  supplierLabel: string;
}) {
  const p = Math.max(0, Math.min(1, position));
  const c = BAND_CONFIG[band];
  const trackH = compact ? 6 : 8;
  const dot = compact ? 12 : 22;
  const zoneLeftPct = 37;
  const zoneWidthPct = 26;

  return (
    <div className="w-full">
      <div
        className={`flex justify-between items-center ${compact ? "text-[9px] mb-0.5" : "text-[10px] mb-1"} text-slate-500`}
      >
        <span style={{ color: c.color }} className="font-semibold">
          ● {supplierLabel} asks
        </span>
        <span className="text-[#1a7a3a] font-semibold">██ Signed range</span>
      </div>
      <div
        className="relative w-full rounded-full bg-[#eceef1] overflow-visible"
        style={{ height: Math.max(trackH, compact ? 10 : 14) }}
      >
        <div
          className="absolute rounded-full bg-[#c8e6c9] border border-[#81c784]"
          style={{
            left: `${zoneLeftPct}%`,
            width: `${zoneWidthPct}%`,
            top: "50%",
            height: compact ? 10 : 12,
            transform: "translateY(-50%)",
            marginTop: compact ? 0 : 0,
          }}
        />
        <div
          className="absolute rounded-full shadow-md border-[3px] border-white box-content"
          style={{
            width: dot,
            height: dot,
            left: `calc(${p * 100}% - ${dot / 2}px)`,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: c.color,
            boxShadow: `0 0 0 1px ${c.color}`,
          }}
        />
      </div>
      <div
        className={`flex justify-between ${compact ? "text-[8px] mt-0.5" : "text-[9px] mt-1"} text-slate-400`}
      >
        <span>← More aggressive</span>
        <span>More favorable →</span>
      </div>
    </div>
  );
}
