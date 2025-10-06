// src/components/MapView.tsx
"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";
import WindLegend from "@/components/WindLegend";
import ElevationPanel, { ElevPt } from "@/components/ElevationPanel";
import SegmentationControls from "@/components/SegmentationControls";
import WebcamsPanel, { WebcamItem } from "@/components/WebcamsPanel";
import GeocodeSearch, { Role } from "@/components/GeocodeSearch";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Leaflet 預設 marker 圖示
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type LatLng = [number, number]; // [lat, lon]
type LineLatLng = LatLng[];

type OrsAPIResponseFeature = {
  features?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
  geometry?: { coordinates?: [number, number][] };
};
type OrsAPIResponse = { geometry: { type: "LineString"; coordinates: [number, number][] } };

type WindPoint = WindPointType;
type ElevPoint = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };

// 驗證經緯度
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

// fetchJSON（沿用你的重試/timeout邏輯的精簡版）
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

// 飛到指定點
function FlyToOnPoint({
  target,
  minZoom = 14,
  duration = 0.8,
}: {
  target: { lat: number; lon: number } | null;
  minZoom?: number;
  duration?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const z = Math.max(map.getZoom(), minZoom);
    map.flyTo([target.lat, target.lon], z, { duration });
  }, [target, map, minZoom, duration]);
  return null;
}

// Elevation 對應：找最近索引
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

// Map ↔ Elevation 互動
function MapEventsBridge({
  onPickIndex,
  onHoverIndex,
  elevPts,
}: {
  onPickIndex: (idx: number | null) => void;
  onHoverIndex: (idx: number | null) => void;
  elevPts: ElevPoint[];
}) {
  const rafRef = useRef<number | null>(null);
  const lastIdxRef = useRef<number | null>(null);

  useMapEvents({
    mousemove(e) {
      const { lat, lng } = e.latlng;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const idx = nearestElevIndex(elevPts, lat, lng);
        if (idx !== lastIdxRef.current) {
          lastIdxRef.current = idx;
          onHoverIndex(idx);
        }
      });
    },
    mouseout() {
      lastIdxRef.current = null;
      onHoverIndex(null);
    },
    click(e) {
      const { lat, lng } = e.latlng;
      onPickIndex(nearestElevIndex(elevPts, lat, lng));
    },
  });

  return null;
}

function MapCenterTracker({ onChange }: { onChange: (c: { lat: number; lon: number }) => void }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      onChange({ lat: c.lat, lon: c.lng });
    },
  });
  return null;
}

// 地圖點選模式（start / end / waypoint）
function MapClickPicker({
  mode,
  onDone,
  onPick,
}: {
  mode: "none" | "start" | "end" | "waypoint";
  onDone: () => void;
  onPick: (role: "start" | "end" | "waypoint", lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (mode === "none") return;
      const { lat, lng } = e.latlng;
      onPick(mode, lat, lng);
      onDone();
    },
  });
  return null;
}

export default function MapView() {
  // === 狀態 ===
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);
  const [elevPts, setElevPts] = useState<ElevPoint[]>([]);
  const [segmentMeters, setSegmentMeters] = useState<number>(500);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({
    lat: 25.05,
    lon: 121.52,
  });
  const [webcamFlyTarget, setWebcamFlyTarget] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [webcams, setWebcams] = useState<WebcamItem[]>([]);

  // 起訖（[lon,lat]）
  const [startLonLat, setStartLonLat] = useState<[number, number] | null>(null);
  const [endLonLat, setEndLonLat] = useState<[number, number] | null>(null);
  // 多點（中繼點，皆為 [lon,lat]）
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);

  // 地圖點選模式
  const [pickMode, setPickMode] = useState<"none" | "start" | "end" | "waypoint">("none");

  // 面板互動
  const [cursorPt, setCursorPt] = useState<{ lat: number; lon: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [panelHoverIdx, setPanelHoverIdx] = useState<number | null>(null);

  // show/hide panels
  const [showWebcams, setShowWebcams] = useState(true);
  const [showSegments, setShowSegments] = useState(true);
  const [showElevation, setShowElevation] = useState(true);

  const focusPt = useMemo(() => {
    if (focusIdx == null || !elevPts[focusIdx]) return null;
    const p = elevPts[focusIdx];
    return typeof p.lat === "number" && typeof p.lon === "number" ? { lat: p.lat, lon: p.lon } : null;
  }, [focusIdx, elevPts]);

  // === URL 讀/寫 ===
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

  const writeQuery = (start: [number, number] | null, end: [number, number] | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    const fmt = (p: [number, number]) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`; // lat,lon
    start ? sp.set("start", fmt(start)) : sp.delete("start");
    end ? sp.set("end", fmt(end)) : sp.delete("end");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  // 取得單一「兩點間」的 ORS 路徑（相容你現有 /api/route：只吃 {start,end}）
  async function fetchLegCoords(
    a: [number, number],
    b: [number, number]
  ): Promise<[number, number][]> {
    const r = await fetchJSON<OrsAPIResponse | OrsAPIResponseFeature>("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 仍然用 {start, end}，不改你的 API 介面
      body: JSON.stringify({ start: a, end: b, profile: "cycling-regular" }),
      timeoutMs: 45000,
    });
    const coordsRaw =
      (r as OrsAPIResponseFeature)?.features?.[0]?.geometry?.coordinates ??
      (r as OrsAPIResponse)?.geometry?.coordinates ??
      [];
    // 過濾奇怪點位
    return coordsRaw.filter(([lon, lat]) => isValidCoordinate(lat, lon));
  }

  // 多點規劃：把 [start, ...waypoints, end] 拆成多個 legs 逐段呼叫並合併
  const planRouteMulti = async (points: [number, number][]) => {
    try {
      if (points.length < 2) return;

      // 合併所有 legs 幾何
      const merged: [number, number][] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const leg = await fetchLegCoords(points[i], points[i + 1]);
        if (!leg.length) continue;
        if (merged.length) {
          // 移除重複接點
          merged.push(...leg.slice(1));
        } else {
          merged.push(...leg);
        }
      }
      if (merged.length < 2) {
        console.warn("No valid merged coordinates");
        setRoute([]);
        setWinds([]);
        setElevPts([]);
        return;
      }

      // 設定 route（轉為 [lat,lon]）
      const line: [number, number][] = merged.map(([lon, lat]) => [lat, lon]);
      setRoute(line);

      // 風：抽樣 ~40 點
      const step = Math.max(1, Math.floor(merged.length / 40));
      const sample = merged.filter((_, i) => i % step === 0).map(([lon, lat]) => [lat, lon]);
      const last = merged[merged.length - 1];
      const lastS = sample[sample.length - 1];
      if (!lastS || lastS[0] !== last[1] || lastS[1] !== last[0]) {
        sample.push([last[1], last[0]]);
      }
      try {
        const windData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: sample }),
          timeoutMs: 30000,
        });
        setWinds(Array.isArray(windData.points) ? windData.points : []);
      } catch {
        setWinds([]);
      }

      // 高程（~300m 間距）
      try {
        const elevData = await fetchJSON<{ points: ElevPoint[] }>("/api/elevation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coords: merged, intervalMeters: 300, dataset: "srtm90m" }),
          timeoutMs: 30000,
        });
        setElevPts(Array.isArray(elevData.points) ? elevData.points : []);
      } catch {
        setElevPts([]);
      }

      // 視野置中
      const mid = line[Math.floor(line.length / 2)];
      if (mid) setMapCenter({ lat: mid[0], lon: mid[1] });

      // 清掉互動狀態
      setCursorPt(null);
      setFocusIdx(null);
      setPanelHoverIdx(null);
    } catch (e) {
      console.error("Route plan failed", e);
    }
  };

  // 只要起訖都有就規劃；waypoints 變更也會更新
  useEffect(() => {
    if (startLonLat && endLonLat) {
      const all: [number, number][] = [startLonLat, ...waypoints, endLonLat];
      void planRouteMulti(all);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLonLat, endLonLat, JSON.stringify(waypoints)]);

  const centerPos = useMemo<[number, number]>(() => [mapCenter.lat, mapCenter.lon], [mapCenter]);

  // 右上搜尋卡片：Find route（若只輸入文字）
  const handleSubmit = async (startText: string, endText: string) => {
    const geocodeOne = async (q: string) => {
      if (!q.trim()) return null;
      const p = new URLSearchParams({
        q,
        limit: "1",
        lang: "zh-TW",
        "boundary.country": "TW",
        "focus.lat": String(mapCenter.lat),
        "focus.lon": String(mapCenter.lon),
      });
      const r = await fetch(`/api/geocode?${p.toString()}`, { cache: "no-store" });
      if (!r.ok) return null;
      const j = (await r.json()) as { items?: Array<{ lat: number; lon: number }> };
      const it = j.items?.[0];
      return it ? ([it.lon, it.lat] as [number, number]) : null; // [lon,lat]
    };

    const s = startLonLat ?? (await geocodeOne(startText));
    const e = endLonLat ?? (await geocodeOne(endText));
    if (!s || !e) return;
    setStartLonLat(s);
    setEndLonLat(e);
    writeQuery(s, e);
    void planRouteMulti([s, ...waypoints, e]);
  };

  // 清除路線
  const handleClearRoute = () => {
    setStartLonLat(null);
    setEndLonLat(null);
    setWaypoints([]);
    setRoute([]);
    setWinds([]);
    setElevPts([]);
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {/* 左上：Webcams 側欄 */}
      <div style={{ position: "absolute", left: 50, top: 12, zIndex: 1400 }}>
        {showWebcams ? (
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: 6,
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
            >
              <span style={{ fontWeight: 600 }}>Webcams</span>
              <button onClick={() => setShowWebcams(false)} style={{ fontSize: 12 }}>
                ✖
              </button>
            </div>
            <WebcamsPanel
              center={mapCenter}
              onPick={(lat, lon) => {
                setFocusIdx(null);
                setWebcamFlyTarget({ lat, lon });
              }}
              onLoaded={setWebcams}
            />
          </div>
        ) : (
          <button onClick={() => setShowWebcams(true)} style={{ fontSize: 12, padding: "2px 6px" }}>
            Show Webcams
          </button>
        )}
      </div>

      {/* 右上：Route search（含地圖點選工具列 + Clear） */}
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 1300, width: 300 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 10,
            boxShadow: "0 6px 16px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Route search</div>
          <GeocodeSearch
            center={mapCenter}
            onPick={(role: Role, lat: number, lon: number) => {
              const v: [number, number] = [lon, lat];
              if (role === "start") {
                setStartLonLat(v);
                writeQuery(v, endLonLat);
              } else {
                setEndLonLat(v);
                writeQuery(startLonLat, v);
              }
            }}
            onSubmit={handleSubmit}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setPickMode((m) => (m === "start" ? "none" : "start"))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: pickMode === "start" ? "#e0f2fe" : "#fff",
              }}
              title="Click on map to set START"
            >
              Pick Start on map
            </button>
            <button
              onClick={() => setPickMode((m) => (m === "end" ? "none" : "end"))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: pickMode === "end" ? "#fee2e2" : "#fff",
              }}
              title="Click on map to set END"
            >
              Pick End on map
            </button>
            <button
              onClick={() => setPickMode((m) => (m === "waypoint" ? "none" : "waypoint"))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: pickMode === "waypoint" ? "#dcfce7" : "#fff",
              }}
              title="Click on map to add waypoint"
            >
              Add Waypoint on map
            </button>
            <button
              onClick={handleClearRoute}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: "#fee2e2",
              }}
              title="Clear route"
            >
              Clear route
            </button>
          </div>

          {/* 簡易顯示 waypoints 數量 */}
          {waypoints.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
              Waypoints: {waypoints.length}
            </div>
          )}
        </div>
      </div>

      <MapContainer center={centerPos} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapCenterTracker onChange={setMapCenter} />

        {/* 地圖點選（起 / 訖 / waypoint） */}
        <MapClickPicker
          mode={pickMode}
          onDone={() => setPickMode("none")}
          onPick={(role, lat, lon) => {
            const v: [number, number] = [lon, lat];
            if (role === "start") {
              setStartLonLat(v);
              writeQuery(v, endLonLat);
            } else if (role === "end") {
              setEndLonLat(v);
              writeQuery(startLonLat, v);
            } else {
              setWaypoints((prev) => [...prev, v]);
            }
            // 若起訖都存在 → 規劃
            const s = role === "start" ? v : startLonLat;
            const e = role === "end" ? v : endLonLat;
            const wps = role === "waypoint" ? [...waypoints, v] : waypoints;
            if (s && e) void planRouteMulti([s, ...wps, e]);
          }}
        />

        {/* 起訖 marker */}
        {startLonLat && (
          <Marker position={[startLonLat[1], startLonLat[0]]}>
            <Popup>Start</Popup>
          </Marker>
        )}
        {endLonLat && (
          <Marker position={[endLonLat[1], endLonLat[0]]}>
            <Popup>End</Popup>
          </Marker>
        )}

        {/* Waypoints 標記 */}
        {waypoints.map(([lon, lat], i) => (
          <Marker key={`wp-${i}`} position={[lat, lon]}>
            <Popup>Waypoint {i + 1}</Popup>
          </Marker>
        ))}

        {/* Webcams markers（恢復顯示） */}
        {webcams.map((w, i) => (
          <CircleMarker
            key={`cam-${w.id || i}-${w.lat.toFixed(5)}-${w.lon.toFixed(5)}`}
            center={[w.lat, w.lon]}
            radius={5}
            pathOptions={{ color: "#051e41ff", weight: 2, fillColor: "#1265daff", fillOpacity: 0.9 }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 600 }}>{w.title || "Webcam"}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  {w.city || w.region || w.country || "—"}
                </div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
                  {(w.distance / 1000).toFixed(1)} km away
                </div>
                <div style={{ marginTop: 6 }}>
                  <a href={w.detailUrl} target="_blank" rel="noreferrer">
                    View on Windy
                  </a>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Map ↔ Elevation 互動 */}
        <MapEventsBridge
          elevPts={elevPts}
          onPickIndex={(idx) => {
            if (typeof idx === "number") setFocusIdx((p) => (p === idx ? p : idx));
          }}
          onHoverIndex={(idx) => {
            setPanelHoverIdx((p) => (p === idx ? p : idx));
          }}
        />

        {/* 分段上色路線 */}
        {route.length > 0 && (
          <RouteWindLayer route={route} winds={winds} weight={6} segmentMeters={segmentMeters} />
        )}

        {/* 外部 hover/selected 的地圖高亮 */}
        {cursorPt && (
          <CircleMarker
            center={[cursorPt.lat, cursorPt.lon]}
            radius={6}
            pathOptions={{ color: "#6366f1", weight: 2, fillColor: "#a5b4fc", fillOpacity: 0.8 }}
          />
        )}
        {focusPt && (
          <CircleMarker
            center={[focusPt.lat, focusPt.lon]}
            radius={7}
            pathOptions={{ color: "#1d4ed8", weight: 3, fillColor: "#60a5fa", fillOpacity: 0.9 }}
          />
        )}

        {/* 飛到選中點 / webcam 目標 */}
        <FlyToOnPoint target={focusPt} minZoom={14} duration={0.8} />
        <FlyToOnPoint target={webcamFlyTarget} minZoom={14} duration={0.8} />
      </MapContainer>

      {/* 右上：分段長度（略往下，避免與搜尋卡片重疊） */}
      <div style={{ position: "absolute", right: 12, top: 12 + 300, zIndex: 1200 }}>
        {showSegments ? (
          <div
            style={{
              background: "white",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: 6,
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
            >
              <span style={{ fontWeight: 600 }}>Segments</span>
              <button onClick={() => setShowSegments(false)} style={{ fontSize: 12 }}>
                ✖
              </button>
            </div>
            <SegmentationControls value={segmentMeters} onChange={setSegmentMeters} />
          </div>
        ) : (
          <button onClick={() => setShowSegments(true)} style={{ fontSize: 12, padding: "2px 6px" }}>
            Show Segments
          </button>
        )}
      </div>

      {/* 右下：風速圖例 */}
      <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 1200 }}>
        <WindLegend />
      </div>

      {/* 左下：坡面圖 */}
      <div style={{ position: "absolute", left: 65, bottom: 12, zIndex: 1200 }}>
        {showElevation ? (
          <div
            style={{
              background: "white",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: 6,
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
            >
              <span style={{ fontWeight: 600 }}>Elevation</span>
              <button onClick={() => setShowElevation(false)} style={{ fontSize: 12 }}>
                ✖
              </button>
            </div>
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
          </div>
        ) : (
          <button onClick={() => setShowElevation(true)} style={{ fontSize: 12, padding: "2px 6px" }}>
            Show Elevation
          </button>
        )}
      </div>
    </div>
  );
}
