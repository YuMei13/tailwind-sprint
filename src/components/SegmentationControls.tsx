"use client";
import { useState } from "react";

type Props = {
  value: number;                     // 目前的分段長度（公尺）
  onChange: (meters: number) => void;
};

const PRESETS = [300, 500, 800];

export default function SegmentationControls({ value, onChange }: Props) {
  const [custom, setCustom] = useState<string>("");

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: 10,
        fontSize: 12,
        lineHeight: 1.3,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Segment length (m)</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: value === m ? "#111827" : "#fff",
              color: value === m ? "#fff" : "#111827",
              cursor: "pointer",
            }}
          >
            {m} m
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom);
            if (Number.isFinite(n) && n >= 50) {
              onChange(Math.round(n));
              setCustom("");
            }
          }}
          style={{ display: "flex", gap: 6, alignItems: "center" }}
        >
          <input
            type="number"
            min={50}
            step={50}
            placeholder="Set (≥50)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{
              width: 100,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #94a3b8",
              background: "#f8fafc",
              color: "#0f172a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Render
          </button>
        </form>
      </div>
      <div style={{ marginTop: 6, color: "#6b7280" }}>
        Current：<b>{value}</b> m（Recommend 300–800）
      </div>
    </div>
  );
}
