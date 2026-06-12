// src/app/api/wind/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LatLon = [number, number]; // [lat, lon]

// Upper bound on points per request to avoid fanning out into an unbounded
// number of upstream Open-Meteo calls from a single public request.
const MAX_POINTS = 2000;
// Open-Meteo accepts many coordinates per request; chunk to stay well within
// limits and keep each URL a sane length.
const BATCH_SIZE = 100;

function isValidLatLon(p: unknown): p is LatLon {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 90 &&
    Math.abs(p[1]) <= 180
  );
}
type WindPoint = {
  lat: number;
  lon: number;
  speedMs?: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

type OpenMeteoLoc = {
  current?: { wind_speed_10m?: number; wind_direction_10m?: number };
  hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] };
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Pick the current (or nearest-forecast) wind for one location's Open-Meteo result.
function extractWind(loc: OpenMeteoLoc | undefined, forecastIsoUtc?: string) {
  let sp = loc?.current?.wind_speed_10m ?? null; // m/s
  let dir = loc?.current?.wind_direction_10m ?? null; // deg
  if (forecastIsoUtc && loc?.hourly?.time?.length) {
    const times = loc.hourly.time;
    const speeds = loc.hourly.wind_speed_10m ?? [];
    const dirs = loc.hourly.wind_direction_10m ?? [];
    const target = Date.parse(forecastIsoUtc);
    if (Number.isFinite(target)) {
      let bestIdx = -1;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (let i = 0; i < times.length; i++) {
        const t = Date.parse(times[i]);
        if (!Number.isFinite(t)) continue;
        const delta = Math.abs(t - target);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const s = speeds[bestIdx];
        const d = dirs[bestIdx];
        if (typeof s === "number" && Number.isFinite(s)) sp = s;
        if (typeof d === "number" && Number.isFinite(d)) dir = d;
      }
    }
  }
  const speedMs = sp != null ? Math.round(sp * 10) / 10 : undefined;
  return {
    speedMs,
    speedKmh: speedMs != null ? Math.round(speedMs * 3.6 * 10) / 10 : undefined,
    dirDeg: dir != null ? Math.round(dir) : undefined,
  };
}

// Fetch wind for many points in ONE Open-Meteo request (comma-separated coords),
// instead of one request per point. Only request the (large) hourly forecast
// when a forecast time is actually selected.
async function fetchWindBatch(
  batch: LatLon[],
  forecastIsoUtc?: string,
  timeoutMs = 20000
): Promise<WindPoint[]> {
  const lats = batch.map(([lat]) => lat).join(",");
  const lons = batch.map(([, lon]) => lon).join(",");
  const hourly = forecastIsoUtc
    ? "&hourly=wind_speed_10m,wind_direction_10m&forecast_days=16"
    : "";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=wind_speed_10m,wind_direction_10m${hourly}&wind_speed_unit=ms&timezone=UTC`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OpenMeteo ${res.status}`);
  const j = (await res.json()) as OpenMeteoLoc | OpenMeteoLoc[];
  // Open-Meteo returns an array for multiple locations, a single object for one.
  const arr = Array.isArray(j) ? j : [j];
  return batch.map(([lat, lon], i) => ({ lat, lon, ...extractWind(arr[i], forecastIsoUtc) }));
}

export async function POST(req: NextRequest) {
  try {
    const { points, forecastIsoUtc } = (await req.json()) as { points?: LatLon[]; forecastIsoUtc?: string }; // [lat,lon]
    if (!Array.isArray(points) || points.length === 0) return NextResponse.json({ points: [] });
    if (points.length > MAX_POINTS) {
      return NextResponse.json({ error: `Too many points (max ${MAX_POINTS})` }, { status: 400 });
    }
    if (!points.every(isValidLatLon)) {
      return NextResponse.json({ error: "Invalid points" }, { status: 400 });
    }
    // A non-empty forecastIsoUtc must be a parseable date; otherwise new Date()
    // yields Invalid Date and the hourKey/upstream query silently break.
    if (forecastIsoUtc && !Number.isFinite(Date.parse(forecastIsoUtc))) {
      return NextResponse.json({ error: "Invalid forecastIsoUtc" }, { status: 400 });
    }

    // 以「UTC 小時」做分桶，避免跨時段混用
    const now = forecastIsoUtc ? new Date(forecastIsoUtc) : new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const key = buildKey("wind", { points, hourKey, unit: "ms", forecastIsoUtc: forecastIsoUtc ?? "", v: 4 });
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";

    const data = await cacheFetchJSON<{ points: WindPoint[] }>(
      key,
      90,
      async () => {
        // One request per chunk; chunks run in parallel.
        const batches = chunk(points, BATCH_SIZE);
        const results = await Promise.all(
          batches.map(async (b) => {
            try {
              return await fetchWindBatch(b, forecastIsoUtc, 20000);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "fetch failed";
              return b.map(([lat, lon]) => ({ lat, lon, error: true as const, msg } satisfies WindPoint));
            }
          })
        );
        return { points: results.flat() };
      },
      nocache
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
