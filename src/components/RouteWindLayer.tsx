// src/components/RouteWindLayer.tsx
"use client";
import { Source, Layer, Marker } from "react-map-gl";
import { routeWindAngleToColor } from "@/lib/wind";
import { getArrowIcon } from "@/lib/windIcons";
import { haversine } from "@/lib/geo";

export type WindPoint = {
  lat: number;
  lon: number;
  speedMs?: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

type LatLng = [number, number];

type Props = {
  route: LatLng[];
  winds: WindPoint[];
  elevPts?: Array<{ lat: number; lon: number; elevation?: number }>;
  mode?: "wind" | "slope";
  weight?: number;
  segmentMeters?: number;
  zoom?: number;
};

const FALLBACK_COLOR = "#6b7280";
const SLOPE_BLUE = "#2563eb";
const SLOPE_GREEN = "#16a34a";
const SLOPE_YELLOW = "#facc15";
const SLOPE_ORANGE = "#f97316";
const SLOPE_RED = "#dc2626";
const SLOPE_BROWN = "#92400e";

function normalizeDeg(v: number) {
  const x = v % 360;
  return x < 0 ? x + 360 : x;
}

function bearingDeg(from: LatLng, to: LatLng): number {
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const dLon = ((to[1] - from[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

function smallestAngleDiffDeg(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return d > 180 ? 360 - d : d;
}

function nearestWindDirDeg(winds: WindPoint[], p: LatLng): number | undefined {
  let bestD2 = Number.POSITIVE_INFINITY;
  let best: number | undefined = undefined;
  for (const w of winds) {
    if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon) || !Number.isFinite(w.dirDeg)) continue;
    const dx = w.lat - p[0];
    const dy = w.lon - p[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = w.dirDeg as number;
    }
  }
  return best;
}

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

function interpolateY(xs: number[], ys: number[], x: number): number | undefined {
  if (xs.length === 0 || ys.length === 0 || xs.length !== ys.length) return undefined;
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const x0 = xs[i - 1];
      const x1 = xs[i];
      const y0 = ys[i - 1];
      const y1 = ys[i];
      const span = x1 - x0;
      if (span <= 0) return y0;
      const t = (x - x0) / span;
      return y0 + (y1 - y0) * t;
    }
  }
  return ys[last];
}

function slopeColor(slopePercent: number): string {
  if (slopePercent < 0) return SLOPE_BLUE;
  if (slopePercent < 3) return SLOPE_GREEN;
  if (slopePercent < 7) return SLOPE_YELLOW;
  if (slopePercent < 10) return SLOPE_ORANGE;
  if (slopePercent < 13) return SLOPE_RED;
  return SLOPE_BROWN;
}

function pointAtDistance(route: LatLng[], cum: number[], d: number): LatLng {
  if (route.length === 0) return [0, 0];
  if (route.length === 1) return route[0];
  if (d <= 0) return route[0];
  const total = cum[cum.length - 1] ?? 0;
  if (d >= total) return route[route.length - 1];
  for (let i = 1; i < route.length; i++) {
    const da = cum[i - 1];
    const db = cum[i];
    if (d > db) continue;
    const span = db - da;
    if (span <= 0) return route[i];
    const t = (d - da) / span;
    const a = route[i - 1];
    const b = route[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return route[route.length - 1];
}

function estimateWindAtPoint(
  p: LatLng,
  winds: WindPoint[]
): { dirDeg: number; speedMs: number } | null {
  type Candidate = { d2: number; dirDeg: number; speedMs: number };
  const candidates: Candidate[] = [];
  for (const w of winds) {
    if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon) || !Number.isFinite(w.dirDeg)) continue;
    const speedMs =
      typeof w.speedMs === "number"
        ? w.speedMs
        : typeof w.speedKmh === "number"
          ? w.speedKmh / 3.6
          : undefined;
    if (typeof speedMs !== "number") continue;
    const dx = w.lat - p[0];
    const dy = w.lon - p[1];
    candidates.push({ d2: dx * dx + dy * dy, dirDeg: w.dirDeg as number, speedMs });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.d2 - b.d2);
  const nearest = candidates.slice(0, 3);

  let sumW = 0;
  let sumSpeed = 0;
  let vx = 0;
  let vy = 0;
  for (const c of nearest) {
    const w = 1 / Math.max(1e-10, c.d2);
    sumW += w;
    sumSpeed += c.speedMs * w;
    const rad = (c.dirDeg * Math.PI) / 180;
    vx += Math.sin(rad) * w;
    vy += Math.cos(rad) * w;
  }
  if (sumW <= 0) return null;
  return {
    dirDeg: normalizeDeg((Math.atan2(vx / sumW, vy / sumW) * 180) / Math.PI),
    speedMs: sumSpeed / sumW,
  };
}

function windClusterCellMeters(zoom: number): number {
  // At very high zoom, disable clustering so every sampled wind point is shown.
  if (zoom >= 16) return 0;
  if (zoom <= 8) return 30000;
  if (zoom <= 10) return 12000;
  if (zoom <= 11) return 6000;
  if (zoom <= 12) return 3000;
  if (zoom <= 13) return 1500;
  if (zoom <= 14) return 500;
  if (zoom <= 15) return 180;
  return 80;
}

function aggregateWindsByZoom(winds: WindPoint[], zoom: number): WindPoint[] {
  const cellMeters = windClusterCellMeters(zoom);
  if (cellMeters <= 0) return winds;
  // Rough meter<->degree conversion (good enough for visual clustering)
  const latStep = cellMeters / 111320;
  if (!Number.isFinite(latStep) || latStep <= 0) return winds;

  type Agg = {
    count: number;
    latSum: number;
    lonSum: number;
    speedSum: number;
    vx: number;
    vy: number;
  };
  const buckets = new Map<string, Agg>();

  for (const w of winds) {
    if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon)) continue;
    const speedMs =
      typeof w.speedMs === "number"
        ? w.speedMs
        : typeof w.speedKmh === "number"
          ? w.speedKmh / 3.6
          : undefined;
    if (typeof w.dirDeg !== "number" || typeof speedMs !== "number") continue;

    const cosLat = Math.max(0.2, Math.cos((w.lat * Math.PI) / 180));
    const lonStep = latStep / cosLat;
    const gx = Math.round(w.lon / lonStep);
    const gy = Math.round(w.lat / latStep);
    const key = `${gx}:${gy}`;

    const rad = (w.dirDeg * Math.PI) / 180;
    const vx = Math.sin(rad);
    const vy = Math.cos(rad);

    const prev = buckets.get(key);
    if (prev) {
      prev.count += 1;
      prev.latSum += w.lat;
      prev.lonSum += w.lon;
      prev.speedSum += speedMs;
      prev.vx += vx;
      prev.vy += vy;
    } else {
      buckets.set(key, {
        count: 1,
        latSum: w.lat,
        lonSum: w.lon,
        speedSum: speedMs,
        vx,
        vy,
      });
    }
  }

  const out: WindPoint[] = [];
  for (const agg of buckets.values()) {
    if (agg.count <= 0) continue;
    const avgVx = agg.vx / agg.count;
    const avgVy = agg.vy / agg.count;
    const dirDeg = normalizeDeg((Math.atan2(avgVx, avgVy) * 180) / Math.PI);
    const speedMs = agg.speedSum / agg.count;
    out.push({
      lat: agg.latSum / agg.count,
      lon: agg.lonSum / agg.count,
      dirDeg,
      speedMs,
      speedKmh: speedMs * 3.6,
    });
  }
  return out;
}

function displayWindsByZoom(route: LatLng[], cum: number[], winds: WindPoint[], zoom: number): WindPoint[] {
  if (zoom < 14) return aggregateWindsByZoom(winds, zoom);
  const total = cum[cum.length - 1] ?? 0;
  if (!Number.isFinite(total) || total <= 0) return aggregateWindsByZoom(winds, zoom);
  const spacingMeters =
    zoom >= 17 ? 110 :
    zoom >= 16 ? 170 :
    zoom >= 15 ? 240 : 340;
  const count = Math.max(2, Math.min(500, Math.floor(total / spacingMeters) + 1));
  const out: WindPoint[] = [];
  for (let i = 0; i < count; i++) {
    const d = (i / (count - 1)) * total;
    const p = pointAtDistance(route, cum, d);
    const est = estimateWindAtPoint(p, winds);
    if (!est) continue;
    out.push({
      lat: p[0],
      lon: p[1],
      dirDeg: est.dirDeg,
      speedMs: est.speedMs,
      speedKmh: est.speedMs * 3.6,
    });
  }
  return out.length > 0 ? out : aggregateWindsByZoom(winds, zoom);
}

export default function RouteWindLayer({
  route,
  winds,
  elevPts = [],
  mode = "wind",
  weight = 6,
  segmentMeters = 500,
  zoom = 13,
}: Props) {
  if (!Array.isArray(route) || route.length < 2) return null;

  const cum = cumulativeDistances(route);
  const total = cum[cum.length - 1];
  
  if (!Number.isFinite(total) || total <= 0) {
    // Fallback: render simple route line
    const geojson = {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: route.map((pt: LatLng) => [pt[1], pt[0]]),
      },
      properties: {},
    };

    return (
      <Source id="fallback-route" type="geojson" data={geojson}>
        <Layer
          id="fallback-route-line"
          type="line"
          paint={{
            "line-color": FALLBACK_COLOR,
            "line-width": weight,
          }}
        />
      </Source>
    );
  }

  const segLen = Math.max(50, segmentMeters);
  const segCount = Math.max(1, Math.ceil(total / segLen));
  const windsToRender = displayWindsByZoom(route, cum, winds, zoom);
  const validElev = elevPts.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.elevation)
  ) as Array<{ lat: number; lon: number; elevation: number }>;
  const elevCum = cumulativeDistances(validElev.map((p) => [p.lat, p.lon] as LatLng));
  const elevVals = validElev.map((p) => p.elevation);
  const elevTotal = elevCum.length ? elevCum[elevCum.length - 1] : 0;

  const segments: { pts: LatLng[]; color: string; idx: number }[] = [];
  for (let k = 0; k < segCount; k++) {
    const d0 = k * segLen;
    const d1 = Math.min(total, (k + 1) * segLen);
    const pts = sliceBetween(route, cum, d0, d1);
    if (pts.length < 2) continue;

    const midPt = pts[Math.floor(pts.length / 2)] ?? pts[0];
    let color = FALLBACK_COLOR;
    if (mode === "slope") {
      if (elevTotal > 0 && total > 0) {
        const e0 = interpolateY(elevCum, elevVals, (d0 / total) * elevTotal);
        const e1 = interpolateY(elevCum, elevVals, (d1 / total) * elevTotal);
        if (typeof e0 === "number" && typeof e1 === "number") {
          const horizontal = Math.max(1, d1 - d0);
          // Signed slope: downhill is negative, uphill is positive.
          const slopePct = ((e1 - e0) / horizontal) * 100;
          color = slopeColor(slopePct);
        }
      }
    } else {
      const windDir = nearestWindDirDeg(winds, midPt);
      if (typeof windDir === "number") {
        const routeDir = bearingDeg(pts[0], pts[pts.length - 1]);
        const angle = smallestAngleDiffDeg(routeDir, windDir);
        color = routeWindAngleToColor(angle);
      }
    }

    segments.push({ pts, color, idx: k });
  }

  return (
    <>
      {segments.length > 0 ? (
        segments.map((s) => {
          const geojson = {
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: s.pts.map((pt: LatLng) => [pt[1], pt[0]]),
            },
            properties: {},
          };

          return (
            <Source
              key={`seg-${s.idx}`}
              id={`segment-${s.idx}`}
              type="geojson"
              data={geojson}
            >
              <Layer
                id={`segment-line-${s.idx}`}
                type="line"
                paint={{
                  "line-color": s.color,
                  "line-width": weight,
                }}
              />
            </Source>
          );
        })
      ) : (
        <Source
          id="fallback-route-2"
          type="geojson"
          data={{
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: route.map((pt: LatLng) => [pt[1], pt[0]]),
            },
            properties: {},
          }}
        >
          <Layer
            id="fallback-route-line-2"
            type="line"
            paint={{
              "line-color": FALLBACK_COLOR,
              "line-width": weight,
            }}
          />
        </Source>
      )}

      {/* Render wind direction arrows */}
      {windsToRender.map((w, i) => {
        if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return null;
        if (typeof w.dirDeg !== "number") return null;
        const speedMs =
          typeof w.speedMs === "number"
            ? w.speedMs
            : typeof w.speedKmh === "number"
              ? w.speedKmh / 3.6
              : undefined;
        if (typeof speedMs !== "number") return null;

        const icon = getArrowIcon(w.dirDeg, speedMs, zoom);
        
        return (
          <Marker
            key={`wind-${i}`}
            longitude={w.lon}
            latitude={w.lat}
          >
            <div
              title={`Wind speed: ${(speedMs * 3.6).toFixed(1)} km/h (${speedMs.toFixed(1)} m/s)`}
              dangerouslySetInnerHTML={{ __html: icon }}
              style={{ cursor: "pointer" }}
            />
          </Marker>
        );
      })}
    </>
  );
}
