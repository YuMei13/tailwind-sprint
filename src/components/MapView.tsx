"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";
import WindLegend from "@/components/WindLegend";
import ElevationPanel, { ElevPt } from "@/components/ElevationPanel";
import SegmentationControls from "@/components/SegmentationControls";
import WebcamsPanel, { WebcamItem } from "@/components/WebcamsPanel";

// import GeocodeSearch from "@/components/GeocodeSearch";

// Leaflet 預設 marker 圖示
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

// --- fetchJSON ---
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
      if (err instanceof DOMException && err.name === "AbortError") throw new Error("Timeout");
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

// --- 飛到指定點
function FlyToOnPoint({ target, minZoom = 14, duration = 0.8 }: {
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

// --- 最近 elevation 點索引
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
      const idx = nearestElevIndex(elevPts, lat, lng);
      onPickIndex(idx);
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


export default function MapView() {
  // === 狀態 ===
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);
  const [elevPts, setElevPts] = useState<ElevPoint[]>([]);
  const [segmentMeters, setSegmentMeters] = useState<number>(500);
  // const [webcams, setWebcams] = useState<Array<{ lat: number; lon: number; title: string }>>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({ lat: 25.05, lon: 121.52 });
  const [webcamFlyTarget, setWebcamFlyTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [webcams, setWebcams] = useState<WebcamItem[]>([]); // ← 接住側欄載到的清單，用來畫 marker

  useEffect(() => {
  if (route.length >= 2) {
    const mid = route[Math.floor(route.length / 2)];
    setMapCenter({ lat: mid[0], lon: mid[1] });
  }
  }, [route]);
  
  // const handleWebcamPick = (lat: number, lon: number) => {
  // // 選到某個 webcam → 不影響坡面圖 focus
  // setFocusIdx(null);
  // // 讓 FlyToOnPoint 負責飛行
  // setWebcamFlyTarget({ lat, lon });
  // };

  // 查詢框 → 選擇的起訖點（[lon,lat]）
  // const [startLonLat, setStartLonLat] = useState<[number, number] | null>(null);
  const [startLonLat] = useState<[number, number] | null>(null);
  // const [endLonLat, setEndLonLat] = useState<[number, number] | null>(null);
  const [endLonLat] = useState<[number, number] | null>(null);

  // 面板互動（游標、選中）
  const [cursorPt, setCursorPt] = useState<{ lat: number; lon: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [panelHoverIdx, setPanelHoverIdx] = useState<number | null>(null);

  const focusPt = useMemo(() => {
    if (focusIdx == null || !elevPts[focusIdx]) return null;
    const p = elevPts[focusIdx];
    return typeof p.lat === "number" && typeof p.lon === "number" ? { lat: p.lat, lon: p.lon } : null;
  }, [focusIdx, elevPts]);

  // === 載入或重新規劃路線 ===
  useEffect(() => {
    let cancelled = false;

    async function planAndFetch() {
      try {
        // 1) 若未選擇，就給一組預設（台北車站→大稻埕）
        const start = startLonLat ?? ([121.517, 25.047] as [number, number]);
        const end = endLonLat ?? ([121.510, 25.057] as [number, number]);

        // 2) route
        const routeData = await fetchJSON<OrsAPIResponse>("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start, end }),
          timeoutMs: 45000,
        });
        if (cancelled) return;

        const coords = routeData?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;

        const line: LineLatLng = coords.map(([lon, lat]) => [lat, lon]);
        setRoute(line);

        // 3) 風（約 40 點）
        const sample: [number, number][] = [];
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

        // 4) elevation（距離抽樣 ~300m）
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

        // 規劃完成後，清掉舊的游標/選中狀態
        setCursorPt(null);
        setFocusIdx(null);
        setPanelHoverIdx(null);
      } catch (e) {
        console.warn("Plan route failed:", e);
      }
    }

    planAndFetch();
    return () => {
      cancelled = true;
    };
  }, [startLonLat, endLonLat]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 1300 }}>
        <WebcamsPanel
          center={mapCenter}
          onPick={(lat, lon) => {
            // 在面板點 FlyTo → 地圖飛去；同時在地圖上高亮
            setFocusIdx(null); // 不影響坡面圖 focus
            // 直接用 Leaflet 控制：交由 FlyToOnPoint
            // 我們另外用一個 state 來驅動飛行（避免覆用 elevation 的 focus）
            setWebcamFlyTarget({ lat, lon });
          }}
          onLoaded={setWebcams}
        />
      </div>
      <MapContainer
        center={[mapCenter.lat, mapCenter.lon]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapCenterTracker onChange={setMapCenter} />
        {webcams.map((w, i) => (
          <CircleMarker
            key={`cam-${w.id || i}-${w.lat.toFixed(5)}-${w.lon.toFixed(5)}`}
            center={[w.lat, w.lon]}
            radius={5}
            pathOptions={{ color: "#64748b", weight: 2, fillColor: "#94a3b8", fillOpacity: 0.9 }}
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


 
        {/* 地圖事件：mousemove → external hover；click → focus */}
        <MapEventsBridge
          elevPts={elevPts}
          onPickIndex={(idx) => {
            if (typeof idx === "number") setFocusIdx((prev) => (prev === idx ? prev : idx));
          }}
          onHoverIndex={(idx) => {
            setPanelHoverIdx((prev) => (prev === idx ? prev : idx));
          }}
        />

        {/* 分段上色的路線 */}
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

        {/* 面板 hover → 地圖淡紫游標 */}
        {cursorPt && (
          <CircleMarker
            center={[cursorPt.lat, cursorPt.lon]}
            radius={6}
            pathOptions={{ color: "#6366f1", weight: 2, fillColor: "#a5b4fc", fillOpacity: 0.8 }}
          />
        )}

        {/* 點擊/選中（地圖或面板）→ 藍色圈 */}
        {focusPt && (
          <CircleMarker
            center={[focusPt.lat, focusPt.lon]}
            radius={7}
            pathOptions={{ color: "#1d4ed8", weight: 3, fillColor: "#60a5fa", fillOpacity: 0.9 }}
          />
        )}

        {/* 飛到選中點 */}
        <FlyToOnPoint target={focusPt} minZoom={14} duration={0.8} />
        <FlyToOnPoint target={webcamFlyTarget} minZoom={14} duration={0.8} />
      </MapContainer>

      {/* 右上角：分段長度切換 */}
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 1200 }}>
        <SegmentationControls value={segmentMeters} onChange={setSegmentMeters} />
      </div>

      {/* 左上角：查詢框（起訖點 → 規劃路線） */}
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 1200 }}>
        {/* <GeocodeSearch
          onApply={(s, e) => {
            setStartLonLat(s);
            setEndLonLat(e);
          }}
        /> */}
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
              setCursorPt({ lat: pt.lat, lon: pt.lon });
            } else {
              setCursorPt(null);
            }
          }}
          onLeave={() => setCursorPt(null)}
          onClick={(_, idx) => {
            if (typeof idx === "number") setFocusIdx((prev) => (prev === idx ? prev : idx));
          }}
        />
      </div>
    </div>
  );
}
