import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.WINDY_WEBCAMS_KEY!;
const BASE = "https://api.windy.com/webcams/api/v3/webcams";
// 伺服器請求補上 Referer，避免部分供應商白名單只認 Referrer/Origin
const REFERER = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://tailwind-sprint.vercel.app";

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
  | { webcams?: WindyWebcam[]; webcam?: WindyWebcam | WindyWebcam[]};

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

// ── in-memory 簡易快取 ──
const cache = new Map<string, { t: number; data: unknown }>();
const TTL_MS = 60_000;

async function windyFetch(url: string, tries = 3, perTryTimeoutMs = 12_000): Promise<WindyResp> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          "x-windy-api-key": API_KEY,
          Accept: "application/json",
          Referer: REFERER, // ★ 重要：補上 Referer
        },
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
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw lastErr ?? new Error("Windy fetch failed");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asWebcamArray(v: unknown): WindyWebcam[] {
  if (Array.isArray(v)) return v as WindyWebcam[];
  if (isRecord(v)) return [v as WindyWebcam];
  return [];
}

function toArray<T>(v: T | T[] | null | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** 將不同端點的回傳統一攤平成 WindyWebcam[] */
function normalizeList(j: WindyResp): WindyWebcam[] {
  // 先處理 result 包裝的情況
  if ("result" in j && j.result) {
    const r = j.result;
    if (r.webcams && Array.isArray(r.webcams)) return r.webcams;
    if (r.webcam) return toArray(r.webcam);
  }
  // 再處理頂層直接回傳的情況
  if ("webcams" in j && j.webcams && Array.isArray(j.webcams)) return j.webcams;
  if ("webcam" in j && j.webcam) return toArray(j.webcam);
  return [];
}

export async function GET(req: NextRequest) {
  if (!API_KEY) return NextResponse.json({ error: "Missing WINDY_WEBCAMS_KEY" }, { status: 500 });

  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat") ?? "25.047");
  const lon = Number(u.searchParams.get("lon") ?? "121.517");
  const radiusKm = Math.min(200, Number(u.searchParams.get("radiusKm") ?? "30"));
  const limit = Math.min(50, Number(u.searchParams.get("limit") ?? "20"));
  const debug = u.searchParams.get("debug");
  const id = u.searchParams.get("id"); // 單筆測試

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Invalid lat/lon" }, { status: 400 });
  }

  // 單筆測試：/api/webcams?id=1358084658&lat=46.54&lon=7.98
  if (id) {
    try {
      const url = `${BASE}/${encodeURIComponent(id)}?include=images,location,player,urls`;
      const j = await windyFetch(url, 2, 10_000);
      const list = normalizeList(j);
      if (debug === "1") {
        const first = list[0] ?? null;
        return NextResponse.json({
          rawCount: list.length,
          keys: first ? Object.keys(first) : [],
          rawSample: first ? [first] : [],
        });
      }
      const items = list
        .map((w) => {
          const la = w.location?.latitude;
          const lo = w.location?.longitude;
          return {
            id: w.id,
            title: w.title ?? "",
            lat: la,
            lon: lo,
            city: w.location?.city ?? "",
            region: w.location?.region ?? "",
            country: w.location?.country ?? "",
            detailUrl: w.urls?.detail ?? "",
            preview: w.images?.current?.preview ?? w.images?.current?.thumbnail ?? "",
            playerDay: w.player?.day?.embed ?? "",
            distance:
              Number.isFinite(la) && Number.isFinite(lo) ? Math.round(haversine(lat, lon, la!, lo!)) : null,
          };
        })
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
      return NextResponse.json({ center: { lat, lon }, items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      return NextResponse.json({ error: `Upstream fetch error: ${msg}` }, { status: 504 });
    }
  }

  // 快取
  const key = `nearby:${lat}:${lon}:${radiusKm}:${limit}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    // ① nearby
    const nearbyURL = `${BASE}?include=images,location,player,urls&nearby=${lat},${lon},${radiusKm}&limit=${limit}`;
    const jsonNearby = await windyFetch(nearbyURL, 3, 12_000);
    let list = normalizeList(jsonNearby);

    // ② fallback: bbox（半徑放大 1.6x）
    if (!Array.isArray(list) || list.length === 0) {
      const dLat = (radiusKm * 1.6) / 111;
      const dLon = (radiusKm * 1.6) / (111 * Math.cos((lat * Math.PI) / 180) || 1);
      const north = (lat + dLat).toFixed(6);
      const east = (lon + dLon).toFixed(6);
      const south = (lat - dLat).toFixed(6);
      const west = (lon - dLon).toFixed(6);
      const bboxURL = `${BASE}?include=images,location,player,urls&bbox=${north},${east},${south},${west}&limit=${limit}`;
      const jsonBBox = await windyFetch(bboxURL, 2, 12_000);
      list = normalizeList(jsonBBox);
    }

    // ③ 除錯輸出
    if (debug === "1") {
      const first = list[0] ?? null;
      return NextResponse.json({
        rawCount: list.length,
        keys: first ? Object.keys(first) : [],
      });
    }
    if (debug === "2") {
      return NextResponse.json({
        rawCount: list.length,
        rawSample: list.slice(0, 1),
      });
    }

    // ④ 正規化 → 距離排序 → 取前 N
    const cams = (list ?? [])
      .map((w) => {
        const la = w.location?.latitude;
        const lo = w.location?.longitude;
        return {
          id: w.id,
          title: w.title ?? "",
          lat: la,
          lon: lo,
          city: w.location?.city ?? "",
          region: w.location?.region ?? "",
          country: w.location?.country ?? "",
          detailUrl: w.urls?.detail ?? "",
          preview: w.images?.current?.preview ?? w.images?.current?.thumbnail ?? "",
          playerDay: w.player?.day?.embed ?? "",
        };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));

    const ranked = cams
      .map((c) => ({ ...c, distance: Math.round(haversine(lat, lon, c.lat!, c.lon!)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    const payload = { center: { lat, lon }, items: ranked };
    cache.set(key, { t: now, data: payload });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: `Upstream fetch error: ${msg}` }, { status: 504 });
  }
}
