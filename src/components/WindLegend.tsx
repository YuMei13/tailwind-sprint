"use client";
import { ROUTE_WIND_ANGLE_BINS, WIND_BINS_MS } from "@/lib/wind";

type Props = {
  mode?: "wind" | "slope";
  onToggleMode?: () => void;
};

const SLOPE_BINS = [
  { label: "< 5%", color: "#16a34a" },
  { label: "5% - 10%", color: "#f97316" },
  { label: "> 10%", color: "#dc2626" },
];

export default function WindLegend({ mode = "wind", onToggleMode }: Props) {
  const routeBins = (mode === "slope" ? SLOPE_BINS : ROUTE_WIND_ANGLE_BINS).slice().reverse();
  const routeTitle = mode === "slope" ? "Route Slope" : "Route vs Wind Angle";
  const windSpeedBins = WIND_BINS_MS.slice().reverse();

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: "10px 12px",
        fontSize: 13,
        lineHeight: 1.3,
      }}
    >
      <button
        type="button"
        onClick={onToggleMode}
        style={{
          width: "100%",
          padding: "7px 10px",
          marginBottom: 8,
          borderRadius: 6,
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
      <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 700, marginBottom: 6 }}>
        {routeTitle}
      </div>
      {routeBins.map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", margin: "4px 0" }}>
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 10,
              borderRadius: 3,
              background: b.color,
              marginRight: 8,
            }}
          />
          <span>{b.label}</span>
        </div>
      ))}

      <div
        style={{
          height: 1,
          background: "#e2e8f0",
          margin: "8px 0",
        }}
      />

      <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 700, marginBottom: 6 }}>
        Wind Speed (m/s)
      </div>
      {windSpeedBins.map((b, i) => (
        <div key={`speed-${i}`} style={{ display: "flex", alignItems: "center", margin: "4px 0" }}>
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 10,
              borderRadius: 3,
              background: b.color,
              marginRight: 8,
            }}
          />
          <span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}
