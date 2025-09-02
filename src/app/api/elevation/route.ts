// src/app/api/elevation/route.ts
import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";
import { sampleByDistance } from "@/lib/geo";

// 避免部份環境優先用 IPv6 卡住
dns.setDefaultResultOrder?.("ipv4first");

type LatLon = [number, number]; // [lat, lon]
type LonLat = [number, number]; // [lon, lat]

type BodyByCoords = {
  coords: LonLat[];
  dataset?: string;
  intervalMeters?: number;
};

type BodyByPoints = {
  points: LatLon[];
  dataset?: string;
};

type ElevReq = BodyByCoords | BodyByPoints;

type ElevPoint = {
  lat: number;
  lon: number;
  elevation?: number;
  error?: true;
  msg?: string;
};

const DEFAULT_DATASET = "srtm90m";
const MAX_POINTS = 600;   // 安全上限，避免濫呼或 URL 過長
const BATCH_SIZE = 100;   // 單次最多 100 點

function isBodyByCoords(v: unknown): v is BodyByCoords {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as BodyByCoords).coords)
  );
}

function isBodyByPoints(v: unknown): v is BodyByPoints {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as BodyByPoints).points)
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchOpenTopoBatch(
  pts: LatLon[],
  dataset: string
): Promise<ElevPoint[]> {
  // GET /v1/{dataset}?locations=lat,lon|lat,lon|...
  const list = pts.map(([lat, lon]) => `${lat},${lon}`).join("|");
  const url = new URL(
    `https://api.opentopodata.org/v1/${encodeURIComponent(dataset)}`
  );
  url.searchParams.set("locations", list);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000); // 8s timeout
  try {
    const res = await fetch(url, { signal: ac.signal, next: { revalidate: 600 } });
    if (!res.ok) {
      return pts.map(([lat, lon]) => ({
        lat,
        lon,
        error: true as const,
        msg: `HTTP ${res.status}`,
      }));
    }

    const json = (await res.json()) as {
      results?: { location: { lat: number; lng: number }; elevation?: number }[];
    };

    const results = Array.isArray(json.results) ? json.results : [];
    const out: ElevPoint[] = [];

    for (let i = 0; i < pts.length; i++) {
      const src = pts[i];
      const r = results[i];
      if (r && typeof r.elevation === "number") {
        out.push({ lat: src[0], lon: src[1], elevation: r.elevation });
      } else {
        out.push({ lat: src[0], lon: src[1], error: true as const, msg: "No elevation" });
      }
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return pts.map(([lat, lon]) => ({ lat, lon, error: true as const, msg }));
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as unknown;

    let dataset = DEFAULT_DATASET;
    let latlon: LatLon[] = [];

    if (isBodyByPoints(body)) {
      dataset = body.dataset || DEFAULT_DATASET;
      latlon = body.points.map(([lat, lon]) => [Number(lat), Number(lon)]);
    } else if (isBodyByCoords(body)) {
      dataset = body.dataset || DEFAULT_DATASET;
      const coords = body.coords.map(([lon, lat]) => [Number(lon), Number(lat)]) as LonLat[];

      if (typeof body.intervalMeters === "number" && Number.isFinite(body.intervalMeters)) {
        // 距離均分抽樣（回 [lat,lon]）
        latlon = sampleByDistance(coords, body.intervalMeters);
      } else {
        // 直接轉換為 [lat,lon]
        latlon = coords.map(([lon, lat]) => [lat, lon]);
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Invalid body. Expect { coords:[ [lon,lat],... ], intervalMeters? } or { points:[ [lat,lon],... ] }",
          code: "BAD_REQUEST",
        },
        { status: 400 }
      );
    }

    // 安全上限
    if (latlon.length > MAX_POINTS) latlon = latlon.slice(0, MAX_POINTS);

    // 分批查詢
    const batches = chunk(latlon, BATCH_SIZE);
    const parts: ElevPoint[][] = [];
    for (const b of batches) {
      // 串行較穩；若想更快可改 Promise.all（注意外部 API 限流）
      // eslint-disable-next-line no-await-in-loop
      parts.push(await fetchOpenTopoBatch(b, dataset));
    }
    const points = parts.flat();

    // 若有至少一筆成功回 elevation → 200，否則 502（上游可能出錯）
    const ok = points.some((p) => typeof p.elevation === "number");
    return NextResponse.json({ points }, { status: ok ? 200 : 502 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
