// src/app/api/geocode/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type GeoItem = { id: string; name: string; lat: number; lon: number; type?: string };

const ORS_KEY = process.env.ORS_API_KEY;
const BASE = "https://api.openrouteservice.org/geocode/search";

export async function GET(req: NextRequest) {
  try {
    if (!ORS_KEY) return NextResponse.json({ error: "Missing ORS_API_KEY" }, { status: 500 });

    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();
    const limit = Math.min(8, Number(u.searchParams.get("limit") || "5"));
    const lang = u.searchParams.get("lang") || "zh-TW";
    const focusLat = u.searchParams.get("focus.lat");
    const focusLon = u.searchParams.get("focus.lon");
    const country = u.searchParams.get("boundary.country") || "TW"; // 預設台灣
    const nocache = u.searchParams.get("nocache") === "1";

    if (!q) return NextResponse.json({ items: [] });

    const key = buildKey("geocode-ors", { q, limit, lang, focusLat, focusLon, country });

    const data = await cacheFetchJSON<{ items: GeoItem[] }>(
      key,
      6 * 3600, // 6h
      async () => {
        const params = new URLSearchParams({
          text: q,
          size: String(limit),
          lang,
          "boundary.country": country,
        });
        if (focusLat && focusLon) {
          params.set("focus.point.lat", focusLat);
          params.set("focus.point.lon", focusLon);
        }

        const url = `${BASE}?${params.toString()}`;
        const r = await fetch(url, {
          headers: { Authorization: ORS_KEY },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`ORS geocode ${r.status} ${txt}`.trim());
        }

        // Pelias 風格 response
        const j = (await r.json()) as {
          features?: Array<{
            id?: string | number;
            properties?: { label?: string; name?: string; layer?: string };
            geometry?: { coordinates?: unknown }; // 這裡用 unknown，等下自己檢查
          }>;
        };

        // ✅ 用 flatMap + 明確型別檢查，直接回傳 GeoItem[]
        const items: GeoItem[] = (j.features ?? []).flatMap((f, i) => {
          const coords = f.geometry?.coordinates;
          if (!Array.isArray(coords)) return []; // 不是陣列 → 丟掉
          const lon = Number((coords as unknown[])[0]);
          const lat = Number((coords as unknown[])[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []; // 無效值 → 丟掉

          const name = f.properties?.label ?? f.properties?.name ?? "";
          const item: GeoItem = {
            id: String(f.id ?? i),
            name,
            lat,
            lon,
            type: f.properties?.layer,
          };
          return [item];
        });

        return { items };
      },
      nocache
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
