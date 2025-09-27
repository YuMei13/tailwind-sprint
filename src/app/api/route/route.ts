// src/app/api/route/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type ORSGeometry = { type?: string; coordinates?: [number, number][] };
type ORSFeature = { geometry?: ORSGeometry; properties?: unknown };
type ORSResponseGeo = { features?: ORSFeature[] };

type ORSResponseJson = {
  routes?: Array<{
    geometry?: string; // encoded polyline（precision 6）
    way_points?: number[];
    bbox?: [number, number, number, number];
  }>;
  bbox?: [number, number, number, number];
};

type ORSResponse = (ORSResponseGeo & ORSResponseJson) & Record<string, unknown>;

/** 解析 ORS encoded polyline（precision=5）。回傳 [lon,lat][] */
function decodePolyline6(str: string): [number, number][] {
  let index = 0;
  const len = str.length;
  let lat = 0;
  let lon = 0;
  const coords: [number, number][] = [];
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
    // polyline 是 [lat,lon]，我們輸出 [lon,lat]
    coords.push([lon * PREC, lat * PREC]);
  }
  return coords;
}

export async function POST(req: NextRequest) {
  try {
    const { start, end, profile = "cycling-regular" } = (await req.json()) as {
      start?: [number, number]; // [lon,lat]
      end?: [number, number];
      profile?: string;
    };
    if (!start || !end) return NextResponse.json({ error: "missing start/end" }, { status: 400 });

    const ORS_KEY = process.env.ORS_API_KEY;
    if (!ORS_KEY) return NextResponse.json({ error: "Missing ORS_API_KEY" }, { status: 500 });

    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    const key = buildKey("route", { start, end, profile });

    const raw = await cacheFetchJSON<ORSResponse>(
      key,
      3600, // 1h
      async () => {
        const url = `https://api.openrouteservice.org/v2/directions/${encodeURIComponent(profile)}`;
        const body = {
          coordinates: [start, end],      // [ [lon,lat], [lon,lat] ]
          instructions: false,            // 我們不需要逐步指示
          geometry_simplify: false,       // 要完整軌跡
          // geometry_format: "geojson",     // 盡量請 ORS 回 GeoJSON（若仍回 json，我們會 fallback）
          // response_fields: ["geometry"], // 可再精簡回傳（若你的額度敏感，可打開）
        };

        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: ORS_KEY, // ORS 使用 Authorization header（你原本就正確）
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });

        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`ORS ${r.status} ${txt}`.trim());
        }
        return (await r.json()) as ORSResponse;
      },
      nocache
    );

    // ① 嘗試 GeoJSON
    const coordsGeo = raw?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coordsGeo) && coordsGeo.length >= 2) {
      return NextResponse.json(
        { geometry: { type: "LineString", coordinates: coordsGeo } },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // ② fallback：encoded polyline
    const enc = raw?.routes?.[0]?.geometry;
    if (typeof enc === "string" && enc.length > 0) {
      const coords = decodePolyline6(enc); // [lon,lat][]
      if (coords.length >= 2) {
        return NextResponse.json(
          { geometry: { type: "LineString", coordinates: coords } },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // ③ 仍失敗 → 帶回 raw 方便你排查
    return NextResponse.json(
      { error: "No coordinates from ORS", raw },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
