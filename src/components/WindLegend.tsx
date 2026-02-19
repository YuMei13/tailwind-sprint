"use client";
import { ROUTE_WIND_ANGLE_BINS, WIND_BINS_MS } from "@/lib/wind";

export default function WindLegend() {
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
      <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 700, marginBottom: 6 }}>
        Route vs Wind Angle
      </div>
      {ROUTE_WIND_ANGLE_BINS.map((b, i) => (
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
      {WIND_BINS_MS.map((b, i) => (
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
