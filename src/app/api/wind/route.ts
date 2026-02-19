// src/app/api/wind/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LatLon = [number, number]; // [lat, lon]
type WindPoint = {
  lat: number;
  lon: number;
  speedMs?: number;
  speedKmh?: number;
  dirDeg?: number;
  error?: true;
  msg?: string;
};

async function fetchWind(lat: number, lon: number, timeoutMs = 12000) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OpenMeteo ${res.status}`);
  const j = (await res.json()) as { current?: { wind_speed_10m?: number; wind_direction_10m?: number } };
  const sp = j.current?.wind_speed_10m ?? null; // m/s
  const dir = j.current?.wind_direction_10m ?? null; // deg
  const speedMs = sp != null ? Math.round(sp * 10) / 10 : undefined;
  return {
    speedMs,
    speedKmh: speedMs != null ? Math.round(speedMs * 3.6 * 10) / 10 : undefined,
    dirDeg: dir != null ? Math.round(dir) : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { points } = (await req.json()) as { points?: LatLon[] }; // [lat,lon]
    if (!points || points.length === 0) return NextResponse.json({ points: [] });

    // 以「UTC 小時」做分桶，避免跨時段混用
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const key = buildKey("wind", { points, hourKey, unit: "ms", v: 2 });
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";

    const data = await cacheFetchJSON<{ points: WindPoint[] }>(
      key,
      90,
      async () => {
        const out = await Promise.all(
          points.map(async ([lat, lon]) => {
            try {
              const w = await fetchWind(lat, lon, 8000);
              return { lat, lon, ...w } satisfies WindPoint;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "fetch failed";
              return { lat, lon, error: true as const, msg } satisfies WindPoint;
            }
          })
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
