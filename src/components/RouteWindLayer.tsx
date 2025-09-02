"use client";
import { Polyline } from "react-leaflet";
import { windToColor } from "@/lib/wind";

type LatLng = [number, number]; // [lat, lon]

export type WindPoint = {
  lat: number;
  lon: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

type Props = {
  route: LatLng[];          // 連續路線（[lat,lon]）
  winds: WindPoint[];       // 抽樣點（[lat,lon] + 風）
  weight?: number;          // 線寬
};

// 計算平方距離
function d2(a: LatLng, b: LatLng) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

// 找 route 陣列中與點 p 最近的 index（O(n)；MVP 足夠）
function nearestIndex(route: LatLng[], p: LatLng): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length; i++) {
    const dd = d2(route[i], p);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  }
  return best;
}

export default function RouteWindLayer({ route, winds, weight = 6 }: Props) {
  if (!Array.isArray(route) || route.length < 2) return null;
  if (!Array.isArray(winds) || winds.length === 0) {
    // 沒風資料就畫成單色藍線（回退）
    return <Polyline positions={route} pathOptions={{ color: "#3b82f6", weight }} />;
  }

  // 把每個風點對應到 route 的最近 index
  const anchors = winds
    .map((w) => ({
      idx: nearestIndex(route, [w.lat, w.lon]),
      speedMS: typeof w.speedKmh === "number" ? w.speedKmh / 3.6 : undefined,
    }))
    .sort((a, b) => a.idx - b.idx)
    .filter((v, i, arr) => i === 0 || v.idx !== arr[i - 1].idx); // 去除重複 index

  if (anchors.length === 0) {
    return <Polyline positions={route} pathOptions={{ color: "#3b82f6", weight }} />;
  }

  // 以 anchors 把 route 切成多段
  const segments: { pts: LatLng[]; color: string }[] = [];
  // 起始段（route[0..anchor0]）
  {
    const endIdx = anchors[0].idx;
    const color = anchors[0].speedMS !== undefined ? windToColor(anchors[0].speedMS) : "#6b7280";
    segments.push({ pts: route.slice(0, Math.max(1, endIdx + 1)), color });
  }
  // 中間段（anchor i .. anchor i+1）
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const color = a.speedMS !== undefined ? windToColor(a.speedMS) : "#6b7280";
    const seg = route.slice(a.idx, b.idx + 1);
    if (seg.length >= 2) segments.push({ pts: seg, color });
  }
  // 最後一段（anchor last .. route end）
  {
    const last = anchors[anchors.length - 1];
    const color = last.speedMS !== undefined ? windToColor(last.speedMS) : "#6b7280";
    const seg = route.slice(last.idx);
    if (seg.length >= 2) segments.push({ pts: seg, color });
  }

  return (
    <>
      {segments.map((s, i) => (
        <Polyline key={i} positions={s.pts} pathOptions={{ color: s.color, weight }} />
      ))}
    </>
  );
}
