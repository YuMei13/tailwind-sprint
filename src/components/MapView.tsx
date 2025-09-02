"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import { downsampleLonLat } from "@/lib/sampling";
import { degToCompass, windToColor } from "@/lib/wind";
import WindLegend from "@/components/WindLegend";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";


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
  distance?: number;
  duration?: number;
  bbox?: [number, number, number, number];
};

// type WindPoint = { lat: number; lon: number; speedKmh?: number; dirDeg?: number; error?: true; msg?: string };
type WindPoint = WindPointType;
type WindAPIResponse = { points?: WindPoint[] };

export default function MapView() {
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        // 1) 取路線
        const r = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: [121.517, 25.047], // [lon,lat]
            end:   [121.510, 25.057], // [lon,lat]
          }),
        });

        if (!r.ok) {
          console.error("Route API failed:", await r.text());
          return;
        }

        const data = (await r.json()) as unknown as OrsAPIResponse;
        const coords = data?.geometry?.coordinates;

        if (!Array.isArray(coords) || coords.length < 2) {
          console.error("Route geometry missing");
          return;
        }

        // 轉 [lon,lat] -> [lat,lon] 給 Leaflet
        const line: LineLatLng = coords.map(
          ([lon, lat]: [number, number]) => [lat, lon] as LatLng
        );
        setRoute(line);

        // 2) 抽樣：在 ORS 原始 [lon,lat] 上抽樣，每 40 點取 1，最後一點保留
        const sampleLatLon: LatLng[] = downsampleLonLat(coords, 40);

        // 3) 查風
        const w = await fetch("/api/wind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: sampleLatLon }),
        });

        if (!w.ok) {
          console.error("Wind API failed:", await w.text());
          return;
        }

        const wr = (await w.json()) as unknown;

        // 型別守衛
        const points: WindPoint[] =
          typeof wr === "object" && wr !== null && Array.isArray((wr as WindAPIResponse).points)
            ? ((wr as WindAPIResponse).points as WindPoint[])
            : [];

        setWinds(points);
      } catch (e) {
        console.error("MapView run() error:", e);
      }
    };

    run();
  }, []);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
        <MapContainer center={[25.05, 121.52]} zoom={14} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* {route.length > 0 && (
            <Polyline positions={route} pathOptions={{ color: "blue", weight: 5 }} />
        )} */}
        {route.length > 0 && (
        <RouteWindLayer route={route} winds={winds} weight={6} />
            )}

        {winds.map((p, idx) => {
            const pos: LatLng = [p.lat, p.lon];
            const speedMS = typeof p.speedKmh === "number" ? p.speedKmh / 3.6 : undefined;
            const color = typeof speedMS === "number" ? windToColor(speedMS) : "#6b7280";
            const dir = typeof p.dirDeg === "number" ? degToCompass(p.dirDeg) : "—";

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
                        <div>Dir: {dir}</div>
                        <div
                        style={{
                            display: "inline-block",
                            padding: "2px 6px",
                            borderRadius: 6,
                            background: color,
                            color: "#fff",
                        }}
                        >
                        intensity
                        </div>
                    </>
                    )}
                </div>
                </Popup>
            </Marker>
            );
        })}
        </MapContainer>
        <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 1200 }}>
        <WindLegend />
        </div>
    </div>
  );
}
