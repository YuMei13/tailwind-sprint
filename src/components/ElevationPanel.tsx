"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { haversine } from "@/lib/geo";

export type ElevPt = { lat: number; lon: number; elevation?: number; error?: true };

type Props = {
  points: ElevPt[];
  onHover?: (pt: ElevPt | null, index: number | null) => void;
  onLeave?: () => void;
  onClick?: (pt: ElevPt | null, index: number | null) => void;
  selectedIndex?: number | null; // ★ 外部選中點（地圖點擊時帶入）
};

export default function ElevationPanel({ points, onHover, onLeave, onClick, selectedIndex = null }: Props) {
  // 1) 計算序列
  const series = useMemo(() => {
    const ok: { lat: number; lon: number; elevation: number }[] = [];
    const mapIdx: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (typeof p.elevation === "number") {
        ok.push({ lat: p.lat, lon: p.lon, elevation: p.elevation });
        mapIdx.push(i);
      }
    }
    if (ok.length < 2) {
      return { dist: [] as number[], elev: [] as number[], total: 0, min: 0, max: 0, ok, mapIdx };
    }
    const dist: number[] = [0];
    for (let i = 1; i < ok.length; i++) {
      dist.push(dist[i - 1] + haversine([ok[i - 1].lon, ok[i - 1].lat], [ok[i].lon, ok[i].lat]));
    }
    const elev = ok.map((p) => p.elevation);
    const total = dist[dist.length - 1];
    const min = Math.min(...elev);
    const max = Math.max(...elev);
    return { dist, elev, total, min, max, ok, mapIdx };
  }, [points]);

  // 2) 狀態（固定呼叫 Hooks）
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const lastSentIdxRef = useRef<number | null>(null);

  const W = 520, H = 160, P = 28;
  const ready = series.dist.length >= 2;

  const x = (d: number) => P + (d / Math.max(1, series.total)) * (W - 2 * P);
  const y = (z: number) => {
    const range = Math.max(1, series.max - series.min);
    return H - P - ((z - series.min) / range) * (H - 2 * P);
  };

  // path（可為空）
  let pathD = "";
  for (let i = 0; i < series.dist.length; i++) {
    const cmd = i === 0 ? "M" : "L";
    pathD += `${cmd}${x(series.dist[i]).toFixed(1)},${y(series.elev[i]).toFixed(1)} `;
  }

  // 3) hover 距離（不 ready 就固定 null）
  const hoverDist =
    hoverX != null && ready ? ((hoverX - P) / Math.max(1, W - 2 * P)) * series.total : null;

  // 4) 依 hoverDist 找最近點；只有真的變動才 setState / onHover
  useEffect(() => {
    if (!ready || hoverDist == null) {
      if (hoverIdx !== null) setHoverIdx(null);
      if (lastSentIdxRef.current !== null) {
        lastSentIdxRef.current = null;
        onHover?.(null, null);
      }
      return;
    }
    let best = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < series.dist.length; i++) {
      const d = Math.abs(series.dist[i] - hoverDist);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    if (hoverIdx !== best) setHoverIdx(best);
    if (lastSentIdxRef.current !== best) {
      lastSentIdxRef.current = best;
      const origIdx = series.mapIdx[best];
      onHover?.(points[origIdx], origIdx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverDist, ready]);

  // 5) 外部選中（selectedIndex）高亮：不影響 hover，僅加上第二條指示線
  const selectedInnerIdx = useMemo(() => {
    if (!ready || selectedIndex == null) return null;
    // 把外部原索引映射到本面板濾後資料的內部索引
    const i = series.mapIdx.findIndex((orig) => orig === selectedIndex);
    return i >= 0 ? i : null;
  }, [ready, selectedIndex, series.mapIdx]);

  const km = (series.total / 1000).toFixed(2);
  const minStr = series.min.toFixed(0);
  const maxStr = series.max.toFixed(0);

  if (!ready) return null;

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
      onMouseLeave={() => {
        setHoverX(null);
        if (hoverIdx !== null) setHoverIdx(null);
        lastSentIdxRef.current = null;
        onLeave?.();
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Elevation (m)</div>
      <svg
        width={W}
        height={H}
        onMouseMove={(e) => {
          const xPos = (e.nativeEvent as unknown as MouseEvent & { offsetX: number }).offsetX;
          setHoverX((prev) => (prev === xPos ? prev : xPos)); // 去重
        }}
        onClick={() => {
          if (hoverIdx == null) {
            onClick?.(null, null);
            return;
          }
          const origIdx = series.mapIdx[hoverIdx];
          onClick?.(points[origIdx], origIdx);
        }}
        style={{ cursor: "pointer" }}
      >
        {/* Axes */}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#cbd5e1" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="#cbd5e1" />

        {/* Area */}
        <path d={`${pathD} L ${W - P},${H - P} L ${P},${H - P} Z`} fill="#93c5fd" opacity={0.35} />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />

        {/* 外部選中（深藍） */}
        {selectedInnerIdx != null && (
          <>
            <line
              x1={x(series.dist[selectedInnerIdx])}
              y1={P}
              x2={x(series.dist[selectedInnerIdx])}
              y2={H - P}
              stroke="#1d4ed8"
              strokeDasharray="6 4"
            />
            <circle
              cx={x(series.dist[selectedInnerIdx])}
              cy={y(series.elev[selectedInnerIdx])}
              r={3.5}
              fill="#2563eb"
            />
          </>
        )}

        {/* Hover（紫） */}
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
            <circle cx={x(series.dist[hoverIdx])} cy={y(series.elev[hoverIdx])} r={3} fill="#1d4ed8" />
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
