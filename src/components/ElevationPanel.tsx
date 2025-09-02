"use client";
import { useMemo, useState } from "react";
import { haversine } from "@/lib/geo";

type Pt = { lat: number; lon: number; elevation?: number; error?: true };

export default function ElevationPanel({ points }: { points: Pt[] }) {
  // 只取有海拔的點做曲線
  const series = useMemo(() => {
    const ok = points.filter((p): p is { lat: number; lon: number; elevation: number } =>
      typeof p.elevation === "number"
    );
    if (ok.length < 2) return { dist: [] as number[], elev: [] as number[], total: 0, min: 0, max: 0 };

    const dist: number[] = [0];
    for (let i = 1; i < ok.length; i++) {
      dist.push(dist[i - 1] + haversine([ok[i - 1].lon, ok[i - 1].lat], [ok[i].lon, ok[i].lat]));
    }
    const elev = ok.map((p) => p.elevation);
    const total = dist[dist.length - 1];
    const min = Math.min(...elev);
    const max = Math.max(...elev);
    return { dist, elev, total, min, max };
  }, [points]);

  const [hoverX, setHoverX] = useState<number | null>(null);

  const W = 520, H = 140, P = 28;
  if (series.dist.length < 2) return null;

  const x = (d: number) => P + (d / series.total) * (W - 2 * P);
  const y = (z: number) => {
    const range = Math.max(1, series.max - series.min);
    return H - P - ((z - series.min) / range) * (H - 2 * P);
  };

  // path
  let pathD = "";
  for (let i = 0; i < series.dist.length; i++) {
    const cmd = i === 0 ? "M" : "L";
    pathD += `${cmd}${x(series.dist[i]).toFixed(1)},${y(series.elev[i]).toFixed(1)} `;
  }

  // hover index（找最接近的距離點）
  const hoverDist =
    hoverX != null ? ((hoverX - P) / Math.max(1, W - 2 * P)) * series.total : null;

  let hoverIdx: number | null = null;
  if (hoverDist != null) {
    let best = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < series.dist.length; i++) {
      const d = Math.abs(series.dist[i] - hoverDist);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    hoverIdx = best;
  }

  const km = (series.total / 1000).toFixed(2);
  const minStr = series.min.toFixed(0);
  const maxStr = series.max.toFixed(0);

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
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Elevation (m)</div>
      <svg
        width={W}
        height={H}
        onMouseMove={(e) => setHoverX((e.nativeEvent as MouseEvent & { offsetX: number }).offsetX)}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* Axes */}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#cbd5e1" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="#cbd5e1" />
        {/* Area */}
        <path d={`${pathD} L ${W - P},${H - P} L ${P},${H - P} Z`} fill="#93c5fd" opacity={0.35} />
        {/* Line */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {/* Hover */}
        {hoverIdx != null && (
          <>
            <line
              x1={x(series.dist[hoverIdx])}
              y1={P}
              x2={x(series.dist[hoverIdx])}
              y2={H - P}
              stroke="#6366f1"
              strokeDasharray="4 3"
            />
            <circle
              cx={x(series.dist[hoverIdx])}
              cy={y(series.elev[hoverIdx])}
              r={3}
              fill="#1d4ed8"
            />
          </>
        )}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        <span>Min: {minStr} m</span>
        <span>Max: {maxStr} m</span>
        <span>Gain: {(series.max - series.min).toFixed(0)} m</span>
        <span>Dist: {km} km</span>
      </div>
    </div>
  );
}
