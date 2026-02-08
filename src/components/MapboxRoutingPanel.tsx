"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GeoItem = { id: string; name: string; lat: number; lon: number; type?: string };
export type Role = "start" | "end" | "waypoint";

type Props = {
  /** 地圖中心（用於搜尋） */
  center: { lat: number; lon: number };
  /** 選取單一結果（使用者點選下拉） */
  onPick: (role: Role, lat: number, lon: number, label: string) => void;
  /** 選中的起點 */
  startLatLon?: [number, number] | null;
  startLabel?: string;
  /** 選中的終點 */
  endLatLon?: [number, number] | null;
  endLabel?: string;
  /** 途經點 */
  waypoints?: Array<{ label: string; latLon: [number, number] }>;
  onWaypointsChange?: (waypoints: Array<{ label: string; latLon: [number, number] }>) => void;
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

export default function MapboxRoutingPanel({
  onPick,
  center,
  startLatLon,
  startLabel: startLabelProp,
  endLatLon,
  endLabel: endLabelProp,
  waypoints = [],
  onWaypointsChange,
}: Props) {
  const [startQ, setStartQ] = useState(startLabelProp ?? "");
  const [endQ, setEndQ] = useState(endLabelProp ?? "");
  const [waypointQueries, setWaypointQueries] = useState<string[]>(
    waypoints.map((w) => w.label)
  );

  const ds = useDebounced(startQ, 300);
  const de = useDebounced(endQ, 300);
  const dws = useDebounced(waypointQueries, 300);

  const [startList, setStartList] = useState<GeoItem[]>([]);
  const [endList, setEndList] = useState<GeoItem[]>([]);
  const [waypointLists, setWaypointLists] = useState<GeoItem[][]>([]);
  const [activeIdx, setActiveIdx] = useState<{ role: Role; wpIdx?: number; idx: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (role: Role, q: string, wpIdx?: number) => {
      if (!q.trim()) {
        if (role === "start") setStartList([]);
        else if (role === "end") setEndList([]);
        else if (role === "waypoint" && typeof wpIdx === "number") {
          setWaypointLists((prev) => {
            const next = [...prev];
            next[wpIdx] = [];
            return next;
          });
        }
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const items = await geocodeFetch(
          q,
          { focusLat: center.lat, focusLon: center.lon, lang: "zh-TW", limit: 5 },
          ac.signal
        );
        if (role === "start") setStartList(items);
        else if (role === "end") setEndList(items);
        else if (role === "waypoint" && typeof wpIdx === "number") {
          setWaypointLists((prev) => {
            const next = [...prev];
            next[wpIdx] = items;
            return next;
          });
        }
        setActiveIdx(items.length ? { role, wpIdx, idx: 0 } : null);
      } catch {
        if (role === "start") setStartList([]);
        else if (role === "end") setEndList([]);
        else if (role === "waypoint" && typeof wpIdx === "number") {
          setWaypointLists((prev) => {
            const next = [...prev];
            next[wpIdx] = [];
            return next;
          });
        }
      }
    },
    [center.lat, center.lon]
  );

  useEffect(() => {
    void runSearch("start", ds);
  }, [ds, runSearch]);

  useEffect(() => {
    void runSearch("end", de);
  }, [de, runSearch]);

  useEffect(() => {
    dws.forEach((q, i) => runSearch("waypoint", q, i));
  }, [dws, runSearch]);

  const onChoose = useCallback(
    (role: Role, item: GeoItem, wpIdx?: number) => {
      onPick(role, item.lat, item.lon, item.name);
      if (role === "start") {
        setStartQ(item.name);
        setStartList([]);
      } else if (role === "end") {
        setEndQ(item.name);
        setEndList([]);
      } else if (role === "waypoint" && typeof wpIdx === "number") {
        const newWpQueries = [...waypointQueries];
        newWpQueries[wpIdx] = item.name;
        setWaypointQueries(newWpQueries);
        setWaypointLists((prev) => {
          const next = [...prev];
          next[wpIdx] = [];
          return next;
        });
      }
    },
    [onPick, waypointQueries]
  );

  const box = useMemo(
    () => ({
      container: { position: "relative" as const, width: 360 },
      input: {
        width: "100%",
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid #d1d5db",
        fontSize: 14,
      },
      label: { fontSize: 12, fontWeight: 600 as const, marginBottom: 4, color: "#1e293b" },
      listWrap: {
        position: "absolute" as const,
        top: "100%",
        left: 0,
        right: 0,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderTop: "none",
        zIndex: 2000,
      },
      item: (active: boolean) => ({
        padding: "6px 8px",
        cursor: "pointer",
        background: active ? "#f1f5f9" : "#fff",
        fontSize: 13,
        color: "#1e293b",
      }),
      badge: {
        display: "inline-block" as const,
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 3,
        background: "#e0f2fe",
        color: "#0369a1",
        marginLeft: 6,
      },
    }),
    []
  );

  const renderList = (role: Role, items: GeoItem[], wpIdx?: number) => (
    <div style={box.listWrap}>
      {items.map((it, i) => {
        const act = !!(
          activeIdx &&
          activeIdx.role === role &&
          (role !== "waypoint" || activeIdx.wpIdx === wpIdx) &&
          activeIdx.idx === i
        );
        return (
          <div
            key={`${role}-${wpIdx ?? ""}-${it.id}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onChoose(role, it, wpIdx);
            }}
            onMouseEnter={() => setActiveIdx({ role, wpIdx, idx: i })}
            style={box.item(act)}
            title={`${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}`}
          >
            {it.name}
          </div>
        );
      })}
      {items.length === 0 && (
        <div style={{ padding: "6px 8px", color: "#6b7280", fontSize: 13 }}>No results</div>
      )}
    </div>
  );

  const onKey = (
    role: Role,
    items: GeoItem[],
    e: React.KeyboardEvent<HTMLInputElement>,
    wpIdx?: number
  ) => {
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const cur =
        activeIdx && activeIdx.role === role && (role !== "waypoint" || activeIdx.wpIdx === wpIdx)
          ? activeIdx.idx
          : -1;
      const next =
        e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
      setActiveIdx({ role, wpIdx, idx: next });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cur =
        activeIdx && activeIdx.role === role && (role !== "waypoint" || activeIdx.wpIdx === wpIdx)
          ? activeIdx.idx
          : 0;
      const item = items[cur];
      if (item) onChoose(role, item, wpIdx);
    } else if (e.key === "Escape") {
      if (role === "start") setStartList([]);
      else if (role === "end") setEndList([]);
      else if (role === "waypoint" && typeof wpIdx === "number") {
        setWaypointLists((prev) => {
          const next = [...prev];
          next[wpIdx] = [];
          return next;
        });
      }
    }
  };

  const addWaypoint = () => {
    setWaypointQueries([...waypointQueries, ""]);
    setWaypointLists([...waypointLists, []]);
  };

  const removeWaypoint = (idx: number) => {
    const newQueries = waypointQueries.filter((_, i) => i !== idx);
    const newLists = waypointLists.filter((_, i) => i !== idx);
    setWaypointQueries(newQueries);
    setWaypointLists(newLists);
    onWaypointsChange?.(
      waypoints.filter((_, i) => i !== idx)
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 100 }}>
      {/* Start Point */}
      <div>
        <div style={box.label}>📍 Start</div>
        <div style={box.container}>
          <input
            value={startQ}
            onChange={(e) => setStartQ(e.target.value)}
            onKeyDown={(e) => onKey("start", startList, e)}
            placeholder="Starting location"
            style={box.input}
          />
          {startLatLon && (
            <div style={{ ...box.badge, marginTop: 4, display: "block", marginLeft: 0 }}>
              Selected: {startLatLon[1].toFixed(4)}, {startLatLon[0].toFixed(4)}
            </div>
          )}
          {startList.length > 0 && renderList("start", startList)}
        </div>
      </div>

      {/* Waypoints */}
      {waypointQueries.map((q, i) => (
        <div key={`wp-${i}`}>
          <div style={box.label}>
            🚩 Waypoint {i + 1}
            <button
              onClick={() => removeWaypoint(i)}
              style={{
                marginLeft: 8,
                padding: "0 6px",
                borderRadius: 4,
                border: "1px solid #fee2e2",
                background: "#fff",
                color: "#dc2626",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Remove
            </button>
          </div>
          <div style={box.container}>
            <input
              value={q}
              onChange={(e) => {
                const newQueries = [...waypointQueries];
                newQueries[i] = e.target.value;
                setWaypointQueries(newQueries);
              }}
              onKeyDown={(e) => onKey("waypoint", waypointLists[i] ?? [], e, i)}
              placeholder="Waypoint location"
              style={box.input}
            />
            {waypointLists[i]?.length > 0 && renderList("waypoint", waypointLists[i], i)}
          </div>
        </div>
      ))}

      {/* End Point */}
      <div>
        <div style={box.label}>📍 End</div>
        <div style={box.container}>
          <input
            value={endQ}
            onChange={(e) => setEndQ(e.target.value)}
            onKeyDown={(e) => onKey("end", endList, e)}
            placeholder="Destination"
            style={box.input}
          />
          {endLatLon && (
            <div style={{ ...box.badge, marginTop: 4, display: "block", marginLeft: 0 }}>
              Selected: {endLatLon[1].toFixed(4)}, {endLatLon[0].toFixed(4)}
            </div>
          )}
          {endList.length > 0 && renderList("end", endList)}
        </div>
      </div>

      {/* Add Waypoint Button */}
      <button
        onClick={addWaypoint}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px dashed #cbd5e1",
          background: "#f8fafc",
          color: "#475569",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        + Add Waypoint
      </button>
    </div>
  );
}
