"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { haversine } from "@/lib/geo";

export type ElevPt = { lat: number; lon: number; elevation?: number; error?: true };

type Props = {
  points: ElevPt[];
  onHover?: (pt: ElevPt | null, index: number | null) => void;
  onLeave?: () => void;
  onClick?: (pt: ElevPt | null, index: number | null) => void;
  selectedIndex?: number | null;        // 地圖/外部「選中」索引（深藍線）
  externalHoverIndex?: number | null;   // 地圖滑動帶來的「外部 hover」（紫線）
};


export default function ElevationPanel({
  points,
  onHover,
  onLeave,
  onClick,
  selectedIndex = null,
  externalHoverIndex = null,
}: Props) {
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

    // add slope function
    const slopes: number[] = [];
    for (let i = 1; i < ok.length; i++){
      const dh = ok[i].elevation - ok[i - 1].elevation;
      const dx = dist[i] - dist[i - 1];
      const slopePct = dx > 0 ? (dh /dx) * 100 : 0;
      slopes.push(slopePct);
    }

    return { dist, elev, total, min, max, ok, mapIdx, slopes};
  }, [points]);

  // 2) 狀態
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const lastSentIdxRef = useRef<number | null>(null);

  const W = 580, H = 230, Pleft = 55, Pright = 25, Ptop = 25, Pbottom = 40;
  const ready = series.dist.length >= 2;

  const x = (d: number) => Pleft + (d / Math.max(1, series.total)) * (W - Pleft - Pright);
  const y = (z: number) => {
    const range = Math.max(1, series.max - series.min);
    return H - Pbottom - ((z - series.min) / range) * (H - Ptop - Pbottom);
  };

  // path（可為空）
  let pathD = "";
  for (let i = 0; i < series.dist.length; i++) {
    const cmd = i === 0 ? "M" : "L";
    pathD += `${cmd}${x(series.dist[i]).toFixed(1)},${y(series.elev[i]).toFixed(1)} `;
  }

  // 3) 面板自身 hover 距離（不 ready 就固定 null）
  const hoverDist =
    hoverX != null && ready ? ((hoverX - Pleft) / Math.max(1, W - Pleft - Pright)) * series.total : null;

  // 4) 依 hoverDist 找最近點；只有變動才 setState / onHover
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

  const kmTotal = series.total / 1000;
  const yTicks = useMemo(() => {
    if (!ready) return [];
    const step = Math.max(10, Math.round((series.max - series.min) / 4 / 10) * 10);
    const ticks = [];
    for (let h = Math.floor(series.min / step) * step; h <= series.max; h += step)
      ticks.push(h);
    return ticks;
  }, [series.min, series.max, ready]);

  const xTicks = useMemo(() => {
    if (!ready) return [];
    const step = Math.max(0.5, Math.round((kmTotal / 5) * 2) / 2);
    const ticks = [];
    for (let k = 0; k <= kmTotal; k += step)
      ticks.push(k);
    return ticks;
  }, [kmTotal, ready]);


  // 5) 外部選中（selectedIndex）映射到本面板的內部索引
  const selectedInnerIdx = useMemo(() => {
    if (!ready || selectedIndex == null) return null;
    const i = series.mapIdx.findIndex((orig) => orig === selectedIndex);
    return i >= 0 ? i : null;
  }, [ready, selectedIndex, series.mapIdx]);

  // 6) 外部 hover（externalHoverIndex）映射到本面板的內部索引
  const externalHoverInnerIdx = useMemo(() => {
    if (!ready || externalHoverIndex == null) return null;
    const i = series.mapIdx.findIndex((orig) => orig === externalHoverIndex);
    return i >= 0 ? i : null;
  }, [ready, externalHoverIndex, series.mapIdx]);

  const km = (series.total / 1000).toFixed(2);
  const minStr = series.min.toFixed(0);
  const maxStr = series.max.toFixed(0);

  if (!ready) return null;

  // 面板內部 hover 顯示（紫）優先採用「外部 hover 覆蓋」，否則用本地滑鼠 hover
  const displayHoverIdx = externalHoverInnerIdx ?? hoverIdx;

  const gradients: { x: number; y: number; grade: number }[] = [];
  for (let i = 1; i < series.dist.length; i++) {
    const dx = series.dist[i] - series.dist[i - 1];
    const dz = series.elev[i] - series.elev[i - 1];
    if (dx > 0) {
      gradients.push({
        x: (series.dist[i - 1] + series.dist[i]) / 2,
        y: (series.elev[i - 1] + series.elev[i]) / 2,
        grade: (dz / dx) * 100,
      });
    }
  }
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: 20,
        fontSize: 12,
        lineHeight: 1.3,
        color: "#1e293b"
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
          // 點擊仍以面板當前顯示的 hover 為主（外部/內部皆可）
          const innerIdx = displayHoverIdx ?? hoverIdx;
          if (innerIdx == null) {
            onClick?.(null, null);
            return;
          }
          const origIdx = series.mapIdx[innerIdx];
          onClick?.(points[origIdx], origIdx);
        }}
        style={{ cursor: "pointer" }}
      >
        {/* Axes */}
        <line x1={Pleft} y1={H - Pbottom} x2={W - Pright} y2={H - Pbottom} stroke="#cbd5e1" />
        <line x1={Pleft} y1={Ptop} x2={Pleft} y2={H - Pbottom} stroke="#cbd5e1" />

        {/* Y軸刻度 */}
        {yTicks.map((val, i) => {
          const isZero = i === 0;
          return (
          <g key={i}>
            <line
              x1={Pleft - 5}
              x2={Pleft}
              y1={y(val) + (isZero ? -16 : 4)}
              y2={y(val) + (isZero ? -16 : 4)}
              stroke="#475569"
              strokeWidth={1}
            />
            <text x={Pleft - 8} y={y(val) + (isZero ? -14 : 6)} textAnchor="end" fill="#334155" fontSize={10}>
              {val} m
            </text>
          </g>
        );
        })}

        {/* X軸刻度 */}
        {xTicks.map((val, i) => (
          <g key={i}>
            <line
              y1={H - Pbottom}
              y2={H - Pbottom + 5}
              x1={x((val / kmTotal) * series.total)}
              x2={x((val / kmTotal) * series.total)}
              stroke="#475569"
              strokeWidth={1}
            />
            <text
              x={x((val / kmTotal) * series.total)}
              y={H - Pbottom + 18}
              textAnchor="middle"
              fill="#334155"
              fontSize={10}
            >
              {val.toFixed(1)} km
            </text>
          </g>
        ))}
        

        {/* Axis labels */}
        <text x={W / 2} y={H} textAnchor="middle" fill="#334155" fontSize={11}>
          Distance (km)
        </text>

        {/* Area */}
        <path d={`${pathD} L ${W - Pright},${H - Pbottom} L ${Pleft},${H - Pbottom} Z`} fill="#93c5fd" opacity={0.35} />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />

       
        {/* 平均坡度文字標示
        {series.dist.length > 1 && series.dist.slice(1).map((d, i) => {
          const slope = series.slopes?.[i];
          if (slope == null) return null;
          // const absSlope = Math.abs(slope);
          if (slope < 3) return null; // 小於 0.5% 不顯示

          const x0 = x(series.dist[i - 1]);
          const x1 = x(series.dist[i]);
          const y0 = y(series.elev[i - 1]);
          const y1 = y(series.elev[i]);
          const xMid = (x0 + x1) / 2;
          const yMid = (y0 + y1) / 2 - 8; // 字在中點上方一點

          const color = slope >= 0 ? "#ef4444" : "#3b82f6";

          return (
            <text
              key={`slope-${i}`}
              x={xMid}
              y={yMid}
              textAnchor="middle"
              fontSize={10}
              fill={color}
              opacity={0.7}
            >
              {slope.toFixed(1)}%
            </text>
          );
        })} */}

        {/* 外部選中（深藍） */}
        {selectedInnerIdx != null && (
          <>
            <line
              x1={x(series.dist[selectedInnerIdx])}
              y1={28}
              x2={x(series.dist[selectedInnerIdx])}
              y2={H - 28}
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

        {/* Hover（紫）：外部 hover 優先顯示 */}
        {displayHoverIdx != null && (
          <>
            <line
              x1={x(series.dist[displayHoverIdx])}
              y1={Pleft}
              x2={x(series.dist[displayHoverIdx])}
              y2={H - Pleft}
              stroke="#6366f1"
              strokeDasharray="4 3"
            />
            <circle
              cx={x(series.dist[displayHoverIdx])}
              cy={y(series.elev[displayHoverIdx])}
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