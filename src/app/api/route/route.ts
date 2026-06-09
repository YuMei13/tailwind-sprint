// src/app/api/route/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LonLat = [number, number]; // [lon, lat]

type ORSGeometry = { type?: string; coordinates?: LonLat[] };
type ORSFeature = { geometry?: ORSGeometry; properties?: unknown };
type ORSResponseGeo = { features?: ORSFeature[] };

type ORSResponseJson = {
  routes?: Array<{
    geometry?: string; // encoded polyline（precision 5）
    way_points?: number[];
    bbox?: [number, number, number, number];
  }>;
  bbox?: [number, number, number, number];
};

type ORSResponse = (ORSResponseGeo & ORSResponseJson) & Record<string, unknown>;

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

/** 解析 ORS encoded polyline（precision=5）。回傳 [lon,lat][] */
function decodePolyline5(str: string): LonLat[] {
  let index = 0;
  const len = str.length;
  let lat = 0;
  let lon = 0;
  const coords: LonLat[] = [];
  const PREC = 1e-5;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlon = (result & 1) ? ~(result >> 1) : (result >> 1);

    lat += dlat;
    lon += dlon;
    // polyline 是 [lat,lon]，輸出 [lon,lat]
    coords.push([lon * PREC, lat * PREC]);
  }
  return coords;
}

export async function POST(req: NextRequest) {
  try {
    const bodyIn = (await req.json()) as
      | { start?: LonLat; end?: LonLat; profile?: string }
      | { coordinates?: LonLat[]; profile?: string };

    const profile =  (typeof (bodyIn as Record<string, unknown>).profile === "string"
        ? (bodyIn as { profile: string }).profile
        : undefined) ?? "cycling-regular";

    // 兼容舊版 start/end 與新版 coordinates
    let coordinates: LonLat[] | null = null;

    if ("coordinates" in bodyIn && Array.isArray(bodyIn.coordinates)) {
      const arr = bodyIn.coordinates.filter(isValidLonLat);
      if (arr.length >= 2) coordinates = arr;
    }
    if (!coordinates) {
      const s = (bodyIn as Record<string, unknown>).start as LonLat | undefined;
      const e = (bodyIn as Record<string, unknown>).end as LonLat | undefined;
      if (isValidLonLat(s) && isValidLonLat(e)) {
        coordinates = [s, e];
      }
    }

    if (!coordinates || coordinates.length < 2) {
      return NextResponse.json({ error: "missing or invalid coordinates" }, { status: 400 });
    }

    // ORS directions only accepts a handful of waypoints; reject oversized
    // payloads early instead of forwarding them upstream.
    const MAX_WAYPOINTS = 100;
    if (coordinates.length > MAX_WAYPOINTS) {
      return NextResponse.json(
        { error: `Too many waypoints (max ${MAX_WAYPOINTS})` },
        { status: 400 }
      );
    }

    const ORS_KEY = process.env.ORS_API_KEY;
    if (!ORS_KEY) {
      return NextResponse.json({ error: "Missing ORS_API_KEY" }, { status: 500 });
    }

    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    const key = buildKey("route", { coordinates, profile });

    const raw = await cacheFetchJSON<ORSResponse>(
      key,
      3600, // 1h
      async () => {
        const url = `https://api.openrouteservice.org/v2/directions/${encodeURIComponent(profile)}`;
        const payload = {
          coordinates,              // 多點（含起訖）：[[lon,lat], [lon,lat], ...]
          instructions: false,      // 不要逐步導航
          geometry_simplify: false, // 完整軌跡
          // 注意：不要帶 geometry_format（新版 ORS 會 400）
        };

        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: ORS_KEY, // ORS 期待此 header
          },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });

        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          // 401 大多是 key 沒帶上或環境變數沒設在「對應環境」
          throw new Error(`ORS ${r.status} ${txt}`.trim());
        }
        return (await r.json()) as ORSResponse;
      },
      nocache
    );

    // ① 優先：GeoJSON
    const coordsGeo = raw?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coordsGeo) && coordsGeo.length >= 2) {
      return NextResponse.json(
        { geometry: { type: "LineString", coordinates: coordsGeo } },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // ② 退回：encoded polyline (precision 5)
    const enc = raw?.routes?.[0]?.geometry;
    if (typeof enc === "string" && enc.length > 0) {
      const coords = decodePolyline5(enc); // [lon,lat][]
      if (coords.length >= 2) {
        return NextResponse.json(
          { geometry: { type: "LineString", coordinates: coords } },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // ③ 還是拿不到 → 回傳 raw 方便排查
    return NextResponse.json(
      { error: "No coordinates from ORS", raw },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
