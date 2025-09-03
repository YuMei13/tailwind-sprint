"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";
import WindLegend from "@/components/WindLegend";
import ElevationPanel, { ElevPt } from "@/components/ElevationPanel";
import SegmentationControls from "@/components/SegmentationControls";

// Leaflet marker 圖示
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type LatLng = [number, number]; // [lat, lon]
type LineLatLng = LatLng[];

type OrsAPIResponse = {
  geometry: { type: "LineString"; coordinates: [number, number][] }; // [lon, lat][]
};

type WindPoint = WindPointType;
type ElevPoint = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };

// --- fetchJSON（略同前） ---
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
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Timeout");
      }
      if (err instanceof Error) throw err;
      throw new Error("Unknown fetch error");
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

// --- 飛行到指定點
function FlyToOnPoint({ target, minZoom = 15, duration = 0.8 }: {
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

// --- 最近 elevation 點索引（簡單平方距離）
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

// --- 地圖事件：click → focus，mousemove → external hover，mouseout → 清除
function MapEventsBridge({
  onPickIndex,
  onHoverIndex,
}: {
  onPickIndex: (idx: number | null) => void;
  onHoverIndex: (idx: number | null) => void;
}) {
  const elevPtsRef = useRef<ElevPoint[]>([]);
  // 用 window 事件或 props 傳遞會更乾淨；這裡我們在父層用閉包注入
  // 父層會透過 set 函式更新這個 ref
  // 為了簡潔，這個元件會在父層 render 裡以最新 elevPts 重新建立

  // rAF 節流（避免 mousemove 太頻繁）
  const rafRef = useRef<number | null>(null);
  const lastIdxRef = useRef<number | null>(null);

  const map = useMapEvents({
    mousemove(e) {
      const { lat, lng } = e.latlng;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const idx = nearestElevIndex(elevPtsRef.current, lat, lng);
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
      const idx = nearestElevIndex(elevPtsRef.current, lat, lng);
      onPickIndex(idx);
    },
  });

  // 把當前地圖的 elevation 點來源放進 ref（父層每次 render 會重建 bridge，這裡安全）
  // @ts-expect-error private patch by parent before render
  map.__setElevSource = (pts: ElevPoint[]) => { elevPtsRef.current = pts; };

  return null;
}

export default function MapView() {
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);
  const [elevPts, setElevPts] = useState<ElevPoint[]>([]);
  const [segmentMeters, setSegmentMeters] = useState<number>(500);

  // 面板顯示：滑過坡面圖 → 地圖淡紫游標
  const [cursorPt, setCursorPt] = useState<{ lat: number; lon: number } | null>(null);

  // 雙向選中：focus（深藍，flyTo）
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const focusPt = useMemo(() => {
    if (focusIdx == null || !elevPts[focusIdx]) return null;
    const p = elevPts[focusIdx];
    return typeof p.lat === "number" && typeof p.lon === "number" ? { lat: p.lat, lon: p.lon } : null;
  }, [focusIdx, elevPts]);

  // 地圖滑動 → 面板外部 hover
  const [panelHoverIdx, setPanelHoverIdx] = useState<number | null>(null);

  // 載入資料
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // 1) Route
        const routeData = await fetchJSON<OrsAPIResponse>("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: [121.517, 25.047], end: [121.510, 25.057] }),
          timeoutMs: 45000,
        });
        if (cancelled) return;
        const coords = routeData?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const line: LineLatLng = coords.map(([lon, lat]) => [lat, lon]);
        setRoute(line);

        // 2) 風（約 40 點）
        const sample: LatLng[] = [];
        const step = Math.max(1, Math.floor(coords.length / 40));
        for (let i = 0; i < coords.length; i += step) {
          const [lon, lat] = coords[i];
          sample.push([lat, lon]);
        }
        const [lonLast, latLast] = coords[coords.length - 1];
        const last = sample[sample.length - 1];
        if (!last || last[0] !== latLast || last[1] !== lonLast) sample.push([latLast, lonLast]);

        try {
          const windData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: sample }),
            timeoutMs: 30000,
          });
          if (!cancelled) setWinds(Array.isArray(windData.points) ? windData.points : []);
        } catch {
          if (!cancelled) setWinds([]);
        }

        // 3) 海拔（距離抽樣 ~300m）
        try {
          const elevData = await fetchJSON<{ points: ElevPoint[] }>("/api/elevation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coords, intervalMeters: 300, dataset: "srtm90m" }),
            timeoutMs: 30000,
          });
          if (!cancelled) setElevPts(Array.isArray(elevData.points) ? elevData.points : []);
        } catch {
          if (!cancelled) setElevPts([]);
        }
      } catch (e) {
        console.warn("MapView init error:", e);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer center={[25.05, 121.52]} zoom={14} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* 地圖事件：mousemove → external hover；click → focus */}
        <MapEventsBridge
          onPickIndex={(idx) => {
            if (typeof idx === "number") setFocusIdx((prev) => (prev === idx ? prev : idx));
          }}
          onHoverIndex={(idx) => {
            setPanelHoverIdx((prev) => (prev === idx ? prev : idx));
          }}
        />
        {/* 把 elevation 點源塞進橋接（利用 map 上的暫存欄位） */}
        {/* @ts-expect-error: private helper set by MapEventsBridge */}
        <FlyToOnPoint target={null} />
        {/* 上面 FlyToOnPoint 只是保證 useMap 可用；真正將 elevPts 塞進 MapEventsBridge： */}
        {/* 這段小 hack：在下一個 tick，把 elevPts 寫到 map.__setElevSource */}
        <MapHackSyncElevSource elevPts={elevPts} />

        {route.length > 0 && (
          <RouteWindLayer route={route} winds={winds} weight={6} segmentMeters={segmentMeters} />
        )}

        {/* 風資訊 Marker（可保留觀察） */}
        {winds.map((p, idx) => {
          const pos: LatLng = [p.lat, p.lon];
          const speedMS = typeof p.speedKmh === "number" ? p.speedKmh / 3.6 : undefined;
          return (
            <Marker position={pos} key={`${p.lat},${p.lon}-${idx}`}>
              <Popup>
                <div style={{ minWidth: 140 }}>
                  <div><strong>Wind</strong></div>
                  {p.error ? (
                    <div>—</div>
                  ) : (
                    <>
                      <div>Speed: {speedMS?.toFixed(1) ?? "—"} m/s</div>
                      <div>Dir: {p.dirDeg ?? "—"}°</div>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 滑過游標（來自面板 hover 的淡紫圈） */}
        {cursorPt && (
          <CircleMarker
            center={[cursorPt.lat, cursorPt.lon]}
            radius={6}
            pathOptions={{ color: "#6366f1", weight: 2, fillColor: "#a5b4fc", fillOpacity: 0.8 }}
          />
        )}

        {/* 點擊/選中（藍色） */}
        {focusPt && (
          <CircleMarker
            center={[focusPt.lat, focusPt.lon]}
            radius={7}
            pathOptions={{ color: "#1d4ed8", weight: 3, fillColor: "#60a5fa", fillOpacity: 0.9 }}
          />
        )}

        {/* 導航到選中點 */}
        <FlyToOnPoint target={focusPt} minZoom={15} duration={0.8} />
      </MapContainer>

      {/* 右上角：分段長度切換 */}
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 1200 }}>
        <SegmentationControls value={segmentMeters} onChange={setSegmentMeters} />
      </div>

      {/* 右下角：風速圖例 */}
      <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 1200 }}>
        <WindLegend />
      </div>

      {/* 左下角：坡面圖（外部 hover + 外部選中 + 面板互動） */}
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 1200 }}>
        <ElevationPanel
          points={elevPts as ElevPt[]}
          selectedIndex={focusIdx}
          externalHoverIndex={panelHoverIdx}
          onHover={(pt) => {
            if (pt && typeof pt.lat === "number" && typeof pt.lon === "number") {
              setCursorPt({ lat: pt.lat, lon: pt.lon }); // 面板 hover → 地圖淡紫游標
            } else {
              setCursorPt(null);
            }
          }}
          onLeave={() => setCursorPt(null)}
          onClick={(_, idx) => {
            if (typeof idx === "number") {
              setFocusIdx((prev) => (prev === idx ? prev : idx)); // 面板點擊 → focus & flyTo
            }
          }}
        />
      </div>
    </div>
  );
}

// 小工具：把 elevPts 寫入 MapEventsBridge 的來源 ref
function MapHackSyncElevSource({ elevPts }: { elevPts: ElevPoint[] }) {
  const map = useMap();
  useEffect(() => {
    // @ts-expect-error private helper set by MapEventsBridge
    if (typeof map.__setElevSource === "function") {
      // 下一個 macrotask 再設定，確保 bridge 已掛上
      setTimeout(() => {
        // @ts-expect-error
        map.__setElevSource(elevPts);
      }, 0);
    }
  }, [map, elevPts]);
  return null;
}
