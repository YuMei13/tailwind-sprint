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
  weight?: number;
  segmentMeters?: number;
};

const FALLBACK_COLOR = "#6b7280";

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

  const segments: { pts: LatLng[]; color: string; idx: number }[] = [];
  for (let k = 0; k < segCount; k++) {
    const d0 = k * segLen;
    const d1 = Math.min(total, (k + 1) * segLen);
    const pts = sliceBetween(route, cum, d0, d1);
    if (pts.length < 2) continue;

    const midPt = pts[Math.floor(pts.length / 2)] ?? pts[0];
    const windDir = nearestWindDirDeg(winds, midPt);
    let color = FALLBACK_COLOR;
    if (typeof windDir === "number") {
      const routeDir = bearingDeg(pts[0], pts[pts.length - 1]);
      const angle = smallestAngleDiffDeg(routeDir, windDir);
      color = routeWindAngleToColor(angle);
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
      {winds.map((w, i) => {
        if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return null;
        if (typeof w.dirDeg !== "number") return null;
        const speedMs =
          typeof w.speedMs === "number"
            ? w.speedMs
            : typeof w.speedKmh === "number"
              ? w.speedKmh / 3.6
              : undefined;
        if (typeof speedMs !== "number") return null;

        const icon = getArrowIcon(w.dirDeg, speedMs);
        
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
