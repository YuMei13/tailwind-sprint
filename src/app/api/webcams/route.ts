// src/app/api/webcams/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildKey, cacheFetchJSON } from "@/lib/cache";

const WINDY_API_KEY = process.env.WINDY_WEBCAMS_KEY!;
const WINDY_BASE = "https://api.windy.com/webcams/api/v3/webcams";
const REFERER = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://tailwind-sprint.vercel.app";
const TWIPCAM_LIST_URL = "https://www.twipcam.com/api/v1/cam-list.json";

type SourceOpt = "windy" | "twipcam" | "both";
type Provider = "windy" | "twipcam" | "both";

type WebcamItem = {
  id: string;
  provider: Provider;
  title: string;
  lat: number;
  lon: number;
  city: string;
  region: string;
  country: string;
  detailUrl: string;
  preview: string;
  playerDay: string;
  distance: number;
};

type WindyLocation = { latitude?: number; longitude?: number; city?: string; region?: string; country?: string };
type WindyImages = { current?: { preview?: string; thumbnail?: string } };
type WindyPlayer = { day?: { embed?: string } };
type WindyWebcam = {
  id: string;
  title?: string;
  location?: WindyLocation;
  urls?: { detail?: string };
  images?: WindyImages;
  player?: WindyPlayer;
};
type WindyResp =
  | { result?: { webcams?: WindyWebcam[]; webcam?: WindyWebcam | WindyWebcam[] } }
  | { webcams?: WindyWebcam[]; webcam?: WindyWebcam | WindyWebcam[] };

function notNull<T>(v: T | null): v is T {
  return v != null;
}

function toArray<T>(v: T | T[] | null | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}
function normalizeWindyList(j: WindyResp): WindyWebcam[] {
  if ("result" in j && j.result) {
    const r = j.result;
    if (r.webcams && Array.isArray(r.webcams)) return r.webcams;
    if (r.webcam) return toArray(r.webcam);
  }
  if ("webcams" in j && j.webcams && Array.isArray(j.webcams)) return j.webcams;
  if ("webcam" in j && j.webcam) return toArray(j.webcam);
  return [];
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function windyFetch(url: string, tries = 3, perTryTimeoutMs = 12000): Promise<WindyResp> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "x-windy-api-key": WINDY_API_KEY, Accept: "application/json", Referer: REFERER },
        cache: "no-store",
        signal: AbortSignal.timeout(perTryTimeoutMs),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Windy ${r.status} ${txt}`.trim());
      }
      return (await r.json()) as WindyResp;
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 300 * (i + 1)));
    }
  }
  throw lastErr ?? new Error("Windy fetch failed");
}

async function twipcamFetchList(tries = 3, perTryTimeoutMs = 12000): Promise<Record<string, unknown>[]> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(TWIPCAM_LIST_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(perTryTimeoutMs),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Twipcam ${r.status} ${txt}`.trim());
      }
      const payload = await r.json();
      const source = Array.isArray(payload)
        ? payload
        : (
            (payload as { data?: unknown; cams?: unknown; items?: unknown; results?: unknown }).data ??
            (payload as { data?: unknown; cams?: unknown; items?: unknown; results?: unknown }).cams ??
            (payload as { data?: unknown; cams?: unknown; items?: unknown; results?: unknown }).items ??
            (payload as { data?: unknown; cams?: unknown; items?: unknown; results?: unknown }).results
          );
      return Array.isArray(source) ? (source as Record<string, unknown>[]) : [];
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 300 * (i + 1)));
    }
  }
  throw lastErr ?? new Error("Twipcam fetch failed");
}

function mapWindyCams(list: WindyWebcam[], lat: number, lon: number): WebcamItem[] {
  return list
    .map((w): WebcamItem | null => {
      const la = w.location?.latitude;
      const lo = w.location?.longitude;
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      return {
        id: `windy:${w.id}`,
        provider: "windy" as const,
        title: w.title ?? "Webcam",
        lat: la as number,
        lon: lo as number,
        city: w.location?.city ?? "",
        region: w.location?.region ?? "",
        country: w.location?.country ?? "",
        detailUrl: w.player?.day?.embed ?? w.urls?.detail ?? "",
        preview: w.images?.current?.preview ?? w.images?.current?.thumbnail ?? "",
        playerDay: w.player?.day?.embed ?? "",
        distance: Math.round(haversine(lat, lon, la as number, lo as number)),
      };
    })
    .filter(notNull);
}

function mapTwipcamCams(list: Record<string, unknown>[], lat: number, lon: number): WebcamItem[] {
  return list
    .map((raw): WebcamItem | null => {
      const la = asNum(raw.lat) ?? asNum(raw.latitude) ?? asNum(raw.cam_lat) ?? asNum(raw.camLatitude);
      const lo = asNum(raw.lon) ?? asNum(raw.lng) ?? asNum(raw.longitude) ?? asNum(raw.cam_lon) ?? asNum(raw.camLongitude);
      if (la == null || lo == null) return null;
      const baseId = raw.id ?? raw.cam_id ?? raw.camId ?? raw.camera_id ?? raw.uuid ?? `${la},${lo}`;
      return {
        id: `twipcam:${String(baseId)}`,
        provider: "twipcam" as const,
        title: asStr(raw.title) || asStr(raw.name) || asStr(raw.cam_name) || "Webcam",
        lat: la,
        lon: lo,
        city: asStr(raw.city) || asStr(raw.town),
        region: asStr(raw.region) || asStr(raw.county),
        country: asStr(raw.country) || asStr(raw.country_code),
        detailUrl:
          asStr(raw.stream_url) ||
          asStr(raw.play_url) ||
          asStr(raw.player_url) ||
          asStr(raw.detail_url) ||
          asStr(raw.cam_url) ||
          asStr(raw.url) ||
          asStr(raw.page_url),
        preview:
          asStr(raw.preview) ||
          asStr(raw.thumbnail) ||
          asStr(raw.thumb) ||
          asStr(raw.image_url) ||
          asStr(raw.snapshot_url),
        playerDay: asStr(raw.player_url) || asStr(raw.play_url) || asStr(raw.stream_url),
        distance: Math.round(haversine(lat, lon, la, lo)),
      };
    })
    .filter(notNull);
}

function mergeIfClose(base: WebcamItem, incoming: WebcamItem): WebcamItem {
  const provider: Provider = base.provider === incoming.provider ? base.provider : "both";
  return {
    ...base,
    provider,
    title: base.title || incoming.title,
    city: base.city || incoming.city,
    region: base.region || incoming.region,
    country: base.country || incoming.country,
    preview: base.preview || incoming.preview,
    detailUrl: base.detailUrl || incoming.detailUrl,
    playerDay: base.playerDay || incoming.playerDay,
    distance: Math.min(base.distance, incoming.distance),
  };
}

function dedupeNearby(cams: WebcamItem[], mergeRadiusM = 220): WebcamItem[] {
  const ordered = [...cams].sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    const ap = a.provider === "windy" ? 0 : a.provider === "both" ? 1 : 2;
    const bp = b.provider === "windy" ? 0 : b.provider === "both" ? 1 : 2;
    return ap - bp;
  });
  const out: WebcamItem[] = [];
  for (const cam of ordered) {
    const idx = out.findIndex((x) => haversine(x.lat, x.lon, cam.lat, cam.lon) <= mergeRadiusM);
    if (idx === -1) out.push(cam);
    else out[idx] = mergeIfClose(out[idx], cam);
  }
  return out.sort((a, b) => a.distance - b.distance);
}

function parseSource(v: string | null): SourceOpt {
  if (v === "windy" || v === "twipcam") return v;
  return "both";
}

function roundForCache(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat") ?? "25.047");
  const lon = Number(u.searchParams.get("lon") ?? "121.517");
  const radiusKm = Math.min(200, Number(u.searchParams.get("radiusKm") ?? "50"));
  const limit = Math.min(50, Number(u.searchParams.get("limit") ?? "20"));
  const debug = u.searchParams.get("debug");
  const id = u.searchParams.get("id");
  const nocache = u.searchParams.get("nocache") === "1";
  const source = parseSource(u.searchParams.get("source"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Invalid lat/lon" }, { status: 400 });
  }
  if (source === "windy" && !WINDY_API_KEY) {
    return NextResponse.json({ error: "Missing WINDY_WEBCAMS_KEY" }, { status: 500 });
  }

  const key = buildKey("webcams", {
    lat: roundForCache(lat, 4),
    lon: roundForCache(lon, 4),
    radiusKm: roundForCache(radiusKm, 2),
    limit,
    source,
    id: id ?? "",
  });
  const payload = await cacheFetchJSON<{ center: { lat: number; lon: number }; items: WebcamItem[]; source: SourceOpt }>(
    key,
    120,
    async () => {
      const wantsWindy = source === "windy" || source === "both";
      const wantsTwipcam = source === "twipcam" || source === "both";

      const windyPromise = wantsWindy && WINDY_API_KEY
        ? (async () => {
            if (id) {
              const url = `${WINDY_BASE}/${encodeURIComponent(id)}?include=images,location,player,urls`;
              return mapWindyCams(normalizeWindyList(await windyFetch(url, 2, 10000)), lat, lon);
            }
            const nearbyURL = `${WINDY_BASE}?include=images,location,player,urls&nearby=${lat},${lon},${radiusKm}&limit=${limit}`;
            let list = normalizeWindyList(await windyFetch(nearbyURL, 3, 12000));
            if (list.length === 0) {
              const dLat = (radiusKm * 1.6) / 111;
              const dLon = (radiusKm * 1.6) / (111 * Math.cos((lat * Math.PI) / 180) || 1);
              const north = (lat + dLat).toFixed(6);
              const east = (lon + dLon).toFixed(6);
              const south = (lat - dLat).toFixed(6);
              const west = (lon - dLon).toFixed(6);
              const bboxURL = `${WINDY_BASE}?include=images,location,player,urls&bbox=${north},${east},${south},${west}&limit=${limit}`;
              list = normalizeWindyList(await windyFetch(bboxURL, 2, 12000));
            }
            return mapWindyCams(list, lat, lon);
          })().catch(() => [])
        : Promise.resolve([] as WebcamItem[]);

      const twipcamPromise = wantsTwipcam
        ? (async () => {
            const list = await twipcamFetchList(3, 12000);
            const cams = mapTwipcamCams(list, lat, lon);
            return id ? cams.filter((c) => c.id.endsWith(`:${id}`)) : cams;
          })().catch(() => [])
        : Promise.resolve([] as WebcamItem[]);

      const [windyItems, twipcamItems] = await Promise.all([windyPromise, twipcamPromise]);
      const radiusM = radiusKm * 1000;
      const merged = dedupeNearby([...windyItems, ...twipcamItems], 220)
        .filter((c) => c.distance <= radiusM)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      return { center: { lat, lon }, items: merged, source };
    },
    nocache
  );

  if (debug === "1" || debug === "2") {
    return NextResponse.json({
      source,
      requested: { lat, lon, radiusKm, limit, id: id ?? null },
      count: payload.items.length,
      providers: {
        windy: payload.items.filter((x) => x.provider === "windy" || x.provider === "both").length,
        twipcam: payload.items.filter((x) => x.provider === "twipcam" || x.provider === "both").length,
      },
      sample: payload.items.slice(0, debug === "2" ? 1 : 5),
    });
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
