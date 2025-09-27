"use client";
import { useEffect } from "react";
import { Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { windToColor } from "@/lib/wind";
import { haversine } from "@/lib/geo";
import { getArrowIcon } from "@/lib/windIcons";

export type WindPoint = {
  lat: number;
  lon: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

type LatLng = [number, number]; // [lat, lon]

type Props = {
  route: LatLng[];
  winds: WindPoint[];
  weight?: number;
  segmentMeters?: number;
};

const FALLBACK_COLOR = "#6b7280";

function cumulativeDistances(route: LatLng[]): number[] {
  const n = route.length;
  const cum: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a: [number, number] = [route[i - 1][1], route[i - 1][0]];
    const b: [number, number] = [route[i][1], route[i][0]];
    cum[i] = cum[i - 1] + haversine(a, b);
  }
  return cum;
}

function nearestIndex(route: LatLng[], p: LatLng): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i][0] - p[0];
    const dy = route[i][1] - p[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

function sliceBetween(route: LatLng[], cum: number[], d0: number, d1: number): LatLng[] {
  const n = route.length;
  if (n < 2 || d1 <= d0) return [];
  const out: LatLng[] = [];
  let started = false;

  for (let i = 1; i < n; i++) {
    const a = route[i - 1];
    const b = route[i];
    const da = cum[i - 1];
    const db = cum[i];
    const segLen = db - da;
    if (segLen <= 0) continue;

    if (db < d0) continue;
    if (da > d1) break;

    if (!started) {
      if (d0 <= da) {
        out.push(a);
      } else {
        const t0 = Math.min(1, Math.max(0, (d0 - da) / segLen));
        out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
      }
      started = true;
    }

    if (db >= d1) {
      const t1 = Math.min(1, Math.max(0, (d1 - da) / segLen));
      out.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
      break;
    } else {
      out.push(b);
    }
  }

  return out.length >= 2 ? out : [];
}

export default function RouteWindLayer({
  route,
  winds,
  weight = 6,
  segmentMeters = 500,
}: Props) {
  const map = useMap();

  // 渲染箭頭層
  useEffect(() => {
    const group = L.layerGroup();

    winds.forEach((w) => {
      if (w.error) return;
      if (typeof w.lat !== "number" || typeof w.lon !== "number") return;
      if (typeof w.speedKmh !== "number" || typeof w.dirDeg !== "number") return;

      const lat = w.lat;
      const lon = w.lon;
      const deg = w.dirDeg;

      const color = windToColor(w.speedKmh / 3.6);
      // 微調箭頭長度可改這裡
      const length = 0.0005;

      const rad = (deg * Math.PI) / 180;
      const dLat = length * Math.sin(rad);
      const dLon = length * Math.cos(rad);

      const arrow = L.polyline(
        [
          [lat, lon],
          [lat + dLat, lon + dLon],
        ],
        {
          color,
          weight: 2,
          opacity: 0.9,
        }
      ).bindTooltip(
        `風速: ${(w.speedKmh / 3.6).toFixed(1)} m/s<br>方向: ${deg.toFixed(0)}°`,
        { direction: "top", offset: L.point(0, -6) }
      );

      arrow.addTo(group);
    });

    group.addTo(map);
    return () => {
      map.removeLayer(group);
    };
    
  }, [map, winds]);
  console.log("rensder is ok?", winds);
  // 畫彩線段這部分維持原本邏輯
  if (!Array.isArray(route) || route.length < 2) {
    return null;
  }

  const cum = cumulativeDistances(route);
  const total = cum[cum.length - 1];
  if (!Number.isFinite(total) || total <= 0) {
    return <Polyline positions={route} pathOptions={{ color: FALLBACK_COLOR, weight }} />;
  }

  const segLen = Math.max(50, segmentMeters);
  const segCount = Math.max(1, Math.ceil(total / segLen));

  const buckets: number[][] = Array.from({ length: segCount }, () => []);
  for (const w of winds) {
    const sp = typeof w.speedKmh === "number" ? w.speedKmh / 3.6 : undefined;
    if (!Number.isFinite(sp as number)) continue;
    const idx = nearestIndex(route, [w.lat, w.lon]);
    const d = cum[idx];
    const k = Math.min(segCount - 1, Math.max(0, Math.floor(d / segLen)));
    buckets[k].push(sp as number);
  }

  const segAvg = buckets.map((arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined));

  const segments: { pts: LatLng[]; color: string }[] = [];
  for (let k = 0; k < segCount; k++) {
    const d0 = k * segLen;
    const d1 = Math.min(total, (k + 1) * segLen);
    const pts = sliceBetween(route, cum, d0, d1);
    if (pts.length < 2) continue;
    const sp = segAvg[k];
    const color = typeof sp === "number" ? windToColor(sp) : FALLBACK_COLOR;
    segments.push({ pts, color });
  }

  if (segments.length === 0) {
    return <Polyline positions={route} pathOptions={{ color: FALLBACK_COLOR, weight }} />;
  }

  return (
    <>
      {segments.map((s, i) => (
        <Polyline key={i} positions={s.pts} pathOptions={{ color: s.color, weight }} />
      ))}
    </>
  );
}
