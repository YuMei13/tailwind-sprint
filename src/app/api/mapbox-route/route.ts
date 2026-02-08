// src/app/api/mapbox-route/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type LonLat = [number, number]; // [lon, lat]

interface MapboxRouteResponse {
  code: string;
  routes?: Array<{
    geometry: {
      coordinates: LonLat[];
      type: "LineString";
    };
    distance: number;
    duration: number;
  }>;
  waypoints?: Array<{
    name: string;
    location: LonLat;
  }>;
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

export async function POST(req: NextRequest) {
  try {
    const bodyIn = (await req.json()) as { start?: LonLat; end?: LonLat; coordinates?: LonLat[] };
    const profile = "cycling";

    // Compatible with start/end and coordinates input
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
      console.warn("Mapbox Route API: invalid input", bodyIn);
      return NextResponse.json({ error: "missing or invalid coordinates" }, { status: 400 });
    }

    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!MAPBOX_TOKEN) {
      console.error("Mapbox Route API: missing NEXT_PUBLIC_MAPBOX_TOKEN");
      return NextResponse.json({ error: "Missing MAPBOX_TOKEN" }, { status: 500 });
    }

    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    const key = buildKey("mapbox-route", { coordinates, profile });

    const data = await cacheFetchJSON<{ geometry: { type: "LineString"; coordinates: LonLat[] } }>(
      key,
      3600, // 1 hour cache
      async () => {
        // Mapbox Directions API
        // Profile can be: driving (default), driving-traffic, walking, cycling
        // Mapbox Directions API limits the number of coordinates (waypoints).
        // If we receive too many coordinates, down-sample evenly to the API limit.
        const MAX_COORDS = 25;
        let useCoordinates = coordinates!;
        if (useCoordinates.length > MAX_COORDS) {
          const sampled: LonLat[] = [];
          for (let i = 0; i < MAX_COORDS; i++) {
            const idx = Math.round((i * (useCoordinates.length - 1)) / (MAX_COORDS - 1));
            sampled.push(useCoordinates[idx]);
          }
          useCoordinates = sampled;
          console.warn("Mapbox Route API: downsampled coordinates to meet Mapbox limit", {
            original: coordinates!.length,
            used: useCoordinates.length,
          });
        }
        const coordsStr = useCoordinates.map(([lon, lat]) => `${lon},${lat}`).join(";");
        const url = `https://api.mapbox.com/directions/v5/mapbox/${encodeURIComponent(profile)}/${coordsStr}?access_token=${MAPBOX_TOKEN}&geometries=geojson&steps=false&alternatives=false`;

        const r = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });

        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`Mapbox Directions ${r.status} ${txt}`.trim());
        }

        const response = (await r.json()) as MapboxRouteResponse;

        if (response.code !== "Ok" || !response.routes || response.routes.length === 0) {
          throw new Error(`Mapbox: ${response.code}`);
        }

        const route = response.routes[0];
        console.warn("Mapbox Route API: route ok", {
          profile,
          inputPoints: coordinates?.length ?? 0,
          outputPoints: route.geometry.coordinates?.length ?? 0,
          distance: route.distance,
          duration: route.duration,
        });
        return {
          geometry: {
            type: "LineString" as const,
            coordinates: route.geometry.coordinates,
          },
        };
      },
      nocache
    );

    console.warn("Mapbox Route API: response sent", {
      points: data.geometry.coordinates.length,
      nocache,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    console.error("Mapbox Route API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
