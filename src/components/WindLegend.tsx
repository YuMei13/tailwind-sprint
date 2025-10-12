"use client";
import { WIND_BINS_MS } from "@/lib/wind";

export default function WindLegend() {
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: "10px 12px",
        fontSize: 13,
        lineHeight: 1.3,
      }}
    >
      <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 700, marginBottom: 6 }}>Wind Speed (m/s)</div>
      {WIND_BINS_MS.map((b, i) => (
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
    </div>
  );
}
