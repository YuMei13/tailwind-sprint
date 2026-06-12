// 強制不要做靜態生成，且使用 Node runtime（避免 Edge 限制）
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LonLat = [number, number]; // [lon, lat]
type ElevPt = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };

// === Haversine 計算距離（公尺） ===
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidLonLat(p: unknown): p is LonLat {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}

function toLonLat(p: [number, number]): LonLat | null {
  const [a, b] = p;
  const asLonLat = Math.abs(a) <= 180 && Math.abs(b) <= 90;
  const asLatLon = Math.abs(a) <= 90 && Math.abs(b) <= 180;
  if (asLonLat && !asLatLon) return [a, b];
  if (asLatLon) return [b, a];
  return null;
}

// === 沿著路線每隔 stepMeters 取樣（固定距離，不跟隨原始點密度） ===
function interpolateAlongPath(coords: LonLat[], stepMeters: number): LonLat[] {
  if (coords.length < 2) return coords;
  const result: LonLat[] = [coords[0]];
  let nextDist = stepMeters;
  let traversed = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const segLen = haversineMeters(lat1, lon1, lat2, lon2);
    if (!Number.isFinite(segLen) || segLen <= 0) continue;

    while (traversed + segLen >= nextDist) {
      const t = (nextDist - traversed) / segLen;
      result.push([lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]);
      nextDist += stepMeters;
    }

    traversed += segLen;
  }

  const last = coords[coords.length - 1];
  const tail = result[result.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) result.push(last);
  return result;
}

// === 呼叫 OpenTopoData ===
async function fetchElevBatch(points: LonLat[], dataset: string, timeoutMs = 20000) {
  const loc = points.map(([lon, lat]) => `${lat},${lon}`).join("|");
  const url = `https://api.opentopodata.org/v1/${encodeURIComponent(dataset)}?locations=${encodeURIComponent(loc)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OpenTopoData ${res.status}`);
  const json = await res.json() as {
    results?: Array<{ elevation?: number; location?: { lat?: number; lng?: number } }>;
  };

  const arr = json.results ?? [];
  const out: ElevPt[] = arr.map((it, i) => {
    const lat = Number(it.location?.lat ?? points[i]?.[1]);
    const lon = Number(it.location?.lng ?? points[i]?.[0]);
    const elevation = Number(it.elevation ?? NaN);
    return { lat, lon, elevation };
  });
  return out.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.elevation));
}

// === Fallback: Open-Meteo elevation API ===
async function fetchElevBatchFallback(points: LonLat[], timeoutMs = 20000) {
  if (!points.length) return [];
  const latitudes = points.map(([, lat]) => lat.toFixed(6)).join(",");
  const longitudes = points.map(([lon]) => lon.toFixed(6)).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitudes}&longitude=${longitudes}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OpenMeteo ${res.status}`);
  const json = (await res.json()) as { elevation?: number[] };
  const elev = Array.isArray(json.elevation) ? json.elevation : [];

  const out: ElevPt[] = points.map(([lon, lat], i) => {
    const elevation = Number(elev[i] ?? NaN);
    return { lat, lon, elevation };
  });
  return out.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.elevation));
}

// === Fallback: Mapbox Terrain Tilequery (contour ele) ===
async function fetchElevBatchMapbox(points: LonLat[], timeoutMs = 20000) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !points.length) return [];

  const out: ElevPt[] = [];
  for (const [lon, lat] of points) {
    try {
      const url =
        `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/` +
        `${lon},${lat}.json?layers=contour&limit=1&access_token=${token}`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        out.push({ lat, lon, error: true, msg: `mapbox terrain ${res.status}` });
        continue;
      }
      const json = (await res.json()) as {
        features?: Array<{ properties?: { ele?: number } }>;
      };
      const elevation = Number(json.features?.[0]?.properties?.ele ?? NaN);
      if (Number.isFinite(elevation)) {
        out.push({ lat, lon, elevation });
      } else {
        out.push({ lat, lon, error: true, msg: "mapbox terrain no elevation" });
      }
    } catch {
      out.push({ lat, lon, error: true, msg: "mapbox terrain fetch failed" });
    }
  }

  return out;
}

// === 主 API ===
export async function POST(req: NextRequest) {
  try {
    const { coords, points, intervalMeters = 50, dataset = "srtm90m" } = (await req.json()) as {
      coords?: LonLat[];
      points?: [number, number][];
      intervalMeters?: number;
      dataset?: string;
    };

    // intervalMeters must be a finite positive number; otherwise Math.max(50, NaN)
    // is NaN and interpolateAlongPath silently degrades to just the endpoints.
    const interval = Number(intervalMeters);
    if (!Number.isFinite(interval) || interval <= 0) {
      return NextResponse.json({ error: "Invalid intervalMeters" }, { status: 400 });
    }

    // Cap the raw input before filtering/interpolating so an oversized array
    // can't drive O(n) validation + interpolation work.
    const MAX_INPUT_COORDS = 50000;
    const rawLen = Array.isArray(coords) ? coords.length : Array.isArray(points) ? points.length : 0;
    if (rawLen > MAX_INPUT_COORDS) {
      return NextResponse.json(
        { error: `Too many input coordinates (max ${MAX_INPUT_COORDS})` },
        { status: 400 }
      );
    }

    const routeCoords: LonLat[] = Array.isArray(coords)
      ? coords.filter(isValidLonLat)
      : Array.isArray(points)
        ? points.map((p) => toLonLat(p)).filter((p): p is LonLat => p !== null)
        : [];

    if (routeCoords.length < 2) {
      return NextResponse.json({ points: [] });
    }

    const stepMeters = Math.max(50, interval);

    // Reject oversized routes BEFORE building the interpolated array (which would
    // otherwise allocate ~totalLength/step points up front). Estimating the sample
    // count from total route length costs only O(routeCoords).
    const MAX_SAMPLES = 10000;
    let totalMeters = 0;
    for (let i = 1; i < routeCoords.length; i++) {
      const [lon1, lat1] = routeCoords[i - 1];
      const [lon2, lat2] = routeCoords[i];
      totalMeters += haversineMeters(lat1, lon1, lat2, lon2);
    }
    if (totalMeters / stepMeters > MAX_SAMPLES) {
      return NextResponse.json(
        { error: `Route too long to sample (max ${MAX_SAMPLES} points)` },
        { status: 400 }
      );
    }

    const samples = interpolateAlongPath(routeCoords, stepMeters);
    const key = buildKey("elev", { samples, dataset });
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";

    const data = await cacheFetchJSON<{ points: ElevPt[] }>(
      key,
      86400,
      async () => {
        const batchSize = 60;
        const chunks: LonLat[][] = [];
        for (let i = 0; i < samples.length; i += batchSize) {
          chunks.push(samples.slice(i, i + batchSize));
        }

        const fetchChunk = async (chunk: LonLat[]): Promise<ElevPt[]> => {
          try {
            return await fetchElevBatch(chunk, dataset, 20000);
          } catch {
            try {
              return await fetchElevBatchFallback(chunk, 20000);
            } catch {
              try {
                return await fetchElevBatchMapbox(chunk, 20000);
              } catch {
                return chunk.map(([lon, lat]) => ({ lat, lon, error: true as const, msg: "elev fetch failed" }));
              }
            }
          }
        };

        // Run chunks in parallel (bounded) instead of sequentially, preserving order.
        const CONCURRENCY = 8;
        const parts: ElevPt[][] = new Array(chunks.length);
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.max(1, Math.min(CONCURRENCY, chunks.length)) }, async () => {
            while (true) {
              const i = next++;
              if (i >= chunks.length) return;
              parts[i] = await fetchChunk(chunks[i]);
            }
          })
        );
        return { points: parts.flat() };
      },
      nocache,
      (payload) => payload.points.some((p) => typeof p.elevation === "number")
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    console.error("Elevation API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
