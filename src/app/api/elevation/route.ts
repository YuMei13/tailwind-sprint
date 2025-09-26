// src/app/api/elevation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LonLat = [number, number]; // [lon,lat]
type ElevPt = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function interpolateAlongPath(coords: LonLat[], stepMeters: number): LonLat[] {
  if (coords.length < 2) return coords;
  const result: LonLat[] = [coords[0]];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const segLen = haversineMeters(lat1, lon1, lat2, lon2);
    const n = Math.max(1, Math.floor(segLen / stepMeters));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const lon = lon1 + (lon2 - lon1) * t;
      const lat = lat1 + (lat2 - lat1) * t;
      result.push([lon, lat]);
    }
  }
  return result;
}

async function fetchElevBatch(points: LonLat[], dataset: string, timeoutMs = 20000) {
  // OpenTopoData: GET /v1/<dataset>?locations=lat,lon|lat,lon|...
  const loc = points.map(([lon, lat]) => `${lat},${lon}`).join("|");
  const url = `https://api.opentopodata.org/v1/${encodeURIComponent(dataset)}?locations=${encodeURIComponent(loc)}`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`OpenTopoData ${r.status}`);
  const j = (await r.json()) as { results?: Array<{ location?: { lat?: number; lng?: number }; elevation?: number }> };
  const arr = j.results ?? [];
  const out: ElevPt[] = arr.map((it) => ({
    lat: it.location?.lat ?? NaN,
    lon: it.location?.lng ?? NaN,
    elevation: it.elevation ?? undefined,
  }));
  return out.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export async function POST(req: NextRequest) {
  try {
    const { coords, intervalMeters = 300, dataset = "srtm90m" } = (await req.json()) as {
      coords?: LonLat[];
      intervalMeters?: number;
      dataset?: string;
    };
    if (!coords || coords.length < 2) return NextResponse.json({ points: [] });

    const samples = interpolateAlongPath(coords, Math.max(50, intervalMeters)); // 最小 50m
    const key = buildKey("elev", { samples, dataset });
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";

    const data = await cacheFetchJSON<{ points: ElevPt[] }>(
      key,
      86400, // 1 day
      async () => {
        const batchSize = 90; // OpenTopoData 建議每批不要太大
        const out: ElevPt[] = [];
        for (let i = 0; i < samples.length; i += batchSize) {
          const chunk = samples.slice(i, i + batchSize);
          try {
            const part = await fetchElevBatch(chunk, dataset, 20000);
            out.push(...part);
          } catch (e) {
            // 批次失敗則標記錯誤
            for (const [lon, lat] of chunk) out.push({ lat, lon, error: true as const, msg: "elev fetch failed" });
          }
        }
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
