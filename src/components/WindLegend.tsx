"use client";
import { ROUTE_WIND_ANGLE_BINS, WIND_BINS_MS } from "@/lib/wind";
import { getArrowIcon } from "@/lib/windIcons";
import { ui, glassSurface } from "@/lib/ui";

type Props = {
  mode?: "wind" | "slope";
  onToggleMode?: () => void;
  windAngleRatio?: { same: number; cross: number; opposite: number; total: number } | null;
};

const SLOPE_BINS = [
  { label: "< 0% (Downhill)", color: "#2563eb" },
  { label: "< 3%", color: "#16a34a" },
  { label: "4% - 6%", color: "#facc15" },
  { label: "7% - 9%", color: "#f97316" },
  { label: "10% - 12%", color: "#dc2626" },
  { label: "> 13%", color: "#92400e" },
];

export default function WindLegend({ mode = "wind", onToggleMode, windAngleRatio }: Props) {
  const routeBins = (mode === "slope" ? SLOPE_BINS : ROUTE_WIND_ANGLE_BINS).slice().reverse();
  const routeTitle = mode === "slope" ? "Route slope" : "Route vs wind";
  const windSpeedBins = WIND_BINS_MS.slice().reverse();
  const speedSampleMs = (max: number) => (Number.isFinite(max) ? Math.max(0.8, max - 0.2) : 12);
  const showRatio = mode === "wind" && windAngleRatio && windAngleRatio.total > 0;
  const ratioTotal = windAngleRatio?.total ?? 0;
  const samePct = ratioTotal > 0 ? (windAngleRatio!.same / ratioTotal) * 100 : 0;
  const crossPct = ratioTotal > 0 ? (windAngleRatio!.cross / ratioTotal) * 100 : 0;
  const oppositePct = ratioTotal > 0 ? (windAngleRatio!.opposite / ratioTotal) * 100 : 0;
  const pctLabel = (v: number) => `${v.toFixed(0)}%`;

  return (
    <div
      style={{
        ...glassSurface,
        padding: 14,
        fontSize: 13,
        lineHeight: 1.25,
        color: ui.ink,
        width: "100%",
        maxWidth: "100%",
      }}
    >
      <button
        type="button"
        onClick={onToggleMode}
        style={{
          width: "100%",
          padding: "8px 10px",
          marginBottom: 12,
          borderRadius: ui.radiusSm,
          border: "none",
          background: ui.accentSoft,
          color: ui.accent,
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          cursor: "pointer",
        }}
      >
        {mode === "wind" ? "Show slope" : "Show wind angle"}
      </button>

      <div style={{ ...ui.sectionLabel, marginBottom: showRatio ? 8 : 9 }}>{routeTitle}</div>

      {showRatio && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              height: 6,
              borderRadius: ui.radiusPill,
              overflow: "hidden",
              background: ui.hairline,
              marginBottom: 6,
            }}
          >
            <span style={{ width: `${samePct}%`, background: "#2563eb" }} />
            <span style={{ width: `${crossPct}%`, background: "#f97316" }} />
            <span style={{ width: `${oppositePct}%`, background: "#ef4444" }} />
          </div>
          <div style={{ fontSize: 11.5, color: ui.muted }}>
            Tailwind {pctLabel(samePct)} · Cross {pctLabel(crossPct)} · Head {pctLabel(oppositePct)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {routeBins.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 10,
                borderRadius: 3,
                background: b.color,
                flex: "0 0 auto",
              }}
            />
            <span style={{ color: ui.inkSecondary }}>{b.label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 0.5, background: ui.hairline, margin: "12px 0" }} />

      <div style={{ ...ui.sectionLabel, marginBottom: 9 }}>Wind speed · m/s</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {windSpeedBins.map((b, i) => (
          <div key={`speed-${i}`} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{
                display: "inline-flex",
                width: 28,
                height: 20,
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
              dangerouslySetInnerHTML={{ __html: getArrowIcon(90, speedSampleMs(b.max), 17) }}
            />
            <span style={{ color: ui.inkSecondary }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
