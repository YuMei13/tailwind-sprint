// src/app/api/geocode/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

type GeoItem = { id: string; name: string; lat: number; lon: number; type?: string };

const ORS_KEY = process.env.ORS_API_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const ORS_BASE = "https://api.openrouteservice.org/geocode/search";

const TAIPEI_POI_HINTS: GeoItem[] = [
  { id: "poi-dadaocheng-wharf", name: "大稻埕碼頭", lat: 25.058, lon: 121.5109, type: "poi" },
  { id: "poi-fengguizui", name: "風櫃嘴", lat: 25.1329, lon: 121.5996, type: "poi" },
  { id: "poi-guandu-wharf", name: "關渡碼頭", lat: 25.1181, lon: 121.4663, type: "poi" },
  { id: "poi-huajiang-wetland", name: "華江雁鴨自然公園", lat: 25.0347, lon: 121.4871, type: "poi" },
  { id: "poi-maokong-gondola", name: "貓空纜車站", lat: 24.9686, lon: 121.5879, type: "poi" },
  { id: "poi-zhinan-temple", name: "指南宮", lat: 24.9789, lon: 121.5897, type: "poi" },
];

function normalizeZh(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "").replaceAll("臺", "台");
}

function pickHintItems(q: string, limit: number): GeoItem[] {
  const nq = normalizeZh(q);
  if (!nq) return [];
  const scored = TAIPEI_POI_HINTS.map((it) => {
    const ni = normalizeZh(it.name);
    let score = 0;
    if (ni === nq) score += 200;
    if (ni.startsWith(nq)) score += 120;
    if (ni.includes(nq) || nq.includes(ni)) score += 90;
    return { item: it, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
  return scored;
}

function mapLanguage(lang: string) {
  const l = lang.toLowerCase();
  if (l.startsWith("zh")) return "zh-Hant";
  return "en";
}

function mapCountry(country: string) {
  // Mapbox expects ISO-3166-1 alpha2 lower-case (e.g. tw)
  return country.toLowerCase();
}

async function fetchMapboxGeocode(params: {
  q: string;
  limit: number;
  lang: string;
  focusLat?: string | null;
  focusLon?: string | null;
  country: string;
}): Promise<GeoItem[]> {
  if (!MAPBOX_TOKEN) return [];
  const query = encodeURIComponent(params.q);
  const sp = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    autocomplete: "true",
    limit: String(params.limit),
    language: mapLanguage(params.lang),
    country: mapCountry(params.country),
    types: "poi,address,place,locality,neighborhood",
  });
  if (params.focusLat && params.focusLon) {
    sp.set("proximity", `${params.focusLon},${params.focusLat}`);
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?${sp.toString()}`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Mapbox geocode ${r.status} ${txt}`.trim());
  }
  const j = (await r.json()) as {
    features?: Array<{
      id?: string;
      place_name?: string;
      text?: string;
      place_type?: string[];
      center?: unknown;
      geometry?: { coordinates?: unknown };
    }>;
  };
  return (j.features ?? []).flatMap((f, i) => {
    const center = Array.isArray(f.center)
      ? f.center
      : Array.isArray(f.geometry?.coordinates)
        ? f.geometry?.coordinates
        : null;
    if (!Array.isArray(center)) return [];
    const lon = Number((center as unknown[])[0]);
    const lat = Number((center as unknown[])[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const item: GeoItem = {
      id: String(f.id ?? i),
      name: (f.place_name ?? f.text ?? "").trim(),
      lat,
      lon,
      type: Array.isArray(f.place_type) ? f.place_type[0] : undefined,
    };
    return item.name ? [item] : [];
  });
}

async function fetchOrsGeocode(params: {
  q: string;
  limit: number;
  lang: string;
  focusLat?: string | null;
  focusLon?: string | null;
  country: string;
}): Promise<GeoItem[]> {
  if (!ORS_KEY) return [];
  const orsParams = new URLSearchParams({
    text: params.q,
    size: String(params.limit),
    lang: params.lang,
    "boundary.country": params.country,
  });
  if (params.focusLat && params.focusLon) {
    orsParams.set("focus.point.lat", params.focusLat);
    orsParams.set("focus.point.lon", params.focusLon);
  }
  const url = `${ORS_BASE}?${orsParams.toString()}`;
  const r = await fetch(url, {
    headers: { Authorization: ORS_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`ORS geocode ${r.status} ${txt}`.trim());
  }
  const j = (await r.json()) as {
    features?: Array<{
      id?: string | number;
      properties?: { label?: string; name?: string; layer?: string };
      geometry?: { coordinates?: unknown };
    }>;
  };
  return (j.features ?? []).flatMap((f, i) => {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords)) return [];
    const lon = Number((coords as unknown[])[0]);
    const lat = Number((coords as unknown[])[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const item: GeoItem = {
      id: String(f.id ?? i),
      name: f.properties?.label ?? f.properties?.name ?? "",
      lat,
      lon,
      type: f.properties?.layer,
    };
    return item.name ? [item] : [];
  });
}

export async function GET(req: NextRequest) {
  try {
    if (!MAPBOX_TOKEN && !ORS_KEY) {
      return NextResponse.json(
        { error: "Missing MAPBOX token and ORS_API_KEY" },
        { status: 500 }
      );
    }

    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();
    const limit = Math.min(8, Number(u.searchParams.get("limit") || "5"));
    const lang = u.searchParams.get("lang") || "zh-TW";
    const focusLat = u.searchParams.get("focus.lat");
    const focusLon = u.searchParams.get("focus.lon");
    const country = u.searchParams.get("boundary.country") || "TW"; // 預設台灣
    const nocache = u.searchParams.get("nocache") === "1";

    if (!q) return NextResponse.json({ items: [] });

    const key = buildKey("geocode", {
      provider: MAPBOX_TOKEN ? "mapbox-first" : "ors-only",
      q,
      limit,
      lang,
      focusLat,
      focusLon,
      country,
    });

    const data = await cacheFetchJSON<{ items: GeoItem[] }>(
      key,
      6 * 3600, // 6h
      async () => {
        const params = { q, limit, lang, focusLat, focusLon, country };
        const hintItems = pickHintItems(q, limit);
        try {
          const mapboxItems = await fetchMapboxGeocode(params);
          if (mapboxItems.length > 0) {
            const merged = [...hintItems];
            for (const m of mapboxItems) {
              if (!merged.some((x) => x.id === m.id || x.name === m.name)) merged.push(m);
            }
            return { items: merged.slice(0, limit) };
          }
        } catch {
          // fallback to ORS
        }
        const orsItems = await fetchOrsGeocode(params);
        const merged = [...hintItems];
        for (const o of orsItems) {
          if (!merged.some((x) => x.id === o.id || x.name === o.name)) merged.push(o);
        }
        return { items: merged.slice(0, limit) };
      },
      nocache
    );

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
