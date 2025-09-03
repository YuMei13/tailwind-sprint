"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";
import WindLegend from "@/components/WindLegend";
import ElevationPanel from "@/components/ElevationPanel";
import SegmentationControls from "@/components/SegmentationControls";

// 修正 Leaflet 預設 marker 圖示在 Next 環境的載入
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

// --- fetchJSON: 帶 timeout + retry + 絕對 URL（dev 預設 45s） ---
function absUrl(path: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return path.startsWith("http") ? path : `${base}${path}`;
}

const DEFAULT_TIMEOUT =
  process.env.NODE_ENV === "development" ? 45000 : 10000; // dev 45s, prod 10s
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
      // 把 AbortError 視為逾時可重試（不使用 any）
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Timeout");
      }
      if (err instanceof Error) {
        throw err;
      }
      throw new Error("Unknown fetch error");
    } finally {
      clearTimeout(t);
    }
  };

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await once();
    } catch (e) {
      // 最後一次才往外丟；其餘重試（400ms, 800ms, 1200ms, 1600ms）
      if (i === MAX_RETRIES - 1) throw e as Error;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

export default function MapView() {
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);
  const [elevPts, setElevPts] = useState<ElevPoint[]>([]);
  const [segmentMeters, setSegmentMeters] = useState<number>(500);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // 1) Route（第一次編譯可能久 → 明確給 45s）
        const routeData = await fetchJSON<OrsAPIResponse>("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: [121.517, 25.047], // [lon,lat]
            end:   [121.510, 25.057], // [lon,lat]
          }),
          timeoutMs: 45000,
        });
        if (cancelled) return;

        const coords = routeData?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
          console.warn("Route geometry missing");
          return;
        }
        const line: LineLatLng = coords.map(([lon, lat]) => [lat, lon]);
        setRoute(line);

        // 2) Wind sample（約 40 點，含尾點）
        const sample: LatLng[] = [];
        const step = Math.max(1, Math.floor(coords.length / 40));
        for (let i = 0; i < coords.length; i += step) {
          const [lon, lat] = coords[i];
          sample.push([lat, lon]);
        }
        const [lonLast, latLast] = coords[coords.length - 1];
        const last = sample[sample.length - 1];
        if (!last || last[0] !== latLast || last[1] !== lonLast) {
          sample.push([latLast, lonLast]);
        }

        // 3) Wind（拉長逾時到 30s）
        try {
          const windData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: sample }),
            timeoutMs: 30000,
          });
          if (!cancelled) setWinds(Array.isArray(windData.points) ? windData.points : []);
        } catch (e) {
          console.warn("Wind API timeout or error:", e);
          if (!cancelled) setWinds([]);
        }

        // 4) Elevation（也給 30s；intervalMeters 200 → 300 減少負載也更快）
        try {
          const elevData = await fetchJSON<{ points: ElevPoint[] }>("/api/elevation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coords, intervalMeters: 300, dataset: "srtm90m" }),
            timeoutMs: 30000,
          });
          if (!cancelled) setElevPts(Array.isArray(elevData.points) ? elevData.points : []);
        } catch (e) {
          console.warn("Elevation API timeout or error:", e);
          if (!cancelled) setElevPts([]);
        }
      } catch (e) {
        // 只在真正不可恢復時才 error；逾時類型用 warn
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Timeout")) {
          console.warn("Route API timeout:", msg);
        } else {
          console.error("MapView run() error:", e);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 1200 }}>
      <SegmentationControls value={segmentMeters} onChange={setSegmentMeters} />
      </div>
      <MapContainer center={[25.05, 121.52]} zoom={14} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {route.length > 0 && <RouteWindLayer route={route} winds={winds} weight={6} segmentMeters={segmentMeters} />}

        {/* Marker / Popup 顯示風資訊（可保留做觀察） */}
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
      </MapContainer>

      {/* 右下角：風速圖例 */}
      <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 1200 }}>
        <WindLegend />
      </div>

      {/* 左下角：坡面圖 */}
      <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 1200 }}>
        <ElevationPanel points={elevPts} />
      </div>
    </div>
  );
}
