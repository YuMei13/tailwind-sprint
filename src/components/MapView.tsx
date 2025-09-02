"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import { downsampleLonLat } from "@/lib/sampling";
import { degToCompass, windToColor } from "@/lib/wind";

type Line = [number, number][];
type OrsResp = { geometry: { coordinates: number[][] } };
type WindPoint = { lat: number; lon: number; speedKmh?: number; dirDeg?: number; error?: true };

delete (L.Icon.Default as any).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

export default function MapView() {
  const [route, setRoute] = useState<Line>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        // 1) route
        const r = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: [121.517, 25.047],
            end: [121.510, 25.057],
          }),
        });

        if (!r.ok) {
          console.error("Route API failed:", await r.text());
          return; // 不畫線，但頁面不崩
        }
        const data = await r.json();
        const coords: number[][] | undefined = data?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
          console.error("Route geometry missing");
          return;
        }

        const line = coords.map(([lon, lat]) => [lat, lon]) as [number, number][];
        setRoute(line);

        // 2) sampling
        const sampleLatLon = downsampleLonLat(coords, 40);

        // 3) wind
        const w = await fetch("/api/wind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: sampleLatLon }),
        });
        if (!w.ok) {
          console.error("Wind API failed:", await w.text());
          return;
        }
        const wr = (await w.json()) as { points?: any[] };
        setWinds(Array.isArray(wr.points) ? wr.points : []);
      } catch (e) {
        console.error("MapView run() error:", e);
      }
    };
    run();
  }, []); 

  return (
    <MapContainer center={[25.05, 121.52]} zoom={14} style={{ height: "100%", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {route.length > 0 && (
        <Polyline positions={route} pathOptions={{ color: "blue", weight: 5 }} />
      )}

      {/* MVP：用 Marker/Popup 顯示抽樣點的風速與風向。下一張再做分段上色。 */}
      {winds.map((p, idx) => {
        const pos: [number, number] = [p.lat, p.lon];
        const speedMS = typeof p.speedKmh === "number" ? p.speedKmh / 3.6 : undefined;
        const color = typeof speedMS === "number" ? windToColor(speedMS) : "#6b7280";
        const dir = typeof p.dirDeg === "number" ? degToCompass(p.dirDeg) : "—";

        return (
          <Marker position={pos} key={idx}>
            <Popup>
              <div style={{ minWidth: 140 }}>
                <div><strong>Wind</strong></div>
                {p.error ? (
                  <div>—</div>
                ) : (
                  <>
                    <div>Speed: {speedMS?.toFixed(1) ?? "—"} m/s</div>
                    <div>Dir: {dir}</div>
                    <div style={{ display:"inline-block", padding:"2px 6px", borderRadius:6, background: color, color:"#fff" }}>
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
  );
}

