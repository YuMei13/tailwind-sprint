// src/components/WebcamsPanel.tsx
"use client";
import { useEffect, useMemo, useState } from "react";

export type WebcamItem = {
  id?: string | number;
  title?: string;
  lat: number;
  lon: number;
  distance: number;
  city?: string;
  region?: string;
  country?: string;
  detailUrl: string;
  // 可能出現的縮圖欄位
  thumbnail?: string;
  preview?: string;
  image?: {
    current?: { thumbnail?: string; preview?: string };
    daylight?: { thumbnail?: string; preview?: string };
  };
};

export default function WebcamsPanel({
  center,
  onPick,
  onLoaded,
}: {
  center: { lat: number; lon: number };
  onPick: (lat: number, lon: number) => void;
  onLoaded?: (items: WebcamItem[]) => void;
}) {
  const [items, setItems] = useState<WebcamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(20);

  const url = useMemo(() => {
    const p = new URLSearchParams({
      lat: String(center.lat),
      lon: String(center.lon),
      radiusKm: String(radiusKm),
      limit: "20",
      include: "images,location,player,urls",
    });
    return `/api/webcams?${p.toString()}`;
  }, [center.lat, center.lon, radiusKm]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        const j = (await r.json()) as { items?: WebcamItem[] };
        const rows = j.items ?? [];
        if (!cancelled) {
          setItems(rows);
          onLoaded?.(rows);
        }
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [url, onLoaded]);

  const imgOf = (w: WebcamItem) =>
    w.thumbnail ||
    w.preview ||
    w.image?.current?.thumbnail ||
    w.image?.current?.preview ||
    w.image?.daylight?.thumbnail ||
    w.image?.daylight?.preview ||
    "";

  return (
    <div style={{ width: 360, background: "rgba(255,255,255,0.98)", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, boxShadow: "0 6px 16px rgba(0,0,0,0.15)", zIndex: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>Nearby webcams</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>Radius</span>
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value) || 20)}
            style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #d1d5db" }}
          >
            <option value={10}>10 km</option>
            <option value={20}>20 km</option>
            <option value={50}>50 km</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ color: "#6b7280", fontSize: 13 }}>Loading…</div>}
      {err && <div style={{ color: "#dc2626", fontSize: 13 }}>Error: {err}</div>}
      {!loading && !err && items.length === 0 && <div style={{ color: "#6b7280", fontSize: 13 }}>No webcams nearby</div>}

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflow: "auto" }}>
        {items.map((w) => {
          const img = imgOf(w);
          return (
            <div key={`${w.id ?? `${w.lat},${w.lon}`}`} style={{ display: "flex", gap: 8, borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
              <div style={{ width: 96, height: 64, borderRadius: 6, overflow: "hidden", background: "#f1f5f9", flex: "0 0 auto" }}>
                {img ? (
                  <img src={img} alt={w.title ?? "webcam"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 12 }}>no preview</div>
                )}
              </div>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{w.title || "Webcam"}</div>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                  {w.city || w.region || w.country || "—"}
                </div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>{(w.distance / 1000).toFixed(1)} km away</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    onClick={() => onPick(w.lat, w.lon)}
                    style={{ fontSize: 12, color: "#1e293b",padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff" }}
                  >
                    Fly to
                  </button>
                  <a href={w.detailUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 13 }}>
                    View on Windy
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
