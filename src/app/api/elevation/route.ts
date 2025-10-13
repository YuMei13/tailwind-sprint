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

// === 沿著路線每隔 stepMeters 取樣 ===
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
      result.push([lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
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

// === 主 API ===
export async function POST(req: NextRequest) {
  try {
    const { coords, intervalMeters = 50, dataset = "srtm90m" } = (await req.json()) as {
      coords?: LonLat[];
      intervalMeters?: number;
      dataset?: string;
    };

    if (!coords || coords.length < 2) return NextResponse.json({ points: [] });

    const samples = interpolateAlongPath(coords, Math.max(50, intervalMeters));
    const key = buildKey("elev", { samples, dataset });
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";

    const data = await cacheFetchJSON<{ points: ElevPt[] }>(
      key,
      86400,
      async () => {
        const batchSize = 90;
        const allPts: ElevPt[] = [];
        for (let i = 0; i < samples.length; i += batchSize) {
          const chunk = samples.slice(i, i + batchSize);
          try {
            const part = await fetchElevBatch(chunk, dataset, 20000);
            allPts.push(...part);
          } catch {
            for (const [lon, lat] of chunk)
              allPts.push({ lat, lon, error: true, msg: "elev fetch failed" });
          }
        }
        // console.log("ElevationAPI OK:", allPts.length, allPts.slice(0, 3));
        return { points: allPts };
      },
      nocache
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    console.error("Elevation API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}