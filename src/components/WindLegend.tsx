"use client";
import { ROUTE_WIND_ANGLE_BINS, WIND_BINS_MS } from "@/lib/wind";

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
  const routeTitle = mode === "slope" ? "Route Slope" : "Route vs Wind Angle";
  const windSpeedBins = WIND_BINS_MS.slice().reverse();
  const showRatio = mode === "wind" && windAngleRatio && windAngleRatio.total > 0;
  const ratioTotal = windAngleRatio?.total ?? 0;
  const samePct = ratioTotal > 0 ? (windAngleRatio!.same / ratioTotal) * 100 : 0;
  const crossPct = ratioTotal > 0 ? (windAngleRatio!.cross / ratioTotal) * 100 : 0;
  const oppositePct = ratioTotal > 0 ? (windAngleRatio!.opposite / ratioTotal) * 100 : 0;
  const pctLabel = (v: number) => `${v.toFixed(0)}%`;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
        padding: "9px 10px",
        fontSize: 12,
        lineHeight: 1.2,
        width: "100%",
        maxWidth: "100%",
      }}
    >
      <button
        type="button"
        onClick={onToggleMode}
        style={{
          width: "100%",
          padding: "6px 8px",
          marginBottom: 7,
          borderRadius: 5,
          border: "1px solid #cbd5e1",
          background: "#f8fafc",
          color: "#0f172a",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {mode === "wind" ? "Switch to Slope" : "Switch to Wind Angle"}
      </button>
      <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 700, marginBottom: showRatio ? 4 : 5 }}>
        {routeTitle}
      </div>
      {showRatio && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              display: "flex",
              height: 8,
              borderRadius: 999,
              overflow: "hidden",
              background: "#e2e8f0",
              marginBottom: 4,
            }}
          >
            <span style={{ width: `${samePct}%`, background: "#2563eb" }} />
            <span style={{ width: `${crossPct}%`, background: "#f97316" }} />
            <span style={{ width: `${oppositePct}%`, background: "#ef4444" }} />
          </div>
          <div style={{ fontSize: 11, color: "#475569" }}>
            Same-ish {pctLabel(samePct)} · Crosswind {pctLabel(crossPct)} · Opposite {pctLabel(oppositePct)}
          </div>
        </div>
      )}
      {routeBins.map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", margin: "3px 0" }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 9,
              borderRadius: 3,
              background: b.color,
              marginRight: 6,
            }}
          />
          <span>{b.label}</span>
        </div>
      ))}

      <div
        style={{
          height: 1,
          background: "#e2e8f0",
          margin: "7px 0",
        }}
      />

      <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 700, marginBottom: 5 }}>
        Wind Speed (m/s)
      </div>
      {windSpeedBins.map((b, i) => (
        <div key={`speed-${i}`} style={{ display: "flex", alignItems: "center", margin: "3px 0" }}>
          <span
            style={{
              display: "inline-flex",
              width: 18,
              height: 11,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 6,
            }}
          >
            <svg width="15" height="10" viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <line x1="2" y1="8" x2="18" y2="8" stroke={b.color} strokeWidth="2" strokeLinecap="round" />
              <polygon points="16,4 24,8 16,12" fill={b.color} />
            </svg>
          </span>
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}
