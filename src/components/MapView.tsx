"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import { useEffect, useState } from "react";

type Line = [number, number][];

export default function MapView() {
  const [route, setRoute] = useState<Line>([]);

  useEffect(() => {
    const fetchRoute = async () => {
      try {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: [121.517, 25.047], // 台北車站 (lon,lat)
            end: [121.510, 25.057],   // 大稻埕碼頭 (lon,lat)
          }),
        });
        const data = await res.json();
        if (data?.geometry?.coordinates) {
          // ORS 回傳 [lon,lat] → Leaflet 需要 [lat,lon]
          setRoute(data.geometry.coordinates.map(([lon, lat]: number[]) => [lat, lon]));
        }
      } catch (err) {
        console.error("Failed to fetch route", err);
      }
    };
    fetchRoute();
  }, []);

  return (
    <MapContainer center={[25.05, 121.52]} zoom={14} style={{ height: "100%", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {route.length > 0 && (
        <Polyline positions={route} pathOptions={{ color: "blue", weight: 5 }} />
      )}
    </MapContainer>
  );
}
