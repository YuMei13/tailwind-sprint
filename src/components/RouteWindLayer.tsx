"use client";
import { Marker, Polyline, Popup } from "react-leaflet";
import { windToColor } from "@/lib/wind";
import { getArrowIcon } from "@/lib/windIcons";
import { haversine } from "@/lib/geo";
import L from "leaflet";

export type WindPoint = {
  lat: number;
  lon: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

type LatLng = [number, number];

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
        const t0 = (d0 - da) / segLen;
        out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
      }
      started = true;
    }

    if (db >= d1) {
      const t1 = (d1 - da) / segLen;
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
  if (!Array.isArray(route) || route.length < 2) return null;

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
    if (!Number.isFinite(sp)) continue;
    const idx = nearestIndex(route, [w.lat, w.lon]);
    const d = cum[idx];
    const k = Math.min(segCount - 1, Math.max(0, Math.floor(d / segLen)));
    buckets[k].push(sp as number);
  }

  const segAvg: Array<number | undefined> = buckets.map((arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined
  );

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

  return (
    <>
      {segments.length > 0 ? (
        segments.map((s, i) => (
          <Polyline key={`seg-${i}`} positions={s.pts} pathOptions={{ color: s.color, weight }} />
        ))
      ) : (
        <Polyline positions={route} pathOptions={{ color: FALLBACK_COLOR, weight }} />
      )}

      {/* ➤➤ 渲染風向箭頭 */}
      {winds.map((w, i) => {
        if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return null;
        if (typeof w.dirDeg !== "number" || typeof w.speedKmh !== "number") return null;

        const icon = getArrowIcon(w.dirDeg, 60);
        return (
          <Marker
            key={`wind-${i}`}
            position={[w.lat, w.lon]}
            icon={icon}
          >
            {Number.isFinite(w.speedKmh) && (
              <Popup>
                <div>風速:{w.speedKmh?.toFixed(1)} km/h</div>
              </Popup>
            )}  
          </Marker> 
          
        );
      })}
    </>
  );
}
