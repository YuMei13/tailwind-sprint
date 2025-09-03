"use client";
import { Polyline } from "react-leaflet";
import { windToColor } from "@/lib/wind";
import { haversine } from "@/lib/geo";

export type WindPoint = {
  lat: number;
  lon: number;
  speedKmh?: number; // from /api/wind
  dirDeg?: number;
  error?: true;
  msg?: string;
};

type LatLng = [number, number]; // [lat, lon]

type Props = {
  route: LatLng[];            // 連續路線（[lat,lon]）
  winds: WindPoint[];         // 抽樣點（[lat,lon] + 風）
  weight?: number;            // 線寬
  segmentMeters?: number;     // 每段長度（預設 500m）
};

const FALLBACK_COLOR = "#6b7280"; // 無資料時的灰色

// 計算 route 的累積距離（公尺），route 是 [lat,lon]
function cumulativeDistances(route: LatLng[]): number[] {
  const n = route.length;
  const cum: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a: [number, number] = [route[i - 1][1], route[i - 1][0]]; // [lon,lat]
    const b: [number, number] = [route[i][1], route[i][0]];         // [lon,lat]
    cum[i] = cum[i - 1] + haversine(a, b);
  }
  return cum;
}

// 找 route 陣列中與點 p 最近的 index（O(n)；MVP 足夠）
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

// 沿著 polyline 取 [d0,d1]（公尺）之間的子段，必要時在邊界做線性內插
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

    // 跳過與區間完全無交集的段
    if (db < d0) continue;
    if (da > d1) break;

    // 進入點
    if (!started) {
      if (d0 <= da) {
        out.push(a);
      } else {
        const t0 = Math.min(1, Math.max(0, (d0 - da) / segLen));
        out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
      }
      started = true;
    }

    // 離開點：若本段跨過 d1，補上邊界點後結束
    if (db >= d1) {
      const t1 = Math.min(1, Math.max(0, (d1 - da) / segLen));
      out.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
      break;
    } else {
      // 否則可安全把 b 放進去
      out.push(b);
    }
  }

  // 確保至少兩點形成線段
  return out.length >= 2 ? out : [];
}

export default function RouteWindLayer({
  route,
  winds,
  weight = 6,
  segmentMeters = 500,
}: Props) {
  if (!Array.isArray(route) || route.length < 2) return null;

  // 1) 累積距離與總長
  const cum = cumulativeDistances(route);
  const total = cum[cum.length - 1];
  if (!Number.isFinite(total) || total <= 0) {
    return <Polyline positions={route} pathOptions={{ color: FALLBACK_COLOR, weight }} />;
  }

  // 2) 建立段落（每 segmentMeters 一段）
  const segLen = Math.max(50, segmentMeters); // 下限 50m 避免太碎
  const segCount = Math.max(1, Math.ceil(total / segLen));

  // 3) 將風點對應到「距離座標」→ 落在哪一段
  const buckets: number[][] = Array.from({ length: segCount }, () => []);
  for (const w of winds) {
    const sp = typeof w.speedKmh === "number" ? w.speedKmh / 3.6 : undefined; // m/s
    if (!Number.isFinite(sp)) continue;
    const idx = nearestIndex(route, [w.lat, w.lon]);
    const d = cum[idx];
    const k = Math.min(segCount - 1, Math.max(0, Math.floor(d / segLen)));
    buckets[k].push(sp as number);
  }

  // 4) 計算每段平均風速（m/s）
  const segAvg: Array<number | undefined> = buckets.map((arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined
  );

  // 5) 切出每段的 polyline，並用平均風速決定顏色
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

  // 若意外沒切出任何段，就回退單色
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
