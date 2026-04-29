"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { haversine } from "@/lib/geo";

export type ElevPt = { lat: number; lon: number; elevation?: number; error?: true };

type Props = {
  points: ElevPt[];
  onHover?: (pt: ElevPt | null, index: number | null) => void;
  onLeave?: () => void;
  onClick?: (pt: ElevPt | null, index: number | null) => void;
  selectedIndex?: number | null;
  externalHoverIndex?: number | null;
  compact?: boolean;
};

export default function ElevationPanel({
  points,
  onHover,
  onLeave,
  onClick,
  selectedIndex = null,
  externalHoverIndex = null,
  compact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(580);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const next = Math.max(220, Math.floor(el.clientWidth - 20));
      setChartWidth(next);
    };
    update();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // === 1. 計算序列 ===
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
      return { dist: [], elev: [], total: 0, min: 0, max: 0, ok, mapIdx };
    }
    const dist: number[] = [0];
    for (let i = 1; i < ok.length; i++) {
      dist.push(dist[i - 1] + haversine([ok[i - 1].lon, ok[i - 1].lat], [ok[i].lon, ok[i].lat]));
    }
    const elev = ok.map((p) => p.elevation);
    return {
      dist,
      elev,
      total: dist[dist.length - 1],
      min: Math.min(...elev),
      max: Math.max(...elev),
      ok,
      mapIdx,
    };
  }, [points]);

  // === 2. Hooks ===
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const lastSentIdxRef = useRef<number | null>(null);
  const hoverIdxRef = useRef<number | null>(null);
  const onHoverRef = useRef<Props["onHover"]>(onHover);
  const hoverXRef = useRef<number | null>(null);
  const hoverRafRef = useRef<number | null>(null);

  useEffect(() => {
    hoverIdxRef.current = hoverIdx;
  }, [hoverIdx]);

  useEffect(() => {
    hoverXRef.current = hoverX;
  }, [hoverX]);

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  const W = chartWidth, H = compact ? 170 : 230;
  const Pleft = compact ? 52 : 60;
  const Pright = compact ? 18 : 25;
  const Ptop = compact ? 18 : 25;
  const Pbottom = compact ? 34 : 45;
  const ready = series.dist.length >= 2;

  const x = useCallback(
    (d: number) => Pleft + (d / Math.max(1, series.total)) * (W - Pleft - Pright),
    [Pleft, Pright, W, series.total]
  );
  const y = useCallback(
    (z: number) => {
      const range = Math.max(1, series.max - series.min);
      return H - Pbottom - ((z - series.min) / range) * (H - Ptop - Pbottom);
    },
    [Pbottom, Ptop, H, series.max, series.min]
  );

  // === 3. 路徑與 hover ===
  const pathD = useMemo(() => {
    if (!ready) return "";
    return series.dist.map((d, i) => `${i === 0 ? "M" : "L"}${x(d)},${y(series.elev[i])}`).join(" ");
  }, [series, ready, x, y]);

  const hoverDist =
    hoverX != null && ready
      ? ((hoverX - Pleft) / Math.max(1, W - Pleft - Pright)) * series.total
      : null;

  useEffect(() => {
    if (points.length < 2) {
      if (hoverX !== null) setHoverX(null);
      if (hoverIdxRef.current !== null) {
        hoverIdxRef.current = null;
        setHoverIdx(null);
      }
    }
    if (!ready || hoverDist == null) {
      if (hoverIdxRef.current !== null) {
        hoverIdxRef.current = null;
        setHoverIdx(null);
      }
      if (lastSentIdxRef.current !== null) {
        lastSentIdxRef.current = null;
        onHoverRef.current?.(null, null);
      }
      return;
    }
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < series.dist.length; i++) {
      const diff = Math.abs(series.dist[i] - hoverDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    if (hoverIdxRef.current !== best) {
      hoverIdxRef.current = best;
      setHoverIdx(best);
    }
    if (lastSentIdxRef.current !== best) {
      lastSentIdxRef.current = best;
      const origIdx = series.mapIdx[best];
      onHoverRef.current?.(points[origIdx], origIdx);
    }
  }, [hoverDist, hoverX, ready, points, series]);

  // === 4. 刻度 ===
  const kmTotal = series.total / 1000;
  const yTicks = useMemo(() => {
    if (!ready) return [];
    const step = Math.max(10, Math.round((series.max - series.min) / 4 / 10) * 10);
    const ticks: number[] = [];
    for (let h = Math.floor(series.min / step) * step; h <= series.max; h += step) ticks.push(h);
    return ticks;
  }, [series.min, series.max, ready]);

  const xTicks = useMemo(() => {
    if (!ready) return [];
    const step = Math.max(0.5, Math.round((kmTotal / 5) * 2) / 2);
    const ticks: number[] = [];
    for (let k = 0; k <= kmTotal; k += step) ticks.push(k);
    return ticks;
  }, [kmTotal, ready]);

  // === 5. hover 與選中 ===
  const selectedInnerIdx = useMemo(() => {
    if (!ready || selectedIndex == null) return null;
    const i = series.mapIdx.findIndex((orig) => orig === selectedIndex);
    return i >= 0 ? i : null;
  }, [ready, selectedIndex, series.mapIdx]);

  const externalHoverInnerIdx = useMemo(() => {
    if (!ready || externalHoverIndex == null) return null;
    const i = series.mapIdx.findIndex((orig) => orig === externalHoverIndex);
    return i >= 0 ? i : null;
  }, [ready, externalHoverIndex, series.mapIdx]);

  const displayHoverIdx = hoverX != null ? hoverIdx : (externalHoverInnerIdx ?? hoverIdx);

  const km = (series.total / 1000).toFixed(2);
  const minStr = series.min.toFixed(0);
  const maxStr = series.max.toFixed(0);

  // === 6. Render ===
  return (
    <div
      ref={containerRef}
      style={{
        background: "rgba(255,255,255,0.95)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: compact ? 10 : 16,
        fontSize: 12,
        color: "#1e293b",
      }}
      onMouseLeave={() => {
        setHoverX(null);
        if (hoverIdx !== null) setHoverIdx(null);
        lastSentIdxRef.current = null;
        onLeave?.();
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: compact ? 4 : 6 }}>Elevation (m)</div>

      {ready ? (
        <svg
          width={W}
          height={H}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const xPos = e.clientX - rect.left;
            const clampedX = Math.max(Pleft, Math.min(W - Pright, xPos));
            if (hoverRafRef.current != null) cancelAnimationFrame(hoverRafRef.current);
            hoverRafRef.current = requestAnimationFrame(() => {
              hoverRafRef.current = null;
              const prev = hoverXRef.current;
              if (prev == null || Math.abs(prev - clampedX) > 0.5) {
                setHoverX(clampedX);
              }
            });
          }}
          onMouseLeave={() => {
            if (hoverRafRef.current != null) {
              cancelAnimationFrame(hoverRafRef.current);
              hoverRafRef.current = null;
            }
            setHoverX(null);
          }}
          onClick={() => {
            const innerIdx = displayHoverIdx ?? hoverIdx;
            if (innerIdx == null) {
              onClick?.(null, null);
              return;
            }
            const origIdx = series.mapIdx[innerIdx];
            onClick?.(points[origIdx], origIdx);
          }}
          style={{ cursor: "pointer", pointerEvents: "auto", display: "block" }}
        >
          {/* Axes */}
          <line x1={Pleft} y1={H - Pbottom} x2={W - Pright} y2={H - Pbottom} stroke="#cbd5e1" />
          <line x1={Pleft} y1={Ptop} x2={Pleft} y2={H - Pbottom} stroke="#cbd5e1" />

          {/* Y軸刻度 */}
          {yTicks.map((val, i) => {
            const yy = y(val);
            const yAdj = Math.min(H - Pbottom - 4, Math.max(Ptop + 10, yy));
            return (
              <g key={`y-${i}`}>
                <line x1={Pleft - 4} x2={Pleft} y1={yAdj} y2={yAdj} stroke="#475569" />
                <text x={Pleft - 8} y={yAdj + 3} textAnchor="end" fill="#334155" fontSize={10}>
                  {val} m
                </text>
              </g>
            );
          })}

          {/* X軸刻度 */}
          {xTicks.map((val, i) => {
            const xx = x((val / kmTotal) * series.total);
            const isZero = Math.abs(val) < 1e-6;
            return (
              <g key={`x-${i}`}>
                <line y1={H - Pbottom} y2={H - Pbottom + 5} x1={xx} x2={xx} stroke="#475569" />
                <text
                  x={xx}
                  y={H - Pbottom + (isZero ? 22 : 18)}
                  textAnchor="middle"
                  fill="#334155"
                  fontSize={compact ? 9 : 10}
                >
                  {val.toFixed(1)} km
                </text>
              </g>
            );
          })}

          <text x={W / 2} y={H - 4} textAnchor="middle" fill="#334155" fontSize={compact ? 10 : 11}>
            Distance (km)
          </text>

          {/* 區域與線 */}
          <path
            d={`${pathD} L ${W - Pright},${H - Pbottom} L ${Pleft},${H - Pbottom} Z`}
            fill="#93c5fd"
            opacity={0.35}
          />
          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />

          {/* Hover / Selected */}
          {selectedInnerIdx != null && (
            <line
              x1={x(series.dist[selectedInnerIdx])}
              y1={Ptop}
              x2={x(series.dist[selectedInnerIdx])}
              y2={H - Pbottom}
              stroke="#1d4ed8"
              strokeDasharray="6 4"
            />
          )}
          {displayHoverIdx != null && displayHoverIdx < series.dist.length && (
            <>
            <line
              x1={x(series.dist[displayHoverIdx])}
              y1={Ptop}
              x2={x(series.dist[displayHoverIdx])}
              y2={H - Pbottom}
              stroke="#6366f1"
              strokeDasharray="4 3"
            />
            <g transform={`translate(${x(series.dist[displayHoverIdx]) - 15}, ${y(series.elev[displayHoverIdx]) - 15})`}>
              <image href="/bmx.png" x="0" y="0" width="30" height="30" />
            </g>
            </>
          )}
        </svg>
      ) : (
        <div style={{ textAlign: "center", color: "#64748b" }}>No elevation data</div>
      )}

      <div style={{ display: "flex", gap: compact ? 8 : 12, marginTop: compact ? 4 : 6, flexWrap: "wrap" }}>
        <span>Min: {minStr} m</span>
        <span>Max: {maxStr} m</span>
        <span>Gain: {(series.max - series.min).toFixed(0)} m</span>
        <span>Dist: {km} km</span>
      </div>
    </div>
  );
}
