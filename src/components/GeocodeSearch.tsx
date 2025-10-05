// src/components/GeocodeSearch.tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GeoItem = { id: string; name: string; lat: number; lon: number; type?: string };
export type Role = "start" | "end";

type Props = {
  /** 地圖中心（ORS focus） */
  center: { lat: number; lon: number };
  /** 選取單一結果（使用者點選下拉） */
  onPick: (role: Role, lat: number, lon: number, label: string) => void;
  /** 使用者按下 Find route（可能只輸入文字、未選下拉） */
  onSubmit?: (startText: string, endText: string) => void;
  defaultStart?: string;
  defaultEnd?: string;
};

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

async function geocodeFetch(
  q: string,
  opts: { focusLat?: number; focusLon?: number; lang?: string; limit?: number },
  signal?: AbortSignal
) {
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 5),
    lang: opts.lang ?? "zh-TW",
    "boundary.country": "TW",
  });
  if (typeof opts.focusLat === "number" && typeof opts.focusLon === "number") {
    params.set("focus.lat", String(opts.focusLat));
    params.set("focus.lon", String(opts.focusLon));
  }
  const url = `/api/geocode?${params.toString()}`;
  const r = await fetch(url, { cache: "no-store", signal });
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const j = (await r.json()) as { items?: GeoItem[] };
  return j.items ?? [];
}

export default function GeocodeSearch({ onPick, onSubmit, center, defaultStart, defaultEnd }: Props) {
  const [startQ, setStartQ] = useState(defaultStart ?? "");
  const [endQ, setEndQ] = useState(defaultEnd ?? "");

  const ds = useDebounced(startQ, 300);
  const de = useDebounced(endQ, 300);

  const [startList, setStartList] = useState<GeoItem[]>([]);
  const [endList, setEndList] = useState<GeoItem[]>([]);
  const [activeIdx, setActiveIdx] = useState<{ role: Role; idx: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (role: Role, q: string) => {
      if (!q.trim()) {
        (role === "start" ? setStartList : setEndList)([]);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const items = await geocodeFetch(q, { focusLat: center.lat, focusLon: center.lon, lang: "zh-TW", limit: 5 }, ac.signal);
        (role === "start" ? setStartList : setEndList)(items);
        setActiveIdx(items.length ? { role, idx: 0 } : null);
      } catch {
        (role === "start" ? setStartList : setEndList)([]);
      }
    },
    [center.lat, center.lon]
  );

  useEffect(() => { void runSearch("start", ds); }, [ds, runSearch]);
  useEffect(() => { void runSearch("end", de); }, [de, runSearch]);

  const onChoose = useCallback((role: Role, item: GeoItem) => {
    onPick(role, item.lat, item.lon, item.name);
    if (role === "start") { setStartQ(item.name); setStartList([]); }
    else { setEndQ(item.name); setEndList([]); }
  }, [onPick]);

  const box = useMemo(() => ({
    container: { position: "relative" as const, width: 360 },
    input: { width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db" },
    label: { fontSize: 12, fontWeight: 600 as const, marginBottom: 4 },
    listWrap: { position: "absolute" as const, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderTop: "none", zIndex: 2000 },
    item: (active: boolean) => ({ padding: "6px 8px", cursor: "pointer", background: active ? "#f1f5f9" : "#fff" }),
  }), []);

  const renderList = (role: Role, items: GeoItem[]) => (
    <div style={box.listWrap}>
      {items.map((it, i) => {
        const act = !!(activeIdx && activeIdx.role === role && activeIdx.idx === i);
        return (
          <div
            key={`${role}-${it.id}`}
            onMouseDown={(e) => { e.preventDefault(); onChoose(role, it); }}
            onMouseEnter={() => setActiveIdx({ role, idx: i })}
            style={box.item(act)}
            title={`${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}`}
          >
            {it.name}
          </div>
        );
      })}
      {items.length === 0 && <div style={{ padding: "6px 8px", color: "#6b7280" }}>No results</div>}
    </div>
  );

  const onKey = (role: Role, items: GeoItem[], e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const cur = activeIdx && activeIdx.role === role ? activeIdx.idx : -1;
      const next = e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
      setActiveIdx({ role, idx: next });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cur = activeIdx && activeIdx.role === role ? activeIdx.idx : 0;
      const item = items[cur];
      if (item) onChoose(role, item);
    } else if (e.key === "Escape") {
      (role === "start" ? setStartList : setEndList)([]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 100 }}>
      <div style={box.label}>Start</div>
      <div style={box.container}>
        <input
          value={startQ}
          onChange={(e) => setStartQ(e.target.value)}
          onKeyDown={(e) => onKey("start", startList, e)}
          placeholder="e.g., 台北車站 / Taipei Main Station"
          // style={box.input}
          
        />
        {startList.length > 0 && renderList("start", startList)}
      </div>

      <div style={box.label}>End</div>
      <div style={box.container}>
        <input
          value={endQ}
          onChange={(e) => setEndQ(e.target.value)}
          onKeyDown={(e) => onKey("end", endList, e)}
          placeholder="e.g., 淡水老街 / Tamsui Old Street"
          // style={box.input}
        />
        {endList.length > 0 && renderList("end", endList)}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        {/* <button
          onClick={() => onSubmit?.(startQ, endQ)}
          style={{ padding: "6px 10px", borderRadius: 8, background: "#2563eb", color: "#fff", border: "1px solid #2563eb" }}
        >
          Find route
        </button> */}
      </div>
    </div>
  );
}
