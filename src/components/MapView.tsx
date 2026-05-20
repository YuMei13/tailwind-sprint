// src/components/MapView.tsx
"use client";

import MapGL, { Marker, NavigationControl, MapRef, Popup } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapMouseEvent } from "mapbox-gl";
import Image from "next/image";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";
import WindLegend from "@/components/WindLegend";
import ElevationPanel, { ElevPt } from "@/components/ElevationPanel";
import MapboxRoutingPanel, { type Role as RoutingPanelRole } from "@/components/MapboxRoutingPanel";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LatLng = [number, number]; // [lat, lon]
type LineLatLng = LatLng[];
type LonLat = [number, number];

type WindPoint = WindPointType;
type ElevPoint = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };
type WebcamItem = {
  id?: string | number;
  provider?: "windy";
  title?: string;
  lat: number;
  lon: number;
  distance?: number;
  city?: string;
  region?: string;
  country?: string;
  detailUrl?: string;
  preview?: string;
};
type RouteSource = "planned";
type WaypointInput = { label: string; lonLat: LonLat | null };
type PresetStop = { name: string; lonLat: LonLat };
type RoutePreset = {
  id: string;
  name: string;
  description: string;
  stops: PresetStop[];
  gpxPath?: string;
};
type RouteDebug = {
  source: RouteSource;
  incomingCount: number;
  mergedCount: number;
  sampleLonLat: [number, number][];
  windCount: number;
  elevationReturned: number;
  elevationValid: number;
  elevationErrors: number;
  updatedAt: string;
  message?: string;
};
const WEBCAM_RADIUS_KM = 0.5;
const WEBCAM_CLIENT_CACHE_TTL_MS = 60000;
const ROUTE_CACHE_PREFIX = "ts-route-cache:v10:";
const ROUTE_API_CACHE_PREFIX = "ts-route-api-cache:v1:";

const TAIPEI_ROUTE_PRESETS: RoutePreset[] = [
  {
    id: "bike100-jianan",
    name: "台北劍南路（Biji GPX）",
    description: "來源：Cycling Biji 路線 0E370FC7-3E60-5866-6F98-55D32AF63732 GPX。",
    stops: [
      { name: "起點（0.00 km）", lonLat: [121.554182, 25.085481] },
      { name: "檢查點 1（0.70 km）", lonLat: [121.556467, 25.087883] },
      { name: "檢查點 2（1.35 km）", lonLat: [121.552015, 25.090132] },
      { name: "檢查點 3（2.24 km）", lonLat: [121.555032, 25.095251] },
      { name: "檢查點 4（3.25 km）", lonLat: [121.556529, 25.100927] },
      { name: "終點（4.35 km）", lonLat: [121.557973, 25.107554] },
    ],
  },
  {
    id: "bike100-nanshen",
    name: "台北南港｜南深深南",
    description: "參考 bike100 台北熱門路線：南港南深路段。",
    stops: [
      { name: "南港展覽館", lonLat: [121.617219, 25.054569] },
      { name: "南深路", lonLat: [121.617473, 25.033346] },
      { name: "深南路", lonLat: [121.621839, 25.010681] },
    ],
  },
  {
    id: "bike100-zhongshe",
    name: "台北士林｜中社路",
    description: "來源：上傳 GPX 檔 中社路.gpx。",
    gpxPath: "/zhongshe.gpx",
    stops: [
      { name: "國立故宮博物院", lonLat: [121.549134, 25.102039] },
      { name: "中社路一段", lonLat: [121.560807, 25.106856] },
    ],
  },
  {
    id: "bike100-maokong",
    name: "台北木柵｜貓空（順時針）",
    description: "參考 bike100 台北路線：木柵上貓空。",
    stops: [
      { name: "木柵動物園", lonLat: [121.581081, 24.998674] },
      { name: "貓空纜車站", lonLat: [121.587892, 24.968622] },
      { name: "指南宮", lonLat: [121.589685, 24.978929] },
    ],
  },
  {
    id: "bike100-houshanyue",
    name: "台北木柵｜猴山岳",
    description: "參考 bike100 台北熱門路線：木柵猴山岳。",
    stops: [
      { name: "木柵動物園", lonLat: [121.581081, 24.998674] },
      { name: "草湳大榕樹", lonLat: [121.608451, 24.97011] },
      { name: "猴山岳步道口", lonLat: [121.6215, 24.9736] },
    ],
  },
  {
    id: "bike100-tunshan-nav",
    name: "台北天母｜中山北路上大屯山助航站",
    description: "參考 bike100 台北進階路線：中山北路上大屯助航站。",
    stops: [
      { name: "天母運動公園", lonLat: [121.534611, 25.114684] },
      { name: "中山北路七段", lonLat: [121.530516, 25.119921] },
      { name: "大屯山助航站", lonLat: [121.522727, 25.175209] },
    ],
  },
  {
    id: "bike100-haima",
    name: "台北陽明山系｜海馬",
    description: "來源：上傳 GPX 檔 海馬.gpx。",
    gpxPath: "/haima.gpx",
    stops: [
      { name: "至善公園", lonLat: [121.538985, 25.098452] },
      { name: "風櫃嘴", lonLat: [121.5996, 25.1329] },
      { name: "萬里", lonLat: [121.689987, 25.178183] },
    ],
  },
  {
    id: "bike100-flying-cat",
    name: "台北石碇｜飛躍的貓咪（順時針）",
    description: "參考 bike100 高評分台北路線：石碇飛躍的貓咪。",
    stops: [
      { name: "石碇老街", lonLat: [121.659961, 24.991052] },
      { name: "平溪", lonLat: [121.736206, 25.025877] },
      { name: "菁桐", lonLat: [121.72512, 25.02285] },
    ],
  },
  {
    id: "bike100-ym-serial",
    name: "台北陽明山景連騎｜文大後山→大屯助航站→中湖戰備道",
    description: "參考 bike100 台北高評分連騎路線。",
    stops: [
      { name: "文化大學", lonLat: [121.539019, 25.135783] },
      { name: "大屯山助航站", lonLat: [121.522727, 25.175209] },
      { name: "中湖戰備道", lonLat: [121.576, 25.1678] },
    ],
  },
  {
    id: "bike100-rulai",
    name: "自行車－如來神掌線",
    description: "來源：上傳 GPX 檔 瘋神掌100K順騎.gpx。",
    gpxPath: "/rulai-100k.gpx",
    stops: [
      { name: "起點", lonLat: [121.53406, 25.09764] },
      { name: "檢查點 1", lonLat: [121.56411, 25.16252] },
      { name: "檢查點 2", lonLat: [121.61603, 25.21818] },
      { name: "檢查點 3", lonLat: [121.58733, 25.29196] },
      { name: "檢查點 4", lonLat: [121.53038, 25.28666] },
      { name: "檢查點 5", lonLat: [121.49259, 25.26008] },
      { name: "檢查點 6", lonLat: [121.45792, 25.22916] },
      { name: "檢查點 7", lonLat: [121.53064, 25.18222] },
      { name: "終點", lonLat: [121.52898, 25.09601] },
    ],
  },
  {
    id: "rwgps-49826274",
    name: "環大台北自行車挑戰（RWGPS）",
    description: "來源：上傳 GPX 檔 環大台北200K.gpx。",
    gpxPath: "/rwgps-49826274.gpx",
    stops: [
      { name: "起點（板橋）", lonLat: [121.46942, 25.00955] },
      { name: "深坑", lonLat: [121.69745, 25.01866] },
      { name: "福隆", lonLat: [121.92695, 25.02745] },
      { name: "基隆", lonLat: [121.74075, 25.13611] },
      { name: "老梅", lonLat: [121.54876, 25.28943] },
      { name: "關渡", lonLat: [121.448557, 25.165314] },
      { name: "終點（板橋）", lonLat: [121.46943, 25.00953] },
    ],
  },
  {
    id: "rwgps-38179892",
    name: "環小台北自行車道（RWGPS）",
    description: "來源：上傳 GPX 檔 環小台北.gpx（直接依軌跡順序顯示）。",
    gpxPath: "/rwgps-38179892.gpx",
    stops: [
      { name: "起點（文山）", lonLat: [121.53943, 24.98836] },
      { name: "新店溪右岸自行車道", lonLat: [121.53062, 25.01035] },
      { name: "淡水線自行車道", lonLat: [121.50578, 25.05247] },
      { name: "基隆河左岸自行車道", lonLat: [121.54351, 25.07354] },
      { name: "南港（研究院路）", lonLat: [121.61659, 25.05521] },
      { name: "景美溪右岸自行車道", lonLat: [121.53997, 24.98834] },
      { name: "終點（文山）", lonLat: [121.53844, 24.98843] },
    ],
  },
  {
    id: "feng-east-3t-550k",
    name: "瘋系列－東三塔 550K",
    description: "來源：上傳 GPX 檔 瘋系列東三塔550K_(經旭海).gpx。",
    gpxPath: "/feng-east-3t-550k.gpx",
    stops: [
      { name: "起點", lonLat: [121.53776, 25.28993] },
      { name: "終點", lonLat: [120.84815, 21.9111] },
    ],
  },
  {
    id: "taipei-central-loop",
    name: "環中台北",
    description: "來源：上傳 GPX 檔 環中台北.gpx。",
    gpxPath: "/taipei-central-loop.gpx",
    stops: [
      { name: "起點", lonLat: [121.487379, 25.049422] },
      { name: "終點", lonLat: [121.489951, 25.048421] },
    ],
  },
  {
    id: "fengguizui",
    name: "風櫃嘴",
    description: "來源：上傳 GPX 檔 風櫃嘴_FengGuiZui.gpx。",
    gpxPath: "/fengguizui.gpx",
    stops: [
      { name: "起點", lonLat: [121.55085, 25.10048] },
      { name: "終點", lonLat: [121.60005, 25.1341] },
    ],
  },
  {
    id: "yangjin-3p",
    name: "陽金3P",
    description: "來源：上傳 GPX 檔 陽金3P.gpx（直接依軌跡順序顯示）。",
    gpxPath: "/yangjin-3p.gpx",
    stops: [
      { name: "起點", lonLat: [121.53575, 25.10858] },
      { name: "終點", lonLat: [121.563, 25.1675] },
    ],
  },
  {
    id: "tis-wuling",
    name: "TIS 武嶺",
    description: "來源：上傳 GPX 檔 TIS武嶺.gpx。",
    gpxPath: "/tis-wuling.gpx",
    stops: [
      { name: "起點", lonLat: [120.979231, 23.973577] },
      { name: "終點", lonLat: [121.275798, 24.137187] },
    ],
  },
  {
    id: "buyanting",
    name: "不厭亭",
    description: "來源：上傳 GPX 檔 不厭亭.gpx。",
    gpxPath: "/buyanting.gpx",
    stops: [
      { name: "起點", lonLat: [121.508518, 25.062784] },
      { name: "終點", lonLat: [121.508554, 25.062788] },
    ],
  },
  {
    id: "wufenshan",
    name: "五分山",
    description: "來源：上傳 GPX 檔 五分山.gpx。",
    gpxPath: "/wufenshan.gpx",
    stops: [
      { name: "起點", lonLat: [121.500498, 25.043198] },
      { name: "終點", lonLat: [121.805968, 25.108571] },
    ],
  },
  {
    id: "lengfeng-zhongjian",
    name: "冷風中劍",
    description: "來源：上傳 GPX 檔 冷風中劍.gpx。",
    gpxPath: "/lengfeng-zhongjian.gpx",
    stops: [
      { name: "起點", lonLat: [121.551863, 25.101098] },
      { name: "終點", lonLat: [121.551911, 25.10126] },
    ],
  },
  {
    id: "beigao-360",
    name: "北高360",
    description: "來源：上傳 GPX 檔 北高360.gpx。",
    gpxPath: "/beigao-360.gpx",
    stops: [
      { name: "起點", lonLat: [121.386803, 25.142307] },
      { name: "終點", lonLat: [120.301276, 22.69387] },
    ],
  },
  {
    id: "balaka",
    name: "巴拉卡",
    description: "來源：上傳 GPX 檔 巴拉卡.gpx。",
    gpxPath: "/balaka.gpx",
    stops: [
      { name: "起點", lonLat: [121.508301, 25.060214] },
      { name: "終點", lonLat: [121.508378, 25.06327] },
    ],
  },
  {
    id: "sunmoonlake-83k",
    name: "日月潭 83k",
    description: "來源：上傳 GPX 檔 日月潭83k.gpx。",
    gpxPath: "/sunmoonlake-83k.gpx",
    stops: [
      { name: "起點", lonLat: [120.901891, 23.854854] },
      { name: "終點", lonLat: [120.90214, 23.850463] },
    ],
  },
  {
    id: "fulshan-wulai",
    name: "烏來｜福山部落",
    description: "來源：上傳 GPX 檔 烏來_福山部落.gpx。",
    gpxPath: "/fulshan-wulai.gpx",
    stops: [
      { name: "起點", lonLat: [121.500615, 25.044331] },
      { name: "終點", lonLat: [121.507798, 25.05658] },
    ],
  },
  {
    id: "huadong-365-day1",
    name: "環花東 365 Day 1",
    description: "來源：上傳 GPX 檔 環花東365_Day1.gpx。",
    gpxPath: "/huadong-365-day1.gpx",
    stops: [
      { name: "起點", lonLat: [121.60887996666133, 23.96668997593224] },
      { name: "終點", lonLat: [121.12190974876285, 22.770249657332897] },
    ],
  },
  {
    id: "huadong-365-day2",
    name: "環花東 365 Day 2",
    description: "來源：上傳 GPX 檔 環花東365_Day2.gpx。",
    gpxPath: "/huadong-365-day2.gpx",
    stops: [
      { name: "起點", lonLat: [121.1293548066169, 22.79334582388401] },
      { name: "終點", lonLat: [121.59524152055383, 23.938634153455496] },
    ],
  },
  {
    id: "shimen-reservoir",
    name: "石門水庫",
    description: "來源：上傳 GPX 檔 石門水庫.gpx。",
    gpxPath: "/shimen-reservoir.gpx",
    stops: [
      { name: "起點", lonLat: [121.478557, 25.045799] },
      { name: "終點", lonLat: [121.478574, 25.045912] },
    ],
  },
  {
    id: "jiaobanshan",
    name: "角板山",
    description: "來源：上傳 GPX 檔 角板山.gpx。",
    gpxPath: "/jiaobanshan.gpx",
    stops: [
      { name: "起點", lonLat: [121.477841, 25.045424] },
      { name: "終點", lonLat: [121.477815, 25.045398] },
    ],
  },
];

function parseGpxTrackPoints(gpxText: string): LonLat[] {
  const doc = new DOMParser().parseFromString(gpxText, "application/xml");
  const nodes = Array.from(doc.getElementsByTagName("trkpt"));
  const out: LonLat[] = [];
  for (const node of nodes) {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (isValidCoordinate(lat, lon)) out.push([lon, lat]);
  }
  return out;
}

// Validate coordinates
function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeDeg(v: number) {
  const x = v % 360;
  return x < 0 ? x + 360 : x;
}

function bearingDeg(from: LatLng, to: LatLng): number {
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const dLon = ((to[1] - from[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

function smallestAngleDiffDeg(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return d > 180 ? 360 - d : d;
}

function cumulativeDistancesLatLng(route: LatLng[]): number[] {
  const n = route.length;
  const cum: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = route[i - 1];
    const b = route[i];
    cum[i] = cum[i - 1] + haversineMeters(a[0], a[1], b[0], b[1]);
  }
  return cum;
}

function sliceBetweenLatLng(route: LatLng[], cum: number[], d0: number, d1: number): LatLng[] {
  const n = route.length;
  if (n < 2 || d1 <= d0) return [];
  const out: LatLng[] = [];
  let started = false;

  for (let i = 1; i < n; i++) {
    const a = route[i - 1];
    const b = route[i];
    const da = cum[i - 1];
    const db = cum[i];
    const segLen = db - da;
    if (segLen <= 0) continue;

    if (db < d0) continue;
    if (da > d1) break;

    if (!started) {
      if (d0 <= da) {
        out.push(a);
      } else {
        const t0 = (d0 - da) / segLen;
        out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
      }
      started = true;
    }

    if (db >= d1) {
      const t1 = (d1 - da) / segLen;
      out.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
      break;
    } else {
      out.push(b);
    }
  }

  return out.length >= 2 ? out : [];
}

function nearestWindDirDeg(winds: WindPoint[], p: LatLng): number | undefined {
  let bestD2 = Number.POSITIVE_INFINITY;
  let best: number | undefined = undefined;
  for (const w of winds) {
    if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon) || !Number.isFinite(w.dirDeg)) continue;
    const dx = w.lat - p[0];
    const dy = w.lon - p[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = w.dirDeg as number;
    }
  }
  return best;
}

function webcamKeyOf(w: WebcamItem): string {
  if (w.id != null) return String(w.id);
  return `${w.lat.toFixed(6)},${w.lon.toFixed(6)}`;
}

function sampleRoutePoints(route: LineLatLng, maxPoints = 8): { lat: number; lon: number }[] {
  if (route.length === 0) return [];
  if (route.length <= maxPoints) return route.map(([lat, lon]) => ({ lat, lon }));
  const step = Math.max(1, Math.floor((route.length - 1) / (maxPoints - 1)));
  const out: { lat: number; lon: number }[] = [];
  for (let i = 0; i < route.length; i += step) {
    const [lat, lon] = route[i];
    out.push({ lat, lon });
    if (out.length >= maxPoints - 1) break;
  }
  const last = route[route.length - 1];
  if (!out.length || out[out.length - 1].lat !== last[0] || out[out.length - 1].lon !== last[1]) {
    out.push({ lat: last[0], lon: last[1] });
  }
  return out.slice(0, maxPoints);
}

// Fetch JSON with retry and timeout
function absUrl(path: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return path.startsWith("http") ? path : `${base}${path}`;
}
const DEFAULT_TIMEOUT = process.env.NODE_ENV === "development" ? 45000 : 10000;
const MAX_RETRIES = 4;

async function fetchJSON<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT, ...rest } = init;
  const once = async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(absUrl(path), { ...rest, signal: ac.signal, cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${txt}`.trim());
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  };
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await once();
    } catch (e) {
      if (i === MAX_RETRIES - 1) throw e as Error;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

// Find nearest elevation index
function nearestElevIndex(elevPts: ElevPoint[], lat: number, lon: number): number | null {
  if (!elevPts.length) return null;
  let best = 0;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < elevPts.length; i++) {
    const p = elevPts[i];
    const dx = p.lat - lat;
    const dy = p.lon - lon;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

// Map interaction handler
function MapInteraction({
  onPickIndex,
  onHoverIndex,
  elevPts,
  mapRef,
  pickMode,
  onPick,
  onDone,
}: {
  onPickIndex: (idx: number | null) => void;
  onHoverIndex: (idx: number | null) => void;
  elevPts: ElevPoint[];
  mapRef: React.RefObject<MapRef | null>;
  pickMode: "none" | "start" | "end" | "waypoint";
  onPick: (role: "start" | "end" | "waypoint", lat: number, lon: number) => void;
  onDone: () => void;
}) {
  const rafRef = useRef<number | null>(null);
  const lastIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    
    const handleMouseMove = (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const idx = nearestElevIndex(elevPts, lat, lng);
        if (idx !== lastIdxRef.current) {
          lastIdxRef.current = idx;
          onHoverIndex(idx);
        }
      });
    };

    const handleMouseOut = () => {
      lastIdxRef.current = null;
      onHoverIndex(null);
    };

    const handleClick = (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      
      if (pickMode !== "none") {
        onPick(pickMode, lat, lng);
        onDone();
      } else {
        onPickIndex(nearestElevIndex(elevPts, lat, lng));
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseOut);
    map.on("click", handleClick);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", handleMouseOut);
      map.off("click", handleClick);
    };
  }, [elevPts, onHoverIndex, onPickIndex, pickMode, onPick, onDone, mapRef]);

  return null;
}

export default function MapView() {
  const toggleButtonStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    padding: "8px 12px",
    background: "rgba(248,250,252,0.94)",
    color: "#0f172a",
    border: "1px solid rgba(148,163,184,0.45)",
    borderRadius: 999,
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(2,6,23,0.16)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };
  const closeButtonStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: "20px",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
    padding: 0,
  };
  const panelCardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.94)",
    color: "#1e293b",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.28)",
    boxShadow: "0 14px 40px rgba(15,23,42,0.2)",
    padding: 10,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };
  const panelHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  };
  const panelIconDockStyle: React.CSSProperties = {
    position: "absolute",
    right: 8,
    top: 12,
    zIndex: 1700,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };
  const panelIconGlyphStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    display: "inline-grid",
    placeItems: "center",
    textAlign: "center",
    lineHeight: 1,
  };
  const webcamMarkerWrapStyle: React.CSSProperties = {
    position: "relative",
    width: 24,
    height: 30,
    display: "grid",
    justifyItems: "center",
    alignItems: "start",
    pointerEvents: "none",
  };
  const webcamMarkerFaceStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 999,
    background: "linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)",
    border: "2px solid #ffffff",
    boxShadow: "0 4px 10px rgba(2,132,199,0.35)",
    display: "grid",
    placeItems: "center",
  };
  const webcamMarkerTailStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    width: 0,
    height: 0,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderTop: "8px solid #0284c7",
  };
  const riderMarkerStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    filter: "drop-shadow(0 1px 2px rgba(15,23,42,0.45))",
    pointerEvents: "none",
  };
  const riderMarkerFocusStyle: React.CSSProperties = {
    ...riderMarkerStyle,
    width: 34,
    height: 34,
    filter: "drop-shadow(0 1px 3px rgba(13,148,136,0.55))",
  };
  const riderIconImageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundImage: "url('/bmx.png')",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "contain",
  };

  // === State ===
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);
  const [elevPts, setElevPts] = useState<ElevPoint[]>([]);
  const [segmentMeters] = useState<number>(300);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({
    lat: 25.05,
    lon: 121.52,
  });
  const [zoom, setZoom] = useState<number>(13);
  const [webcams, setWebcams] = useState<WebcamItem[]>([]);
  const [activeWebcam, setActiveWebcam] = useState<WebcamItem | null>(null);

  // Start/End [lon, lat]
  const [startLonLat, setStartLonLat] = useState<[number, number] | null>(null);
  const [endLonLat, setEndLonLat] = useState<[number, number] | null>(null);
  const [startLabel, setStartLabel] = useState("");
  const [endLabel, setEndLabel] = useState("");
  const [waypointInputs, setWaypointInputs] = useState<WaypointInput[]>([]);

  // Map pick mode
  const [pickMode, setPickMode] = useState<"none" | "start" | "end" | "waypoint">("none");
  const [pendingWaypointIndex, setPendingWaypointIndex] = useState<number | null>(null);

  // Panel interaction
  const [cursorPt, setCursorPt] = useState<{ lat: number; lon: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [panelHoverIdx, setPanelHoverIdx] = useState<number | null>(null);

  // Show/hide panels
  const [showWebcams, setShowWebcams] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [showRoutingPanel, setShowRoutingPanel] = useState(false);
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [routeColorMode, setRouteColorMode] = useState<"wind" | "slope">("wind");
  const [windForecastLocal, setWindForecastLocal] = useState<string>("");
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [, setRouteDebug] = useState<RouteDebug | null>(null);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const latestRouteReqRef = useRef<number>(0);
  const suppressAutoPlanRef = useRef(false);
  const directGpxModeRef = useRef(false);
  const routeCacheRef = useRef<Map<string, LonLat[]>>(new Map());
  const pendingPresetCacheRef = useRef<string | null>(null);
  const routeApiCacheRef = useRef<Map<string, LonLat[]>>(new Map());
  const pendingGeoCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  const didAutoCenterToUserRef = useRef(false);
  const webcamQueryCacheRef = useRef<
    Map<string, { at: number; items: WebcamItem[] }>
  >(new Map());

  const mapRef = useRef<MapRef | null>(null);
  const isPhone = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1200;
  const panelIconButtonStyle = (active: boolean): React.CSSProperties => ({
    ...toggleButtonStyle,
    width: 42,
    height: 42,
    minWidth: 42,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: active ? "rgba(234,179,8,0.92)" : "rgba(248,250,252,0.94)",
    color: active ? "#111827" : "#0f172a",
    border: active ? "1px solid rgba(161,98,7,0.45)" : toggleButtonStyle.border,
    borderRadius: 999,
  });

  const setProgrammaticCenter = useCallback(
    (next: { lat: number; lon: number }) => {
      // On phone, keep the user's location as center after initial geolocation fly-to.
      if (isPhone && didAutoCenterToUserRef.current) return;
      setMapCenter(next);
    },
    [isPhone]
  );

  const fetchWebcamsWithClientCache = useCallback(async (params: URLSearchParams) => {
    const key = params.toString();
    const now = Date.now();
    const hit = webcamQueryCacheRef.current.get(key);
    if (hit && now - hit.at < WEBCAM_CLIENT_CACHE_TTL_MS) return hit.items;
    const j = await fetchJSON<{ items?: WebcamItem[] }>(`/api/webcams?${key}`, { timeoutMs: 12000 });
    const items = j.items ?? [];
    webcamQueryCacheRef.current.set(key, { at: now, items });
    if (webcamQueryCacheRef.current.size > 120) {
      const oldestKey = webcamQueryCacheRef.current.keys().next().value as string | undefined;
      if (oldestKey) webcamQueryCacheRef.current.delete(oldestKey);
    }
    return items;
  }, []);

  const tryFlyToPendingGeoCenter = useCallback(() => {
    if (didAutoCenterToUserRef.current) return;
    const pending = pendingGeoCenterRef.current;
    if (!pending) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
    map.flyTo({
      center: [pending.lon, pending.lat],
      zoom: Math.max(map.getZoom(), 12),
      duration: 900,
    });
    pendingGeoCenterRef.current = null;
    didAutoCenterToUserRef.current = true;
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setMapCenter({ lat: latitude, lon: longitude });
        setZoom((z) => (z < 12 ? 12 : z));
        pendingGeoCenterRef.current = { lat: latitude, lon: longitude };
        tryFlyToPendingGeoCenter();
      },
      () => {
        // Ignore location errors and keep default center.
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 }
    );
  }, [tryFlyToPendingGeoCenter]);

  const loadCachedPresetRoute = (presetId: string): LonLat[] | null => {
    const mem = routeCacheRef.current.get(presetId);
    if (mem && mem.length >= 2) return mem;
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(`${ROUTE_CACHE_PREFIX}${presetId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const coords: LonLat[] = [];
      for (const item of parsed) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const lon = Number(item[0]);
        const lat = Number(item[1]);
        if (isValidCoordinate(lat, lon)) coords.push([lon, lat]);
      }
      if (coords.length < 2) return null;
      routeCacheRef.current.set(presetId, coords);
      return coords;
    } catch {
      return null;
    }
  };

  const saveCachedPresetRoute = (presetId: string, coords: LonLat[]) => {
    if (!presetId || coords.length < 2) return;
    routeCacheRef.current.set(presetId, coords);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`${ROUTE_CACHE_PREFIX}${presetId}`, JSON.stringify(coords));
    } catch {
      // Ignore quota errors.
    }
  };

  const normalizeCoord = (value: number) => Math.round(value * 1e5) / 1e5;

  const buildRouteApiCacheKey = (coords: LonLat[], profile: string) => {
    const compact = coords.map(([lon, lat]) => [normalizeCoord(lon), normalizeCoord(lat)]);
    return `${ROUTE_API_CACHE_PREFIX}${profile}:${JSON.stringify(compact)}`;
  };

  const loadRouteApiCache = (key: string): LonLat[] | null => {
    const mem = routeApiCacheRef.current.get(key);
    if (mem && mem.length >= 2) return mem;
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const coords: LonLat[] = [];
      for (const item of parsed) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const lon = Number(item[0]);
        const lat = Number(item[1]);
        if (isValidCoordinate(lat, lon)) coords.push([lon, lat]);
      }
      if (coords.length < 2) return null;
      routeApiCacheRef.current.set(key, coords);
      return coords;
    } catch {
      return null;
    }
  };

  const saveRouteApiCache = (key: string, coords: LonLat[]) => {
    if (coords.length < 2) return;
    routeApiCacheRef.current.set(key, coords);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(coords));
    } catch {
      // Ignore quota errors.
    }
  };

  const focusPt = useMemo(() => {
    if (focusIdx == null || !elevPts[focusIdx]) return null;
    const p = elevPts[focusIdx];
    return typeof p.lat === "number" && typeof p.lon === "number" ? { lat: p.lat, lon: p.lon } : null;
  }, [focusIdx, elevPts]);

  const forecastIsoUtc = useMemo(() => {
    if (!windForecastLocal) return undefined;
    const t = Date.parse(windForecastLocal);
    if (!Number.isFinite(t)) return undefined;
    return new Date(t).toISOString();
  }, [windForecastLocal]);

  const elevationStats = useMemo(() => {
    const vals = elevPts
      .map((p) => p.elevation)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return { valid: 0, min: null as number | null, max: null as number | null };
    return {
      valid: vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [elevPts]);

  const windAngleRatio = useMemo(() => {
    if (!Array.isArray(route) || route.length < 2) return null;
    if (!Array.isArray(winds) || winds.length === 0) return null;
    const cum = cumulativeDistancesLatLng(route);
    const total = cum[cum.length - 1];
    if (!Number.isFinite(total) || total <= 0) return null;
    const segLen = Math.max(50, segmentMeters);
    const segCount = Math.max(1, Math.ceil(total / segLen));
    let same = 0;
    let cross = 0;
    let opposite = 0;
    let counted = 0;
    for (let k = 0; k < segCount; k++) {
      const d0 = k * segLen;
      const d1 = Math.min(total, (k + 1) * segLen);
      const pts = sliceBetweenLatLng(route, cum, d0, d1);
      if (pts.length < 2) continue;
      const midPt = pts[Math.floor(pts.length / 2)] ?? pts[0];
      const windDir = nearestWindDirDeg(winds, midPt);
      if (typeof windDir !== "number") continue;
      const routeDir = bearingDeg(pts[0], pts[pts.length - 1]);
      const angle = smallestAngleDiffDeg(routeDir, windDir);
      if (angle < 60) same += 1;
      else if (angle < 120) cross += 1;
      else opposite += 1;
      counted += 1;
    }

    if (counted === 0) {
      let fallbackSame = 0;
      let fallbackCross = 0;
      let fallbackOpposite = 0;
      let fallbackCount = 0;
      for (const w of winds) {
        if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon) || !Number.isFinite(w.dirDeg)) continue;
        let bestIdx = -1;
        let bestD2 = Number.POSITIVE_INFINITY;
        for (let i = 0; i < route.length; i++) {
          const dx = route[i][0] - w.lat;
          const dy = route[i][1] - w.lon;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) continue;
        const prev = route[Math.max(0, bestIdx - 1)];
        const next = route[Math.min(route.length - 1, bestIdx + 1)];
        if (!prev || !next || (prev[0] === next[0] && prev[1] === next[1])) continue;
        const routeDir = bearingDeg(prev, next);
        const angle = smallestAngleDiffDeg(routeDir, w.dirDeg as number);
        if (angle < 60) fallbackSame += 1;
        else if (angle < 120) fallbackCross += 1;
        else fallbackOpposite += 1;
        fallbackCount += 1;
      }
      if (fallbackCount === 0) return null;
      return { same: fallbackSame, cross: fallbackCross, opposite: fallbackOpposite, total: fallbackCount };
    }

    return { same, cross, opposite, total: counted };
  }, [route, winds, segmentMeters]);

  // === URL Read/Write ===
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const parse = (v: string | null): [number, number] | null => {
      if (!v) return null;
      const [latS, lonS] = v.split(",");
      const lat = Number(latS);
      const lon = Number(lonS);
      return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
    };
    const s = parse(searchParams.get("start"));
    const e = parse(searchParams.get("end"));
    if (s) setStartLonLat(s);
    if (e) setEndLonLat(e);
    if (s && e) setProgrammaticCenter({ lat: (s[1] + e[1]) / 2, lon: (s[0] + e[0]) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear URL params on mount to start fresh
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (sp.has("start") || sp.has("end")) {
      sp.delete("start");
      sp.delete("end");
      const newParams = sp.toString();
      router.replace(newParams ? `${pathname}?${newParams}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeQuery = (start: [number, number] | null, end: [number, number] | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    const fmt = (p: [number, number]) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`; // lat,lon
    if (start) sp.set("start", fmt(start));
    else sp.delete("start");
    if (end) sp.set("end", fmt(end));
    else sp.delete("end");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  async function fetchLegCoords(a: LonLat, b: LonLat): Promise<LonLat[]> {
    const profile = "cycling";
    const cacheKey = buildRouteApiCacheKey([a, b], profile);
    const cached = loadRouteApiCache(cacheKey);
    if (cached) return cached;
    const r = await fetchJSON<{
      geometry: { type: string; coordinates: [number, number][] };
    }>("/api/mapbox-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [a, b], profile }),
        timeoutMs: 45000,
      });
    const coords = (r?.geometry?.coordinates ?? []).filter(([lon, lat]) =>
      isValidCoordinate(lat, lon)
    );
    saveRouteApiCache(cacheKey, coords);
    return coords;
  }

  async function fetchRouteForAllPoints(points: LonLat[]): Promise<LonLat[]> {
    const profile = "cycling";
    const cacheKey = buildRouteApiCacheKey(points, profile);
    const cached = loadRouteApiCache(cacheKey);
    if (cached) return cached;
    const r = await fetchJSON<{
      geometry: { type: string; coordinates: [number, number][] };
    }>("/api/mapbox-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: points, profile }),
      timeoutMs: 45000,
    });
    const coords = (r?.geometry?.coordinates ?? []).filter(([lon, lat]) =>
      isValidCoordinate(lat, lon)
    );
    saveRouteApiCache(cacheKey, coords);
    return coords;
  }

  function sameLonLat(a: LonLat, b: LonLat) {
    return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  }

  function downsampleLonLat(coords: LonLat[], maxPoints: number): LonLat[] {
    if (!Array.isArray(coords) || coords.length <= 2) return coords;
    if (coords.length <= maxPoints) return coords;
    const step = Math.max(1, Math.ceil(coords.length / maxPoints));
    const sampled = coords.filter((_, idx) => idx % step === 0);
    const last = coords[coords.length - 1];
    const tail = sampled[sampled.length - 1];
    if (!tail || !sameLonLat(tail, last)) sampled.push(last);
    return sampled;
  }

  // Multi-point route planning
  const applyRouteFromLonLat = async (
    merged: [number, number][],
    meta: { source: RouteSource; incomingCount: number },
    requestId: number
  ) => {
    if (requestId !== latestRouteReqRef.current) return;

    // Keep existing wind/elevation until fresh results are ready.

    if (merged.length < 2) {
      if (requestId !== latestRouteReqRef.current) return;
      setRoute([]);
      setWinds([]);
      setElevPts([]);
      setRouteDebug({
        source: meta.source,
        incomingCount: meta.incomingCount,
        mergedCount: 0,
        sampleLonLat: [],
        windCount: 0,
        elevationReturned: 0,
        elevationValid: 0,
        elevationErrors: 0,
        updatedAt: new Date().toISOString(),
        message: "No valid merged coordinates",
      });
      return;
    }

    const routeLonLat = downsampleLonLat(merged, 12000);
    const analysisLonLat = downsampleLonLat(routeLonLat, 6000);

    // Set route (convert to [lat, lon])
    const line: [number, number][] = routeLonLat.map(([lon, lat]) => [lat, lon]);
    if (requestId !== latestRouteReqRef.current) return;
    setRoute(line);
    const pendingPresetId = pendingPresetCacheRef.current;
    if (pendingPresetId) {
      saveCachedPresetRoute(pendingPresetId, routeLonLat);
      pendingPresetCacheRef.current = null;
    }

    // Wind: sample route and retry with fewer points if response has no valid wind vectors.
    const buildSample = (targetCount: number): [number, number][] => {
      const step = Math.max(1, Math.floor(routeLonLat.length / targetCount));
      const pts = routeLonLat.filter((_, i) => i % step === 0).map(([lon, lat]) => [lat, lon] as [number, number]);
      const last = routeLonLat[routeLonLat.length - 1];
      const lastS = pts[pts.length - 1];
      if (!lastS || lastS[0] !== last[1] || lastS[1] !== last[0]) {
        pts.push([last[1], last[0]]);
      }
      return pts;
    };

    let windPoints: WindPoint[] = [];
    let validWindPoints: WindPoint[] = [];
    let windRequestFailed = false;
    let windUsedSyntheticFallback = false;
    let firstSample: [number, number][] = [];
    try {
      firstSample = buildSample(20);
      const windData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: firstSample, forecastIsoUtc }),
        timeoutMs: 30000,
      });
      windPoints = Array.isArray(windData.points) ? windData.points : [];
      validWindPoints = windPoints.filter(
        (w) =>
          Number.isFinite(w.lat) &&
          Number.isFinite(w.lon) &&
          Number.isFinite(w.dirDeg) &&
          (Number.isFinite(w.speedMs) || Number.isFinite(w.speedKmh))
      );

      // Retry once with fewer points when first pass has no usable vectors.
      if (validWindPoints.length === 0) {
        const retrySample = buildSample(8);
        const retryData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind?nocache=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: retrySample, forecastIsoUtc }),
          timeoutMs: 30000,
        });
        const retryPoints = Array.isArray(retryData.points) ? retryData.points : [];
        const retryValid = retryPoints.filter(
          (w) =>
            Number.isFinite(w.lat) &&
            Number.isFinite(w.lon) &&
            Number.isFinite(w.dirDeg) &&
            (Number.isFinite(w.speedMs) || Number.isFinite(w.speedKmh))
        );
        if (retryValid.length > 0) {
          windPoints = retryPoints;
          validWindPoints = retryValid;
        }
      }

      // Final fallback: fetch one midpoint wind and fan it out across route sample points.
      if (validWindPoints.length === 0 && firstSample.length > 0) {
        const mid = firstSample[Math.floor(firstSample.length / 2)] ?? firstSample[0];
        if (mid) {
          const singleData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind?nocache=1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: [mid], forecastIsoUtc }),
            timeoutMs: 30000,
          });
          const single = (Array.isArray(singleData.points) ? singleData.points : []).find(
            (w) =>
              Number.isFinite(w.dirDeg) &&
              (Number.isFinite(w.speedMs) || Number.isFinite(w.speedKmh))
          );
          if (single) {
            validWindPoints = firstSample.map(([lat, lon]) => ({
              lat,
              lon,
              dirDeg: single.dirDeg,
              speedMs: single.speedMs,
              speedKmh: single.speedKmh,
            }));
          }
        }
      }

      // Guaranteed fallback so arrows/colors don't disappear completely.
      if (validWindPoints.length === 0 && firstSample.length > 0) {
        windUsedSyntheticFallback = true;
        validWindPoints = firstSample.map(([lat, lon]) => ({
          lat,
          lon,
          dirDeg: 0,
          speedMs: 3,
          speedKmh: 10.8,
        }));
      }
      if (requestId !== latestRouteReqRef.current) return;
      setWinds(validWindPoints);
    } catch {
      windRequestFailed = true;
      if (requestId !== latestRouteReqRef.current) return;
      if (firstSample.length > 0) {
        windUsedSyntheticFallback = true;
        setWinds(
          firstSample.map(([lat, lon]) => ({
            lat,
            lon,
            dirDeg: 0,
            speedMs: 3,
            speedKmh: 10.8,
          }))
        );
      } else {
        setWinds([]);
      }
      console.error("[routing] wind request failed");
    }

    // Elevation (~300m intervals)
    let elevationPoints: ElevPoint[] = [];
    let elevationRequestFailed = false;
    try {
      const elevData = await fetchJSON<{ points: ElevPoint[] }>("/api/elevation?nocache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords: analysisLonLat, intervalMeters: 300, dataset: "srtm90m" }),
        timeoutMs: 30000,
      });
      elevationPoints = Array.isArray(elevData.points) ? elevData.points : [];
      if (requestId !== latestRouteReqRef.current) return;
      if (elevationPoints.length > 0) {
        setElevPts(elevationPoints);
      }
      if (elevationPoints.length > 0) {
        setShowElevation(true);
      }
    } catch (err) {
      elevationRequestFailed = true;
      if (requestId !== latestRouteReqRef.current) return;
      console.error("[routing] elevation request failed", err instanceof Error ? err.message : String(err));
    }

    if (requestId !== latestRouteReqRef.current) return;
    const sampleLonLat = [...routeLonLat.slice(0, 3), ...routeLonLat.slice(-3)];
    const elevationValid = elevationPoints.filter((p) => typeof p.elevation === "number").length;
    const elevationErrors = elevationPoints.filter((p) => p.error).length;
    const baseMessage = elevationRequestFailed
      ? "Elevation request failed"
      : elevationValid > 0
        ? windRequestFailed
          ? "Wind request failed"
          : windUsedSyntheticFallback
            ? "Wind API unavailable; using fallback vectors."
            : validWindPoints.length === 0
              ? "No valid wind vectors returned"
              : undefined
        : "Elevation API returned no numeric elevations";
    const simplifyPrefix =
      merged.length !== routeLonLat.length
        ? `Route simplified ${merged.length} -> ${routeLonLat.length} points. `
        : "";
    setRouteDebug({
      source: meta.source,
      incomingCount: meta.incomingCount,
      mergedCount: routeLonLat.length,
      sampleLonLat,
      windCount: validWindPoints.length,
      elevationReturned: elevationPoints.length,
      elevationValid,
      elevationErrors,
      updatedAt: new Date().toISOString(),
      message: `${simplifyPrefix}${baseMessage ?? ""}`.trim() || undefined,
    });

    // Center view
    const mid = line[Math.floor(line.length / 2)];
    if (mid) setProgrammaticCenter({ lat: mid[0], lon: mid[1] });

    // Clear interaction state
    setCursorPt(null);
    setFocusIdx(null);
    setPanelHoverIdx(null);
  };

  const planRouteMulti = async (points: [number, number][]) => {
    if (directGpxModeRef.current) return;
    try {
      if (points.length < 2) return;
      const requestId = ++latestRouteReqRef.current;
      const merged: LonLat[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        let leg: LonLat[] = [];
        try {
          leg = await fetchLegCoords(points[i], points[i + 1]);
        } catch {
          // Keep trying other legs; we'll fallback later if needed.
          leg = [];
        }
        if (requestId !== latestRouteReqRef.current) return;
        if (leg.length < 2) continue;
        if (merged.length === 0) {
          merged.push(...leg);
          continue;
        }
        const first = leg[0];
        const tail = sameLonLat(merged[merged.length - 1], first) ? leg.slice(1) : leg;
        merged.push(...tail);
      }
      if (merged.length < 2) {
        // Fallback 1: one-shot Mapbox route for all points
        let oneShot: LonLat[] = [];
        try {
          oneShot = await fetchRouteForAllPoints(points);
        } catch {
          oneShot = [];
        }
        if (requestId !== latestRouteReqRef.current) return;

        if (oneShot.length >= 2) {
          await applyRouteFromLonLat(
            oneShot,
            { source: "planned", incomingCount: points.length },
            requestId
          );
          setRouteDebug((prev) =>
            prev
              ? {
                  ...prev,
                  updatedAt: new Date().toISOString(),
                  message: "Some legs failed; used one-shot route fallback.",
                }
              : prev
          );
          return;
        }

        // Fallback 2: straight polyline so user always sees response
        const straight = points.filter(([lon, lat]) => isValidCoordinate(lat, lon));
        if (straight.length >= 2) {
          await applyRouteFromLonLat(
            straight,
            { source: "planned", incomingCount: points.length },
            requestId
          );
          setRouteDebug((prev) =>
            prev
              ? {
                  ...prev,
                  updatedAt: new Date().toISOString(),
                  message: "Routing API failed; showing straight-line fallback.",
                }
              : prev
          );
          return;
        }

        throw new Error("No valid route legs returned for input stop order");
      }
      await applyRouteFromLonLat(
        merged,
        { source: "planned", incomingCount: points.length },
        requestId
      );
    } catch (e) {
      console.error("Route plan failed", e);
      setRouteDebug({
        source: "planned",
        incomingCount: points.length,
        mergedCount: 0,
        sampleLonLat: points.slice(0, 2) as [number, number][],
        windCount: 0,
        elevationReturned: 0,
        elevationValid: 0,
        elevationErrors: 0,
        updatedAt: new Date().toISOString(),
        message: e instanceof Error ? e.message : "Route plan failed",
      });
    }
  };

  const moveWaypoint = (fromIndex: number, toIndex: number) => {
    directGpxModeRef.current = false;
    setWaypointInputs((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moving] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moving);
      const waypointCoords = next
        .map((w) => w.lonLat)
        .filter((v): v is LonLat => Array.isArray(v));
      if (startLonLat && endLonLat) {
        const all: [number, number][] = [startLonLat, ...waypointCoords, endLonLat];
        void planRouteMulti(all);
      }
      return next;
    });
  };

  const beginMapPick = (role: "start" | "end" | "waypoint", wpIdx?: number) => {
    directGpxModeRef.current = false;
    if (role === "waypoint") {
      setPendingWaypointIndex(typeof wpIdx === "number" ? wpIdx : null);
      setPickMode("waypoint");
      return;
    }
    setPendingWaypointIndex(null);
    setPickMode(role);
  };

  const clearStart = () => {
    directGpxModeRef.current = false;
    setStartLonLat(null);
    setStartLabel("");
    writeQuery(null, endLonLat);
    setPickMode("none");
    setPendingWaypointIndex(null);
  };

  const clearEnd = () => {
    directGpxModeRef.current = false;
    setEndLonLat(null);
    setEndLabel("");
    writeQuery(startLonLat, null);
    setPickMode("none");
    setPendingWaypointIndex(null);
  };

  const moveStartDown = () => {
    directGpxModeRef.current = false;
    if (!startLonLat || waypointInputs.length === 0) return;
    const first = waypointInputs[0];
    if (!first.lonLat) return;
    const oldStart = startLonLat;
    const oldStartLabel = startLabel || `${startLonLat[1].toFixed(5)}, ${startLonLat[0].toFixed(5)}`;
    setStartLonLat(first.lonLat);
    setStartLabel(first.label || `${first.lonLat[1].toFixed(5)}, ${first.lonLat[0].toFixed(5)}`);
    setWaypointInputs((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { label: oldStartLabel, lonLat: oldStart };
      return next;
    });
  };

  const moveEndUp = () => {
    directGpxModeRef.current = false;
    if (!endLonLat || waypointInputs.length === 0) return;
    const lastIdx = waypointInputs.length - 1;
    const last = waypointInputs[lastIdx];
    if (!last.lonLat) return;
    const oldEnd = endLonLat;
    const oldEndLabel = endLabel || `${endLonLat[1].toFixed(5)}, ${endLonLat[0].toFixed(5)}`;
    setEndLonLat(last.lonLat);
    setEndLabel(last.label || `${last.lonLat[1].toFixed(5)}, ${last.lonLat[0].toFixed(5)}`);
    setWaypointInputs((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[lastIdx] = { label: oldEndLabel, lonLat: oldEnd };
      return next;
    });
  };

  const swapStartEnd = () => {
    directGpxModeRef.current = false;
    if (!startLonLat || !endLonLat) return;
    suppressAutoPlanRef.current = true;
    const nextStart = endLonLat;
    const nextEnd = startLonLat;
    const nextStartLabel =
      endLabel || `${endLonLat[1].toFixed(5)}, ${endLonLat[0].toFixed(5)}`;
    const nextEndLabel =
      startLabel || `${startLonLat[1].toFixed(5)}, ${startLonLat[0].toFixed(5)}`;
    setStartLonLat(nextStart);
    setEndLonLat(nextEnd);
    setStartLabel(nextStartLabel);
    setEndLabel(nextEndLabel);
    setWaypointInputs((prev) => [...prev].reverse());
    if (route.length > 1) {
      setRoute((prev) => [...prev].reverse());
    }
    if (elevPts.length > 1) {
      setElevPts((prev) => [...prev].reverse());
    }
    setPickMode("none");
    setPendingWaypointIndex(null);
    writeQuery(nextStart, nextEnd);
  };

  const clearRoute = () => {
    directGpxModeRef.current = false;
    // Invalidate any in-flight routing response so it cannot repopulate cleared state.
    latestRouteReqRef.current += 1;
    setStartLonLat(null);
    setEndLonLat(null);
    setStartLabel("");
    setEndLabel("");
    setWaypointInputs([]);
    setRoute([]);
    setWinds([]);
    setElevPts([]);
    setCursorPt(null);
    setFocusIdx(null);
    setPanelHoverIdx(null);
    setPickMode("none");
    setPendingWaypointIndex(null);
    setShowWebcams(false);
    setWebcams([]);
    setActiveWebcam(null);
    writeQuery(null, null);
    // Also reset routing panel local state if needed
    // (handled by onWaypointsChange and props)
  };

  const downloadRouteGpx = () => {
    if (route.length < 2) return;
    const esc = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
    const now = new Date();
    const iso = now.toISOString();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const name = "Tailwind Sprint Route";

    const wptLines: string[] = [];
    if (startLonLat) {
      const label = startLabel || "Start";
      wptLines.push(`  <wpt lat="${startLonLat[1].toFixed(6)}" lon="${startLonLat[0].toFixed(6)}"><name>${esc(label)}</name></wpt>`);
    }
    waypointInputs.forEach((w, idx) => {
      if (!w.lonLat) return;
      const label = w.label || `Stop ${idx + 1}`;
      wptLines.push(`  <wpt lat="${w.lonLat[1].toFixed(6)}" lon="${w.lonLat[0].toFixed(6)}"><name>${esc(label)}</name></wpt>`);
    });
    if (endLonLat) {
      const label = endLabel || "End";
      wptLines.push(`  <wpt lat="${endLonLat[1].toFixed(6)}" lon="${endLonLat[0].toFixed(6)}"><name>${esc(label)}</name></wpt>`);
    }

    const trkptLines = route.map(
      ([lat, lon]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`
    );

    const gpx = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Tailwind Sprint" xmlns="http://www.topografix.com/GPX/1/1">',
      "  <metadata>",
      `    <name>${name}</name>`,
      `    <time>${iso}</time>`,
      "  </metadata>",
      ...wptLines,
      "  <trk>",
      `    <name>${name}</name>`,
      "    <trkseg>",
      ...trkptLines,
      "    </trkseg>",
      "  </trk>",
      "</gpx>",
      "",
    ].join("\n");

    const blob = new Blob([gpx], { type: "application/gpx+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tailwind-sprint-route-${stamp}.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const applyRoutePreset = async (presetId: string) => {
    const preset = TAIPEI_ROUTE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setApplyingPresetId(presetId);
    pendingPresetCacheRef.current = null;
    try {
      const fitBoundsToRoute = (coords: LonLat[]) => {
        if (isPhone && didAutoCenterToUserRef.current) return;
        const map = mapRef.current?.getMap();
        if (!map || coords.length < 2) return;
        const lons = coords.map((p) => p[0]);
        const lats = coords.map((p) => p[1]);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        if (Number.isFinite(minLon) && Number.isFinite(maxLon) && Number.isFinite(minLat) && Number.isFinite(maxLat)) {
          map.fitBounds(
            [
              [minLon, minLat],
              [maxLon, maxLat],
            ],
            { padding: 80, duration: 900, maxZoom: 14 }
          );
        }
      };

      const cachedRoute = loadCachedPresetRoute(preset.id);
      if (cachedRoute && cachedRoute.length >= 2) {
        directGpxModeRef.current = true;
        pendingPresetCacheRef.current = null;
        const [startLon, startLat] = cachedRoute[0];
        const [endLon, endLat] = cachedRoute[cachedRoute.length - 1];
        const hasStops = preset.stops.length >= 2 && !preset.gpxPath;
        const startName = hasStops ? preset.stops[0].name : "起點";
        const endName = hasStops ? preset.stops[preset.stops.length - 1].name : "終點";
        suppressAutoPlanRef.current = true;
        setStartLonLat([startLon, startLat]);
        setEndLonLat([endLon, endLat]);
        setStartLabel(startName);
        setEndLabel(endName);
        setWaypointInputs(
          hasStops
            ? preset.stops.slice(1, -1).map((s) => ({ label: s.name, lonLat: s.lonLat }))
            : []
        );
        setPickMode("none");
        setPendingWaypointIndex(null);
        setProgrammaticCenter({ lat: (startLat + endLat) / 2, lon: (startLon + endLon) / 2 });
        writeQuery([startLon, startLat], [endLon, endLat]);

        const requestId = ++latestRouteReqRef.current;
        await applyRouteFromLonLat(
          cachedRoute,
          { source: "planned", incomingCount: cachedRoute.length },
          requestId
        );
        fitBoundsToRoute(cachedRoute);
        return;
      }

      if (preset.gpxPath) {
        directGpxModeRef.current = true;
        const r = await fetch(preset.gpxPath, { cache: "no-store" });
        if (!r.ok) throw new Error(`Failed to load GPX (${r.status})`);
        const gpxTrack = parseGpxTrackPoints(await r.text());
        if (gpxTrack.length < 2) throw new Error("GPX track has insufficient points.");

        const [startLon, startLat] = gpxTrack[0];
        const [endLon, endLat] = gpxTrack[gpxTrack.length - 1];
        suppressAutoPlanRef.current = true;
        setStartLonLat([startLon, startLat]);
        setEndLonLat([endLon, endLat]);
        setStartLabel("起點");
        setEndLabel("終點");
        setWaypointInputs([]);
        setPickMode("none");
        setPendingWaypointIndex(null);
        setProgrammaticCenter({ lat: (startLat + endLat) / 2, lon: (startLon + endLon) / 2 });
        writeQuery([startLon, startLat], [endLon, endLat]);

        const requestId = ++latestRouteReqRef.current;
        pendingPresetCacheRef.current = preset.id;
        await applyRouteFromLonLat(gpxTrack, { source: "planned", incomingCount: gpxTrack.length }, requestId);
        fitBoundsToRoute(gpxTrack);
        return;
      }
      directGpxModeRef.current = false;

      const points = preset.stops.map((s) => ({
        name: s.name,
        lat: s.lonLat[1],
        lon: s.lonLat[0],
      }));
      if (points.length < 2) {
        throw new Error("Could not resolve enough stops for this preset.");
      }
      const start = points[0];
      const end = points[points.length - 1];
      const waypoints = points.slice(1, -1);

      setStartLonLat([start.lon, start.lat]);
      setStartLabel(start.name);
      setEndLonLat([end.lon, end.lat]);
      setEndLabel(end.name);
      setWaypointInputs(
        waypoints.map((w) => ({
          label: w.name,
          lonLat: [w.lon, w.lat] as LonLat,
        }))
      );
      setPickMode("none");
      setPendingWaypointIndex(null);
      setProgrammaticCenter({ lat: (start.lat + end.lat) / 2, lon: (start.lon + end.lon) / 2 });
      // Zoom map to fit the full preset route area.
      const map = mapRef.current?.getMap();
      if (map) {
        const allLonLats: LonLat[] = [
          [start.lon, start.lat],
          ...waypoints.map((w) => [w.lon, w.lat] as LonLat),
          [end.lon, end.lat],
        ];
        const lons = allLonLats.map((p) => p[0]);
        const lats = allLonLats.map((p) => p[1]);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        if (Number.isFinite(minLon) && Number.isFinite(maxLon) && Number.isFinite(minLat) && Number.isFinite(maxLat)) {
          map.fitBounds(
            [
              [minLon, minLat],
              [maxLon, maxLat],
            ],
            { padding: 80, duration: 900, maxZoom: 14 }
          );
        }
      }
      writeQuery([start.lon, start.lat], [end.lon, end.lat]);
      pendingPresetCacheRef.current = preset.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load preset route";
      setRouteDebug((prev) => ({
        source: "planned",
        incomingCount: prev?.incomingCount ?? 0,
        mergedCount: prev?.mergedCount ?? 0,
        sampleLonLat: prev?.sampleLonLat ?? [],
        windCount: prev?.windCount ?? 0,
        elevationReturned: prev?.elevationReturned ?? 0,
        elevationValid: prev?.elevationValid ?? 0,
        elevationErrors: prev?.elevationErrors ?? 0,
        updatedAt: new Date().toISOString(),
        message: msg,
      }));
    } finally {
      setApplyingPresetId(null);
    }
  };

  // Plan route when start/end change
  useEffect(() => {
    if (directGpxModeRef.current) return;
    if (suppressAutoPlanRef.current) {
      suppressAutoPlanRef.current = false;
      return;
    }
    const waypointCoords = waypointInputs
      .map((w) => w.lonLat)
      .filter((v): v is LonLat => Array.isArray(v));
    if (startLonLat && endLonLat) {
      const all: [number, number][] = [startLonLat, ...waypointCoords, endLonLat];
      void planRouteMulti(all);
      return;
    }
    setRoute([]);
    setWinds([]);
    setElevPts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLonLat, endLonLat, JSON.stringify(waypointInputs)]);

  const displayWaypoints = useMemo(
    () =>
      waypointInputs
        .map((wp, idx) => ({ idx, lonLat: wp.lonLat }))
        .filter((wp): wp is { idx: number; lonLat: LonLat } => Array.isArray(wp.lonLat)),
    [waypointInputs]
  );

  // Fly to target
  useEffect(() => {
    if (!mapRef.current || !focusPt) return;
    const map = mapRef.current.getMap();
    map.flyTo({
      center: [focusPt.lon, focusPt.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 800,
    });
  }, [focusPt]);

  useEffect(() => {
    if (route.length > 1) {
      setShowWebcams(true);
    }
  }, [route.length]);

  useEffect(() => {
    if (route.length < 2) return;
    const requestId = ++latestRouteReqRef.current;
    const lonLat = route.map(([lat, lon]) => [lon, lat] as LonLat);
    void applyRouteFromLonLat(lonLat, { source: "planned", incomingCount: lonLat.length }, requestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastIsoUtc]);

  useEffect(() => {
    if (!showWebcams) {
      setWebcams([]);
      setActiveWebcam(null);
      return;
    }

    const fetchAroundCenter = async () => {
      const p = new URLSearchParams({
        lat: String(mapCenter.lat),
        lon: String(mapCenter.lon),
        radiusKm: String(WEBCAM_RADIUS_KM),
        limit: "30",
      });
      return fetchWebcamsWithClientCache(p);
    };

    const fetchAroundRoute = async () => {
      const anchors = sampleRoutePoints(route, 8);
      if (anchors.length === 0) return [] as WebcamItem[];
      const fetchForRadius = async (radiusKm: number) => {
        const lists = await Promise.all(
          anchors.map(async (pt) => {
            const p = new URLSearchParams({
              lat: String(pt.lat),
              lon: String(pt.lon),
              radiusKm: String(radiusKm),
              limit: "30",
            });
            return fetchWebcamsWithClientCache(p);
          })
        );
        const merged = new globalThis.Map<string, WebcamItem>();
        for (const row of lists.flat()) {
          const key = webcamKeyOf(row);
          const prev = merged.get(key);
          if (!prev) {
            merged.set(key, row);
            continue;
          }
          const d = Math.min(prev.distance ?? Number.POSITIVE_INFINITY, row.distance ?? Number.POSITIVE_INFINITY);
          merged.set(key, { ...prev, ...row, distance: Number.isFinite(d) ? d : prev.distance });
        }
        const routePts = route.length > 0 ? route : anchors.map((a) => [a.lat, a.lon] as [number, number]);
        const withRouteDistance = Array.from(merged.values()).map((cam) => {
          const minToRoute = routePts.reduce((best, [rlat, rlon]) => {
            const d = haversineMeters(cam.lat, cam.lon, rlat, rlon);
            return d < best ? d : best;
          }, Number.POSITIVE_INFINITY);
          return { ...cam, distance: Math.round(minToRoute) };
        });
        return withRouteDistance
          .filter((cam) => (cam.distance ?? Number.POSITIVE_INFINITY) <= radiusKm * 1000 + 10)
          .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY))
          .slice(0, 50);
      };

      const primary = await fetchForRadius(WEBCAM_RADIUS_KM);
      if (primary.length > 0) return primary;
      return fetchForRadius(10);
    };

    let cancelled = false;
    const t = setTimeout(() => {
      const task = route.length > 1 ? fetchAroundRoute() : fetchAroundCenter();
      task
        .then((j) => {
          if (!cancelled) {
            const next = j;
            setWebcams(next);
            setActiveWebcam((prev) => {
              if (!prev) return null;
              const found = next.find((w) => (w.id != null && prev.id != null ? String(w.id) === String(prev.id) : w.lat === prev.lat && w.lon === prev.lon));
              return found ?? null;
            });
          }
        })
        .catch(() => {
          if (!cancelled) setWebcams([]);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [showWebcams, mapCenter.lat, mapCenter.lon, route, fetchWebcamsWithClientCache]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapGL
        ref={mapRef}
        initialViewState={{
          longitude: mapCenter.lon,
          latitude: mapCenter.lat,
          zoom: zoom,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        onLoad={tryFlyToPendingGeoCenter}
        onIdle={tryFlyToPendingGeoCenter}
        onMove={(evt) => {
          setMapCenter({ lat: evt.viewState.latitude, lon: evt.viewState.longitude });
          setZoom(evt.viewState.zoom);
        }}
      >
        <NavigationControl position="top-left" />

        <MapInteraction
          mapRef={mapRef}
          elevPts={elevPts}
          onPickIndex={(idx) => {
            if (typeof idx === "number") setFocusIdx((p) => (p === idx ? p : idx));
          }}
          onHoverIndex={(idx) => {
            setPanelHoverIdx((p) => (p === idx ? p : idx));
          }}
          pickMode={pickMode}
          onPick={(role, lat, lon) => {
            const v: [number, number] = [lon, lat];
            if (role === "start") {
              setStartLonLat(v);
              setStartLabel(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
              writeQuery(v, endLonLat);
            } else if (role === "end") {
              setEndLonLat(v);
              setEndLabel(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
              writeQuery(startLonLat, v);
            } else {
              setWaypointInputs((prev) => {
                if (typeof pendingWaypointIndex === "number") {
                  const next = [...prev];
                  while (next.length <= pendingWaypointIndex) {
                    next.push({ label: `Stop ${next.length + 1}`, lonLat: null });
                  }
                  next[pendingWaypointIndex] = {
                    label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                    lonLat: v,
                  };
                  return next;
                }
                return [
                  ...prev,
                  { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lonLat: v },
                ];
              });
            }
          }}
          onDone={() => {
            setPickMode("none");
            setPendingWaypointIndex(null);
          }}
        />

        {/* Start marker */}
        {startLonLat && (
          <Marker
            longitude={startLonLat[0]}
            latitude={startLonLat[1]}
            draggable
            onDragEnd={(e) => {
              directGpxModeRef.current = false;
              const { lng, lat } = e.lngLat;
              const v: [number, number] = [lng, lat];
              setStartLonLat(v);
              writeQuery(v, endLonLat);
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#22c55e",
                border: "3px solid #ffffff",
                boxShadow: "0 6px 14px rgba(15,23,42,0.35)",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 12,
                display: "grid",
                placeItems: "center",
                transform: "translate(-50%, -50%)",
              }}
              aria-label="Start"
            >
              S
            </div>
          </Marker>
        )}

        {/* End marker */}
        {endLonLat && (
          <Marker
            longitude={endLonLat[0]}
            latitude={endLonLat[1]}
            draggable
            onDragEnd={(e) => {
              directGpxModeRef.current = false;
              const { lng, lat } = e.lngLat;
              const v: [number, number] = [lng, lat];
              setEndLonLat(v);
              writeQuery(startLonLat, v);
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#ef4444",
                border: "3px solid #ffffff",
                boxShadow: "0 6px 14px rgba(15,23,42,0.35)",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 12,
                display: "grid",
                placeItems: "center",
                transform: "translate(-50%, -50%)",
              }}
              aria-label="End"
            >
              E
            </div>
          </Marker>
        )}

        {/* Waypoint markers */}
        {displayWaypoints.map(({ idx, lonLat: [lon, lat] }) => (
          <Marker
            key={`wp-${idx}`}
            longitude={lon}
            latitude={lat}
            color="#f59e0b"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setWaypointInputs((prev) => prev.filter((_, i) => i !== idx));
            }}
          />
        ))}

        {/* Webcam markers */}
        {showWebcams && webcams.map((w) => (
          <Marker
            key={`cam-${w.id || w.lat.toFixed(5)}-${w.lon.toFixed(5)}`}
            longitude={w.lon}
            latitude={w.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setActiveWebcam(w);
            }}
          >
            <div style={webcamMarkerWrapStyle} aria-label={`Webcam marker: ${w.title || "webcam"}`}>
              <div style={webcamMarkerFaceStyle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 8.5A2.5 2.5 0 0 1 6.5 6h7A2.5 2.5 0 0 1 16 8.5v1.2l2.5-1.5A1.5 1.5 0 0 1 21 9.5v5a1.5 1.5 0 0 1-2.5 1.3L16 14.3v1.2a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 15.5v-7Z"
                    fill="#ffffff"
                  />
                  <circle cx="10" cy="12" r="2.25" fill="#0c4a6e" />
                </svg>
              </div>
              <div style={webcamMarkerTailStyle} />
            </div>
          </Marker>
        ))}
        {showWebcams && activeWebcam && (
          <Popup
            longitude={activeWebcam.lon}
            latitude={activeWebcam.lat}
            anchor="top"
            closeOnClick={false}
            onClose={() => setActiveWebcam(null)}
            offset={10}
            maxWidth="260px"
          >
            <div style={{ minWidth: 220, color: "#0f172a", background: "#ffffff", padding: 2 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.25, color: "#020617" }}>
                  {activeWebcam.title || "Webcam"}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveWebcam(null)}
                  aria-label="Close webcam popup"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: "18px",
                    textAlign: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              {activeWebcam.provider ? (
                <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  source: {activeWebcam.provider}
                </div>
              ) : null}
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>
                {activeWebcam.city || activeWebcam.region || activeWebcam.country || `${activeWebcam.lat.toFixed(5)}, ${activeWebcam.lon.toFixed(5)}`}
              </div>
              {activeWebcam.preview ? (
                <Image
                  src={activeWebcam.preview}
                  alt={activeWebcam.title || "webcam preview"}
                  width={240}
                  height={120}
                  unoptimized
                  style={{
                    width: "100%",
                    height: 120,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 80,
                    display: "grid",
                    placeItems: "center",
                    color: "#334155",
                    background: "#f1f5f9",
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  no preview
                </div>
              )}
              {activeWebcam.detailUrl ? (
                <a
                  href={activeWebcam.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8, color: "#1d4ed8", fontSize: 13, fontWeight: 700, textDecoration: "underline" }}
                >
                  Open stream/source
                </a>
              ) : null}
            </div>
          </Popup>
        )}

        {/* Route with wind coloring and wind arrows */}
        {route.length > 0 && (
          <RouteWindLayer
            route={route}
            winds={winds}
            elevPts={elevPts}
            mode={routeColorMode}
            weight={6}
            segmentMeters={segmentMeters}
            zoom={zoom}
          />
        )}

        {/* Cursor highlight */}
        {cursorPt && (
          <Marker longitude={cursorPt.lon} latitude={cursorPt.lat} anchor="center">
            <div style={riderMarkerStyle} aria-label="Route cursor">
              <div style={riderIconImageStyle} />
            </div>
          </Marker>
        )}

        {/* Focus highlight */}
        {focusPt && (
          <Marker longitude={focusPt.lon} latitude={focusPt.lat} anchor="center">
            <div style={riderMarkerFocusStyle} aria-label="Route focus">
              <div style={riderIconImageStyle} />
            </div>
          </Marker>
        )}
      </MapGL>

      <div style={{ ...panelIconDockStyle, top: isPhone ? 72 : 12 }}>
        <button
          onClick={() => {
            setShowRoutingPanel((v) => {
              const next = !v;
              if (next) {
                setShowDataPanel(false);
                setShowElevation(false);
              }
              return next;
            });
          }}
          style={panelIconButtonStyle(showRoutingPanel)}
          aria-label="Toggle route panel"
          title="Route"
        >
          <span style={panelIconGlyphStyle} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17c3-5 6-7 9-8" />
              <path d="M13 9h6" />
              <path d="M17 5l4 4-4 4" />
              <circle cx="4" cy="17" r="1.5" />
            </svg>
          </span>
        </button>
        <button
          onClick={() => {
            setShowDataPanel((v) => {
              const next = !v;
              if (next) {
                setShowRoutingPanel(false);
                setShowElevation(false);
              }
              return next;
            });
          }}
          style={panelIconButtonStyle(showDataPanel)}
          aria-label="Toggle legend panel"
          title="Legend"
        >
          <span style={panelIconGlyphStyle} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="5" height="5" rx="1" />
              <rect x="10" y="5" width="5" height="5" rx="1" />
              <rect x="16" y="5" width="4" height="5" rx="1" />
              <rect x="4" y="13" width="8" height="6" rx="1" />
              <rect x="13" y="13" width="7" height="6" rx="1" />
            </svg>
          </span>
        </button>
        <button
          onClick={() => {
            setShowElevation((v) => {
              const next = !v;
              if (next) {
                setShowRoutingPanel(false);
                setShowDataPanel(false);
              }
              return next;
            });
          }}
          style={panelIconButtonStyle(showElevation)}
          aria-label="Toggle elevation panel"
          title="Elevation"
        >
          <span style={panelIconGlyphStyle} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17 9 9l4 5 4-7 4 10" />
            </svg>
          </span>
        </button>
        <button
          onClick={() => setShowWebcams((v) => !v)}
          style={panelIconButtonStyle(showWebcams)}
          aria-label="Toggle webcams"
          title="Webcams"
        >
          <span style={panelIconGlyphStyle} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="7" width="12" height="10" rx="2" />
              <path d="m15 10 6-3v10l-6-3" />
            </svg>
          </span>
        </button>
      </div>

      {/* Routing Panel */}
      {showRoutingPanel && (
        <div
          style={{
            position: "absolute",
            right: isPhone ? 8 : 132,
            left: isPhone ? 8 : "auto",
            top: isPhone ? 124 : 12,
            bottom: "auto",
            zIndex: 1650,
          }}
        >
          <div
            style={{
              ...panelCardStyle,
              width: isPhone ? "auto" : isTablet ? "clamp(320px, 46vw, 440px)" : "380px",
              maxHeight: isPhone ? "68vh" : isTablet ? "74vh" : "76vh",
              overflowY: "auto",
              overflowX: "hidden",
              overscrollBehavior: "contain",
              padding: isPhone ? "10px 12px" : panelCardStyle.padding,
            }}
          >
            <div style={{ ...panelHeaderStyle, marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Route Planner</span>
              <button onClick={() => setShowRoutingPanel(false)} style={closeButtonStyle} aria-label="Close routing panel">
                ✖
              </button>
            </div>
            <MapboxRoutingPanel
              center={mapCenter}
              startLatLon={startLonLat}
              startLabel={startLabel}
              endLatLon={endLonLat}
              endLabel={endLabel}
              waypoints={waypointInputs.map((w) => ({ label: w.label, latLon: w.lonLat }))}
              onWaypointsChange={(next) => {
                directGpxModeRef.current = false;
                setWaypointInputs(() => {
                  const updated = next.map((w) => ({ label: w.label, lonLat: w.latLon ?? null }));
                  const waypointCoords = updated
                    .map((w) => w.lonLat)
                    .filter((v): v is LonLat => Array.isArray(v));
                  if (startLonLat && endLonLat) {
                    const all: [number, number][] = [startLonLat, ...waypointCoords, endLonLat];
                    void planRouteMulti(all);
                  }
                  return updated;
                });
              }}
              onMoveWaypoint={moveWaypoint}
              onClearStart={clearStart}
              onClearEnd={clearEnd}
              onMoveStartDown={moveStartDown}
              onMoveEndUp={moveEndUp}
              onSwapStartEnd={swapStartEnd}
              onDownloadGpx={downloadRouteGpx}
              canDownloadGpx={route.length > 1}
              onClearRoute={clearRoute}
              onPickOnMap={(role, wpIdx) => beginMapPick(role, wpIdx)}
              pickMode={pickMode}
              pendingWaypointIndex={pendingWaypointIndex}
              routePresets={TAIPEI_ROUTE_PRESETS.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
              }))}
              onApplyPreset={applyRoutePreset}
              isApplyingPreset={Boolean(applyingPresetId)}
              onPick={(role: RoutingPanelRole, lat, lon, label, wpIdx) => {
                directGpxModeRef.current = false;
                const v: LonLat = [lon, lat];
                if (role === "start") {
                  setStartLonLat(v);
                  setStartLabel(label);
                  writeQuery(v, endLonLat);
                  return;
                }
                if (role === "end") {
                  setEndLonLat(v);
                  setEndLabel(label);
                  writeQuery(startLonLat, v);
                  return;
                }
                if (typeof wpIdx !== "number") return;
                setWaypointInputs((prev) => {
                  const next = [...prev];
                  while (next.length <= wpIdx) next.push({ label: `Stop ${next.length + 1}`, lonLat: null });
                  next[wpIdx] = { label, lonLat: v };
                  return next;
                });
              }}
            />
          </div>
        </div>
      )}
      {/* Data Panels */}
      {showDataPanel && (
        <div
          style={{
            position: "absolute",
            right: isPhone ? 8 : 132,
            left: isPhone ? 8 : "auto",
            top: isPhone ? 124 : 12,
            bottom: "auto",
            zIndex: 1660,
            width: isPhone ? "auto" : isTablet ? "min(44vw, 380px)" : "340px",
            maxHeight: isPhone ? "60vh" : isTablet ? "66vh" : "64vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#1e293b", width: "100%" }}>
            <div
              style={{
                background: "rgba(255,255,255,0.94)",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.14)",
                padding: "8px 10px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                Wind Forecast Time
              </div>
              <input
                type="datetime-local"
                value={windForecastLocal}
                onChange={(e) => setWindForecastLocal(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 12,
                  color: "#0f172a",
                  background: "#fff",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setWindForecastLocal("")}
                  style={{
                    padding: "5px 8px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#334155",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Use Current
                </button>
                <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>
                  {forecastIsoUtc ? "Using selected time" : "Using live wind"}
                </span>
              </div>
            </div>
            <WindLegend
              mode={routeColorMode}
              onToggleMode={() => setRouteColorMode((prev) => (prev === "wind" ? "slope" : "wind"))}
              windAngleRatio={windAngleRatio}
            />
          </div>
        </div>
      )}

      {showElevation && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            top: "auto",
            zIndex: 1665,
            width: "100%",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(2,6,23,0.94)",
              borderTop: "1px solid rgba(148,163,184,0.35)",
              boxShadow: "0 -8px 24px rgba(2,6,23,0.45)",
              padding: isPhone ? "8px 10px calc(10px + env(safe-area-inset-bottom))" : "8px 12px 12px",
              height: isPhone ? "36vh" : isTablet ? "30vh" : "28vh",
              minHeight: isPhone ? 210 : 220,
              display: "grid",
              gridTemplateColumns: isPhone ? "1fr" : "220px 1fr",
              gap: 10,
              alignItems: "stretch",
              pointerEvents: "auto",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                color: "#e2e8f0",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                gap: 8,
                paddingLeft: isPhone ? 42 : 12,
                paddingBottom: isPhone ? 0 : 56,
                borderRight: isPhone ? "none" : "1px solid rgba(148,163,184,0.2)",
                paddingRight: isPhone ? 0 : 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  Elevation {elevPts.length > 0 ? `(${elevPts.length})` : ""}
                </span>
                <button
                  onClick={() => setShowElevation(false)}
                  style={{ ...closeButtonStyle, width: 20, height: 20, lineHeight: "18px" }}
                  aria-label="Close elevation panel"
                >
                  ✖
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.35, marginTop: 4 }}>
                <div>Points: {elevPts.length}</div>
                <div>Valid: {elevationStats.valid}</div>
                <div>Min: {elevationStats.min == null ? "-" : elevationStats.min.toFixed(0)} m</div>
                <div>Max: {elevationStats.max == null ? "-" : elevationStats.max.toFixed(0)} m</div>
              </div>
            </div>
            <div style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}>
              {elevPts.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#94a3b8",
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  No elevation data. Draw a route to see the elevation profile.
                </div>
              ) : (
                <ElevationPanel
                  points={elevPts as ElevPt[]}
                  compact
                  selectedIndex={focusIdx}
                  externalHoverIndex={panelHoverIdx}
                  onHover={(pt) => {
                    setCursorPt(
                      pt && typeof pt.lat === "number" && typeof pt.lon === "number"
                        ? { lat: pt.lat, lon: pt.lon }
                        : null
                    );
                  }}
                  onLeave={() => setCursorPt(null)}
                  onClick={(_, idx) => {
                    if (typeof idx === "number") setFocusIdx((p) => (p === idx ? p : idx));
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
