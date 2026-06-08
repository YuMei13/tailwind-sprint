// src/app/api/wind/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LatLon = [number, number]; // [lat, lon]

// Upper bound on points per request to avoid fanning out into an unbounded
// number of upstream Open-Meteo calls from a single public request.
const MAX_POINTS = 2000;

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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => run()));
  return out;
}

async function fetchWind(
  lat: number,
  lon: number,
  forecastIsoUtc?: string,
  timeoutMs = 12000
) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=UTC&forecast_days=16`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OpenMeteo ${res.status}`);
  const j = (await res.json()) as {
    current?: { wind_speed_10m?: number; wind_direction_10m?: number };
    hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] };
  };
  let sp = j.current?.wind_speed_10m ?? null; // m/s
  let dir = j.current?.wind_direction_10m ?? null; // deg
  if (forecastIsoUtc && j.hourly?.time?.length) {
    const times = j.hourly.time;
    const speeds = j.hourly.wind_speed_10m ?? [];
    const dirs = j.hourly.wind_direction_10m ?? [];
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

    // 以「UTC 小時」做分桶，避免跨時段混用
    const now = forecastIsoUtc ? new Date(forecastIsoUtc) : new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const key = buildKey("wind", { points, hourKey, unit: "ms", forecastIsoUtc: forecastIsoUtc ?? "", v: 3 });
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";

    const data = await cacheFetchJSON<{ points: WindPoint[] }>(
      key,
      90,
      async () => {
        const out = await mapWithConcurrency(
          points,
          6,
          async ([lat, lon]) => {
            try {
              const w = await fetchWind(lat, lon, forecastIsoUtc, 12000);
              return { lat, lon, ...w } satisfies WindPoint;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "fetch failed";
              return { lat, lon, error: true as const, msg } satisfies WindPoint;
            }
          }
        );
        return { points: out };
      },
      nocache
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
