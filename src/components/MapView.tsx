// src/components/MapView.tsx
"use client";

import MapGL, { Marker, Source, Layer, NavigationControl, MapRef, Popup } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
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
  provider?: "windy" | "twipcam" | "both";
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
const ROUTE_CACHE_PREFIX = "ts-route-cache:v5:";
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
    description: "參考 bike100 台北路線：士林中社路。",
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
    name: "台北陽明山系｜海馬（逆時針）",
    description: "參考 bike100 高評分台北路線：陽明山海馬。",
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
    name: "環大臺北自行車挑戰（RWGPS）",
    description: "來源：上傳 GPX 檔 環大台北200K.gpx（直接依軌跡順序顯示）。",
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
    description: "來源：上傳 GPX 檔 環小台北(深南路).gpx（直接依軌跡順序顯示）。",
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
    description: "來源：上傳 GPX 檔 瘋系列-東三塔550k.gpx（直接依軌跡順序顯示）。",
    gpxPath: "/feng-east-3t-550k.gpx",
    stops: [
      { name: "起點", lonLat: [121.53776, 25.28993] },
      { name: "終點", lonLat: [120.84815, 21.9111] },
    ],
  },
  {
    id: "taipei-central-loop",
    name: "環中台北",
    description: "來源：上傳 GPX 檔 環中台北.gpx（直接依軌跡順序顯示）。",
    gpxPath: "/taipei-central-loop.gpx",
    stops: [
      { name: "起點", lonLat: [121.487379, 25.049422] },
      { name: "終點", lonLat: [121.489951, 25.048421] },
    ],
  },
  {
    id: "fengguizui",
    name: "風櫃嘴",
    description: "來源：上傳 GPX 檔 風櫃嘴_FengGuiZui.gpx（直接依軌跡順序顯示）。",
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
    fontSize: 13,
    fontWeight: 700,
    padding: "6px 10px",
    background: "rgba(15,23,42,0.9)",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 999,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
    backdropFilter: "blur(2px)",
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
    background: "rgba(255,255,255,0.95)",
    color: "#1e293b",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    padding: 8,
  };
  const panelHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
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
  const [showElevation, setShowElevation] = useState(true);
  const [showRoutingPanel, setShowRoutingPanel] = useState(true);
  const [showDataPanel, setShowDataPanel] = useState(true);
  const [routeColorMode, setRouteColorMode] = useState<"wind" | "slope">("wind");
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [, setRouteDebug] = useState<RouteDebug | null>(null);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const latestRouteReqRef = useRef<number>(0);
  const suppressAutoPlanRef = useRef(false);
  const directGpxModeRef = useRef(false);
  const routeCacheRef = useRef<Map<string, LonLat[]>>(new Map());
  const pendingPresetCacheRef = useRef<string | null>(null);
  const routeApiCacheRef = useRef<Map<string, LonLat[]>>(new Map());

  const mapRef = useRef<MapRef | null>(null);
  const isPhone = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1200;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isPhone) {
      setShowDataPanel(false);
    } else {
      setShowDataPanel(true);
    }
  }, [isPhone]);

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
    if (s && e) setMapCenter({ lat: (s[1] + e[1]) / 2, lon: (s[0] + e[0]) / 2 });
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

    // Set route (convert to [lat, lon])
    const line: [number, number][] = merged.map(([lon, lat]) => [lat, lon]);
    if (requestId !== latestRouteReqRef.current) return;
    setRoute(line);
    const pendingPresetId = pendingPresetCacheRef.current;
    if (pendingPresetId) {
      saveCachedPresetRoute(pendingPresetId, merged);
      pendingPresetCacheRef.current = null;
    }

    // Wind: sample route and retry with fewer points if response has no valid wind vectors.
    const buildSample = (targetCount: number): [number, number][] => {
      const step = Math.max(1, Math.floor(merged.length / targetCount));
      const pts = merged.filter((_, i) => i % step === 0).map(([lon, lat]) => [lat, lon] as [number, number]);
      const last = merged[merged.length - 1];
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
        body: JSON.stringify({ points: firstSample }),
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
          body: JSON.stringify({ points: retrySample }),
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
            body: JSON.stringify({ points: [mid] }),
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
        body: JSON.stringify({ coords: merged, intervalMeters: 300, dataset: "srtm90m" }),
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
    const sampleLonLat = [...merged.slice(0, 3), ...merged.slice(-3)];
    const elevationValid = elevationPoints.filter((p) => typeof p.elevation === "number").length;
    const elevationErrors = elevationPoints.filter((p) => p.error).length;
    setRouteDebug({
      source: meta.source,
      incomingCount: meta.incomingCount,
      mergedCount: merged.length,
      sampleLonLat,
      windCount: validWindPoints.length,
      elevationReturned: elevationPoints.length,
      elevationValid,
      elevationErrors,
      updatedAt: new Date().toISOString(),
      message: elevationRequestFailed
        ? "Elevation request failed"
        : elevationValid > 0
          ? windRequestFailed
            ? "Wind request failed"
            : windUsedSyntheticFallback
              ? "Wind API unavailable; using fallback vectors."
            : validWindPoints.length === 0
              ? "No valid wind vectors returned"
              : undefined
          : "Elevation API returned no numeric elevations",
    });

    // Center view
    const mid = line[Math.floor(line.length / 2)];
    if (mid) setMapCenter({ lat: mid[0], lon: mid[1] });

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
        setMapCenter({ lat: (startLat + endLat) / 2, lon: (startLon + endLon) / 2 });
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
        setMapCenter({ lat: (startLat + endLat) / 2, lon: (startLon + endLon) / 2 });
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
      setMapCenter({ lat: (start.lat + end.lat) / 2, lon: (start.lon + end.lon) / 2 });
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
      const j = await fetchJSON<{ items?: WebcamItem[] }>(`/api/webcams?${p.toString()}`, { timeoutMs: 12000 });
      return j.items ?? [];
    };

    const fetchAroundRoute = async () => {
      const anchors = sampleRoutePoints(route, 8);
      if (anchors.length === 0) return [] as WebcamItem[];
      const lists = await Promise.all(
        anchors.map(async (pt) => {
          const p = new URLSearchParams({
            lat: String(pt.lat),
            lon: String(pt.lon),
            radiusKm: String(WEBCAM_RADIUS_KM),
            limit: "30",
          });
          const j = await fetchJSON<{ items?: WebcamItem[] }>(`/api/webcams?${p.toString()}`, { timeoutMs: 12000 });
          return j.items ?? [];
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
        .filter((cam) => (cam.distance ?? Number.POSITIVE_INFINITY) <= WEBCAM_RADIUS_KM * 1000 + 10)
        .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY))
        .slice(0, 50);
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
  }, [showWebcams, mapCenter.lat, mapCenter.lon, route]);

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
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
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
          <Marker longitude={startLonLat[0]} latitude={startLonLat[1]} color="#22c55e" />
        )}

        {/* End marker */}
        {endLonLat && (
          <Marker longitude={endLonLat[0]} latitude={endLonLat[1]} color="#ef4444" />
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
          />
        )}

        {/* Cursor highlight */}
        {cursorPt && (
          <Source
            id="cursor-point"
            type="geojson"
            data={{
              type: "Feature",
              geometry: { type: "Point", coordinates: [cursorPt.lon, cursorPt.lat] },
              properties: {},
            }}
          >
            <Layer
              id="cursor-point-layer"
              type="circle"
              paint={{
                "circle-radius": 6,
                "circle-color": "#a5b4fc",
                "circle-stroke-color": "#6366f1",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
        )}

        {/* Focus highlight */}
        {focusPt && (
          <Source
            id="focus-point"
            type="geojson"
            data={{
              type: "Feature",
              geometry: { type: "Point", coordinates: [focusPt.lon, focusPt.lat] },
              properties: {},
            }}
          >
            <Layer
              id="focus-point-layer"
              type="circle"
              paint={{
                "circle-radius": 7,
                "circle-color": "#60a5fa",
                "circle-stroke-color": "#1d4ed8",
                "circle-stroke-width": 3,
              }}
            />
          </Source>
        )}
      </MapGL>

      {/* Webcam toggle */}
      {!isPhone && (
        <div
          style={{
            position: "absolute",
            left: 56,
            top: 12,
            zIndex: 1600,
          }}
        >
          <button onClick={() => setShowWebcams((v) => !v)} style={toggleButtonStyle}>
            {showWebcams ? "Hide Webcams" : "Show Webcams"}
          </button>
        </div>
      )}

      {isPhone && (
        <div style={{ position: "absolute", right: 8, top: 12, zIndex: 1700, display: "flex", gap: 6 }}>
          <button onClick={() => setShowWebcams((v) => !v)} style={toggleButtonStyle}>
            {showWebcams ? "Hide Webcams" : "Show Webcams"}
          </button>
          {!showElevation && (
            <button onClick={() => setShowElevation(true)} style={toggleButtonStyle}>
              Show Elevation
            </button>
          )}
          <button onClick={() => setShowDataPanel((v) => !v)} style={toggleButtonStyle}>
            {showDataPanel ? "Hide Legend" : "Legend"}
          </button>
          <button onClick={() => setShowRoutingPanel((v) => !v)} style={toggleButtonStyle}>
            {showRoutingPanel ? "Hide Route" : "Route"}
          </button>
        </div>
      )}

      {/* Routing Panel */}
      {showRoutingPanel && (
        <div
          style={{
            position: "absolute",
            right: isPhone ? 8 : 12,
            left: "auto",
            top: isPhone ? "auto" : 12,
            bottom: isPhone ? 12 : "auto",
            zIndex: 1650,
          }}
        >
          <div
            style={{
              ...panelCardStyle,
              width: isPhone ? "min(86vw, 320px)" : isTablet ? "min(42vw, 360px)" : "320px",
              maxHeight: isPhone ? "38vh" : isTablet ? "46vh" : "50vh",
              overflowY: "auto",
              overflowX: "hidden",
              overscrollBehavior: "contain",
            }}
          >
            <div style={{ ...panelHeaderStyle, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Routing Panel</span>
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
      {!showRoutingPanel && !isPhone && (
        <div style={{ position: "absolute", right: 12, top: 12, zIndex: 1650 }}>
          <button onClick={() => setShowRoutingPanel(true)} style={toggleButtonStyle}>
            Show Routing
          </button>
        </div>
      )}

      {/* Data Panels */}
      {(!isPhone || showDataPanel) && (
        <div
          style={{
            position: "absolute",
            right: isPhone ? 8 : 12,
            left: "auto",
            top: isPhone ? 58 : "auto",
            bottom: isPhone ? "auto" : 12,
            zIndex: 1660,
            width: isPhone ? "min(82vw, 300px)" : isTablet ? "min(38vw, 320px)" : "300px",
            maxHeight: isPhone ? "34vh" : isTablet ? "44vh" : "38vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#1e293b", width: "100%" }}>
            <WindLegend
              mode={routeColorMode}
              onToggleMode={() => setRouteColorMode((prev) => (prev === "wind" ? "slope" : "wind"))}
            />
          </div>
        </div>
      )}

      {/* Dedicated elevation panel for all devices */}
      {!isPhone && (
        <div style={{ position: "absolute", left: 56, bottom: 12, zIndex: 1670 }}>
          {!showElevation && (
            <button onClick={() => setShowElevation(true)} style={toggleButtonStyle}>
              Show Elevation
            </button>
          )}
        </div>
      )}

      {/* Dedicated elevation panel for all devices */}
      <div
        style={{
          position: "absolute",
          left: isPhone ? "auto" : 12,
          right: isPhone ? 8 : "auto",
          bottom: isPhone ? (showRoutingPanel ? "40vh" : 12) : 12,
          zIndex: 1665,
          width: isPhone
            ? "clamp(220px, 78vw, 320px)"
            : isTablet
              ? "clamp(280px, 40vw, 420px)"
              : "clamp(320px, 30vw, 460px)",
        }}
      >
          {showElevation ? (
            <div
              style={{
                ...panelCardStyle,
                padding: 6,
                maxHeight: isPhone ? "34vh" : isTablet ? "30vh" : "34vh",
                overflowY: "auto",
                minWidth: 0,
                width: "100%",
              }}
            >
              <div style={panelHeaderStyle}>
                <span style={{ fontWeight: 600 }}>Elevation {elevPts.length > 0 ? `(${elevPts.length})` : ""}</span>
                <button onClick={() => setShowElevation(false)} style={closeButtonStyle} aria-label="Close elevation panel">
                  ✖
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#999", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 4 }}>
                Points: {elevPts.length} | Valid: {elevPts.filter((p) => typeof p.elevation === "number").length}
              </div>
              {elevPts.length === 0 ? (
                <div style={{ fontSize: 12, color: "#666", padding: "8px 0" }}>
                  No elevation data. Draw a route to see the elevation profile.
                </div>
              ) : (
                <ElevationPanel
                  points={elevPts as ElevPt[]}
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
          ) : null}
      </div>
    </div>
  );
}
