// src/components/RouteWindLayer.tsx
"use client";
import { Source, Layer, Marker } from "react-map-gl";
import { windToColor } from "@/lib/wind";
import { getArrowIcon } from "@/lib/windIcons";
import { haversine } from "@/lib/geo";

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

  // Debug: Log wind data
  if (winds.length > 0 && typeof window !== 'undefined') {
    const windSpeeds = winds
      .filter((w) => typeof w.speedKmh === 'number')
      .map((w) => ({
        speedKmh: w.speedKmh,
        speedMs: (w.speedKmh! / 3.6).toFixed(2),
      }));
    console.log('[Wind Debug] Received winds:', { count: winds.length, samples: windSpeeds.slice(0, 5) });
  }

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

  // Debug: Log segment averages
  if (typeof window !== 'undefined' && segAvg.some((v) => v !== undefined)) {
    const avgWinds = segAvg.filter((v) => v !== undefined);
    console.log('[Wind Debug] Segment averages (m/s):', {
      min: Math.min(...avgWinds),
      max: Math.max(...avgWinds),
      avg: (avgWinds.reduce((a, b) => a + b, 0) / avgWinds.length).toFixed(2),
      count: avgWinds.length,
    });
  }

  const segments: { pts: LatLng[]; color: string; idx: number }[] = [];
  for (let k = 0; k < segCount; k++) {
    const d0 = k * segLen;
    const d1 = Math.min(total, (k + 1) * segLen);
    const pts = sliceBetween(route, cum, d0, d1);
    if (pts.length < 2) continue;

    const sp = segAvg[k];
    const color = typeof sp === "number" ? windToColor(sp) : FALLBACK_COLOR;

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
        if (typeof w.dirDeg !== "number" || typeof w.speedKmh !== "number") return null;

        const icon = getArrowIcon(w.dirDeg, 60);
        
        return (
          <Marker
            key={`wind-${i}`}
            longitude={w.lon}
            latitude={w.lat}
          >
            <div
              title={`Wind speed: ${w.speedKmh?.toFixed(1)} km/h`}
              dangerouslySetInnerHTML={{ __html: icon }}
              style={{ cursor: "pointer" }}
            />
          </Marker>
        );
      })}
    </>
  );
}
