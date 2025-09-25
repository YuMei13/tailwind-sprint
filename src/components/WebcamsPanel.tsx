// src/components/WebcamsPanel.tsx
"use client";
import { useEffect, useState } from "react";

export type WebcamItem = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  city: string;
  region: string;
  country: string;
  detailUrl: string;
  preview: string;
  playerDay?: string;
  distance: number; // meters
};

type Props = {
  center: { lat: number; lon: number };
  onPick: (lat: number, lon: number) => void;
  onLoaded?: (items: WebcamItem[]) => void; // ← 新增：把結果回拋給地圖
};

export default function WebcamsPanel({ center, onPick, onLoaded }: Props) {
  const [items, setItems] = useState<WebcamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(50); // 預設半徑大一點，較容易看到結果

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        setErrMsg(null);
        const url = `/api/webcams?lat=${center.lat}&lon=${center.lon}&radiusKm=${radiusKm}&limit=20`;
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) {
          setItems(j.items ?? []);
          onLoaded?.(j.items ?? []); // ← 回拋給 MapView
        }
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          onLoaded?.([]); // ← 出錯也同步清空
          setErrMsg(e instanceof Error ? e.message : "Fetch failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lon, radiusKm, onLoaded]);

  return (
    <div style={{
      width: 320,
      background: "rgba(255,255,255,0.95)",
      borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      padding: 10,
      fontSize: 12,
      maxHeight: 420,
      overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>Nearby webcams</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Radius</span>
          <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} style={{ padding: "2px 6px" }}>
            <option value={10}>10 km</option>
            <option value={30}>30 km</option>
            <option value={50}>50 km</option>
            <option value={100}>100 km</option>
          </select>
        </label>
      </div>

      {errMsg && <div style={{ color: "#b91c1c", marginBottom: 6 }}>Webcams error: {errMsg}</div>}
      {loading && <div>Loading…</div>}
      {!loading && items.length === 0 && (
        <div>
          <div>No webcams found in {radiusKm} km.</div>
          {radiusKm < 100 && (
            <button
              onClick={() => setRadiusKm(100)}
              style={{ marginTop: 6, padding: "4px 8px", borderRadius: 6, border: "1px solid #2563eb", background: "#2563eb", color: "#fff" }}
            >
              Try 100 km radius
            </button>
          )}
        </div>
      )}

      {items.map((w, idx) => (
        <div
          key={`${w.id || "noid"}-${w.lat.toFixed(5)}-${w.lon.toFixed(5)}-${idx}`} // ← 唯一 key，修正警告
          style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}
        >
          <img
            src={w.preview}
            alt={w.title}
            width={96}
            height={64}
            style={{ objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{w.title || "Webcam"}</div>
            <div style={{ color: "#6b7280" }}>
              {w.city || w.region || w.country ? `${w.city || ""}${w.region ? " · " + w.region : ""}${w.country ? " · " + w.country : ""}` : "—"}
            </div>
            <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{(w.distance / 1000).toFixed(1)} km away</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button
                onClick={() => onPick(w.lat, w.lon)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #2563eb", color: "#fff", background: "#2563eb" }}
              >
                Fly to
              </button>
              <a href={w.detailUrl} target="_blank" rel="noreferrer" style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}>
                View on Windy
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
