"use client";
import { useEffect, useState } from "react";

type Place = { name: string; lat: number; lon: number };
type Props = { onApply: (start: [number, number] | null, end: [number, number] | null) => void }; // [lon,lat]

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

async function geocode(q: string): Promise<Place[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: Place[] };
  return json.items ?? [];
}

export default function GeocodeSearch({ onApply }: Props) {
  const [qStart, setQStart] = useState("");
  const [qEnd, setQEnd] = useState("");
  const [sugStart, setSugStart] = useState<Place[]>([]);
  const [sugEnd, setSugEnd] = useState<Place[]>([]);
  const [selStart, setSelStart] = useState<Place | null>(null);
  const [selEnd, setSelEnd] = useState<Place | null>(null);

  const dqStart = useDebounced(qStart, 300);
  const dqEnd = useDebounced(qEnd, 300);

  const boxStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.95)",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    padding: 10,
    width: 320,
    fontSize: 12,
  };

  useEffect(() => {
    // let run = true;
    (async () => setSugStart(await geocode(dqStart)))();
    return () => {
    //   run = false;
    };
  }, [dqStart]);

  useEffect(() => {
    // let run = true;
    (async () => setSugEnd(await geocode(dqEnd)))();
    return () => {
    //   run = false;
    };
  }, [dqEnd]);

  function renderList(items: Place[], onPick: (p: Place) => void) {
    if (!items.length) return null;
    return (
      <div
        style={{
          marginTop: 6,
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          maxHeight: 180,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {items.map((p) => (
          <button
            key={`${p.lat},${p.lon}-${p.name}`}
            onClick={() => onPick(p)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              borderBottom: "1px solid #f1f5f9",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            {p.name}
            <div style={{ color: "#6b7280", fontSize: 11 }}>
              {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Route search</div>

      {/* Start */}
      <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Start</label>
      <input
        value={selStart ? selStart.name : qStart}
        onChange={(e) => {
          setSelStart(null);
          setQStart(e.target.value);
        }}
        placeholder="輸入地名或地址（例：台北車站）"
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}
      />
      {renderList(sugStart, (p) => {
        setSelStart(p);
        setQStart(p.name);
        setSugStart([]);
      })}

      {/* End */}
      <label style={{ display: "block", fontWeight: 600, margin: "10px 0 4px" }}>End</label>
      <input
        value={selEnd ? selEnd.name : qEnd}
        onChange={(e) => {
          setSelEnd(null);
          setQEnd(e.target.value);
        }}
        placeholder="輸入地名或地址（例：大稻埕碼頭）"
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}
      />
      {renderList(sugEnd, (p) => {
        setSelEnd(p);
        setQEnd(p.name);
        setSugEnd([]);
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => {
            setSelStart(null);
            setSelEnd(null);
            setQStart("");
            setQEnd("");
            onApply(null, null);
          }}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}
        >
          清除
        </button>
        <button
          onClick={() => {
            const s = selStart ? ([selStart.lon, selStart.lat] as [number, number]) : null;
            const e = selEnd ? ([selEnd.lon, selEnd.lat] as [number, number]) : null;
            onApply(s, e);
          }}
          disabled={!selStart || !selEnd}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "#fff",
          }}
        >
          規劃路線
        </button>
      </div>
    </div>
  );
}
