"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { ui } from "@/lib/ui";

type GeoItem = { id: string; name: string; lat: number; lon: number; type?: string };
export type Role = "start" | "end" | "waypoint";

type Props = {
  /** 地圖中心（用於搜尋） */
  center: { lat: number; lon: number };
  /** 選取單一結果（使用者點選下拉） */
  onPick: (role: Role, lat: number, lon: number, label: string, wpIdx?: number) => void;
  /** 選中的起點 */
  startLatLon?: [number, number] | null;
  startLabel?: string;
  /** 選中的終點 */
  endLatLon?: [number, number] | null;
  endLabel?: string;
  /** 途經點 */
  waypoints?: Array<{ label: string; latLon?: [number, number] | null }>;
  onWaypointsChange?: (waypoints: Array<{ label: string; latLon?: [number, number] | null }>) => void;
  onPickOnMap?: (role: Role, wpIdx?: number) => void;
  onMoveWaypoint?: (fromIndex: number, toIndex: number) => void;
  onClearStart?: () => void;
  onClearEnd?: () => void;
  onMoveStartDown?: () => void;
  onMoveEndUp?: () => void;
  onSwapStartEnd?: () => void;
  onDownloadGpx?: () => void;
  canDownloadGpx?: boolean;
  onClearRoute?: () => void;
  pickMode?: "none" | "start" | "end" | "waypoint";
  pendingWaypointIndex?: number | null;
  routePresets?: Array<{ id: string; name: string; description?: string }>;
  onApplyPreset?: (presetId: string) => void | Promise<void>;
  isApplyingPreset?: boolean;
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
  const r = await apiFetch(url, { signal });
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const j = (await r.json()) as { items?: GeoItem[] };
  return j.items ?? [];
}

function normalizeText(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function approxDistanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = (aLat - bLat) * 111;
  const dLon = (aLon - bLon) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

function layerWeight(type?: string) {
  switch (type) {
    case "poi":
    case "venue":
      return 30;
    case "place":
      return 24;
    case "address":
      return 22;
    case "street":
      return 14;
    case "locality":
      return 8;
    default:
      return 0;
  }
}

function isAddressLikeQuery(qRaw: string) {
  const q = normalizeText(qRaw);
  if (/\d/.test(q)) return true;
  // Common address tokens in zh/en
  const tokens = ["路", "街", "段", "巷", "弄", "號", "rd", "road", "st", "street", "ave", "avenue"];
  return tokens.some((t) => q.includes(t));
}

function pickBestGeocodeItem(query: string, items: GeoItem[], center: { lat: number; lon: number }): GeoItem | null {
  if (!items.length) return null;
  const q = normalizeText(query);
  const addressLike = isAddressLikeQuery(query);
  let best: GeoItem | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const it of items) {
    const name = normalizeText(it.name || "");
    let score = 0;

    if (name === q) score += 140;
    if (name.startsWith(q)) score += 90;
    if (name.includes(q) || q.includes(name)) score += 70;
    score += layerWeight(it.type);

    // Prefer POIs unless user clearly typed an address-like query.
    if (!addressLike) {
      if (it.type === "poi" || it.type === "venue") score += 45;
      if (it.type === "address" || it.type === "street") score -= 20;
    } else {
      if (it.type === "address" || it.type === "street") score += 20;
    }

    if (q.includes("捷運") && name.includes("捷運")) score += 35;
    if (q.includes("車站") && name.includes("車站")) score += 30;
    if (q.includes("公園") && name.includes("公園")) score += 22;
    if (q.includes("碼頭") && name.includes("碼頭")) score += 22;
    if (q.includes("宮") && name.includes("宮")) score += 18;
    if (q.includes("路") && it.type === "street") score += 18;

    const distKm = approxDistanceKm(it.lat, it.lon, center.lat, center.lon);
    score -= Math.min(distKm, 60) * 0.9;

    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }

  return best;
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
  onPickOnMap,
  onMoveWaypoint,
  onClearStart,
  onClearEnd,
  onMoveStartDown,
  onMoveEndUp,
  onSwapStartEnd,
  onDownloadGpx,
  canDownloadGpx = false,
  onClearRoute,
  pickMode = "none",
  pendingWaypointIndex = null,
  routePresets = [],
  onApplyPreset,
  isApplyingPreset = false,
}: Props) {
  const [startQ, setStartQ] = useState(startLabelProp ?? "");
  const [endQ, setEndQ] = useState(endLabelProp ?? "");
  const [waypointQueries, setWaypointQueries] = useState<string[]>(
    waypoints.map((w) => w.label)
  );

  useEffect(() => {
    const next = startLabelProp ?? "";
    setStartQ(next);
    if (next) {
      confirmedLabelRef.current.start = next;
      setStartList([]);
    }
  }, [startLabelProp]);

  useEffect(() => {
    const next = endLabelProp ?? "";
    setEndQ(next);
    if (next) {
      confirmedLabelRef.current.end = next;
      setEndList([]);
    }
  }, [endLabelProp]);

  useEffect(() => {
    setWaypointQueries(waypoints.map((w) => w.label));
  }, [waypoints]);

  const ds = useDebounced(startQ, 300);
  const de = useDebounced(endQ, 300);
  const dws = useDebounced(waypointQueries, 300);

  const [startList, setStartList] = useState<GeoItem[]>([]);
  const [endList, setEndList] = useState<GeoItem[]>([]);
  const [waypointLists, setWaypointLists] = useState<GeoItem[][]>([]);
  const [activeIdx, setActiveIdx] = useState<{ role: Role; wpIdx?: number; idx: number } | null>(null);
  const abortMapRef = useRef<Record<string, AbortController>>({});
  const requestSeqRef = useRef<Record<string, number>>({});
  const confirmedLabelRef = useRef<Record<string, string>>({});
  const [selectedPresetId, setSelectedPresetId] = useState<string>(routePresets[0]?.id ?? "");

  useEffect(() => {
    if (!routePresets.length) {
      setSelectedPresetId("");
      return;
    }
    if (!routePresets.some((r) => r.id === selectedPresetId)) {
      setSelectedPresetId(routePresets[0].id);
    }
  }, [routePresets, selectedPresetId]);

  const runSearch = useCallback(
    async (role: Role, q: string, wpIdx?: number) => {
      const key = role === "waypoint" ? `waypoint-${wpIdx ?? -1}` : role;
      const seq = (requestSeqRef.current[key] ?? 0) + 1;
      requestSeqRef.current[key] = seq;
      const trimmed = q.trim();
      const selectedLabel =
        role === "start"
          ? (confirmedLabelRef.current.start ?? startLabelProp ?? "").trim()
          : role === "end"
            ? (confirmedLabelRef.current.end ?? endLabelProp ?? "").trim()
            : typeof wpIdx === "number"
              ? (confirmedLabelRef.current[`waypoint-${wpIdx}`] ?? waypoints[wpIdx]?.label ?? "").trim()
              : "";
      // If user has already selected this exact label, keep dropdown closed.
      if (trimmed && selectedLabel && trimmed === selectedLabel) {
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
      if (!trimmed) {
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
      abortMapRef.current[key]?.abort();
      const ac = new AbortController();
      abortMapRef.current[key] = ac;
      try {
        const items = await geocodeFetch(
          trimmed,
          { focusLat: center.lat, focusLon: center.lon, lang: "zh-TW", limit: 5 },
          ac.signal
        );
        // Ignore stale async responses that finished after a newer query.
        if (requestSeqRef.current[key] !== seq) return;
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
        if (requestSeqRef.current[key] !== seq) return;
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
    [center.lat, center.lon, startLabelProp, endLabelProp, waypoints]
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
      onPick(role, item.lat, item.lon, item.name, wpIdx);
      if (role === "start") {
        confirmedLabelRef.current.start = item.name;
        setStartQ(item.name);
        setStartList([]);
      } else if (role === "end") {
        confirmedLabelRef.current.end = item.name;
        setEndQ(item.name);
        setEndList([]);
      } else if (role === "waypoint" && typeof wpIdx === "number") {
        confirmedLabelRef.current[`waypoint-${wpIdx}`] = item.name;
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

  const resolveAndPick = useCallback(
    async (role: Role, rawQuery: string, wpIdx?: number) => {
      const q = rawQuery.trim();
      if (!q) return;
      try {
        const candidates = await geocodeFetch(
          q,
          { focusLat: center.lat, focusLon: center.lon, lang: "zh-TW", limit: 8 },
          undefined
        );
        const best = pickBestGeocodeItem(q, candidates, center);
        if (best) onChoose(role, best, wpIdx);
      } catch {
        // ignore
      }
    },
    [center, onChoose]
  );

  useEffect(() => {
    const abortMap = abortMapRef.current;
    return () => {
      Object.values(abortMap).forEach((ac) => ac.abort());
    };
  }, []);

  const box = useMemo(
    () => ({
      container: { position: "relative" as const, width: "100%" },
      input: {
        width: "100%",
        padding: "9px 12px",
        borderRadius: ui.radiusSm,
        border: `0.5px solid ${ui.hairline}`,
        background: "rgba(255,255,255,0.7)",
        color: ui.ink,
        fontSize: 14,
        outline: "none",
      },
      inputRow: {
        display: "flex",
        alignItems: "center",
        gap: 6,
      },
      applyBtn: {
        padding: "8px 13px",
        borderRadius: ui.radiusPill,
        border: "none",
        background: ui.accentSoft,
        color: ui.accent,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap" as const,
      },
      select: {
        width: "100%",
        padding: "9px 12px",
        borderRadius: ui.radiusSm,
        border: `0.5px solid ${ui.hairline}`,
        fontSize: 13,
        color: ui.ink,
        background: "rgba(255,255,255,0.7)",
      },
      label: { ...ui.sectionLabel, marginBottom: 6 },
      listWrap: {
        position: "absolute" as const,
        top: "100%",
        left: 0,
        right: 0,
        marginTop: 4,
        background: ui.surfaceSolid,
        backdropFilter: ui.blur,
        WebkitBackdropFilter: ui.blur,
        border: `0.5px solid ${ui.hairline}`,
        borderRadius: ui.radiusSm,
        boxShadow: ui.shadow,
        overflow: "hidden",
        zIndex: 2000,
      },
      item: (active: boolean) => ({
        padding: "9px 12px",
        cursor: "pointer",
        background: active ? ui.accentSoft : "transparent",
        fontSize: 13,
        color: ui.ink,
      }),
      badge: {
        display: "inline-block" as const,
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: ui.radiusPill,
        background: ui.accentSoft,
        color: ui.accent,
        marginLeft: 6,
      },
      tinyBtn: {
        padding: "4px 9px",
        borderRadius: ui.radiusPill,
        border: `0.5px solid ${ui.hairline}`,
        background: "rgba(255,255,255,0.6)",
        color: ui.inkSecondary,
        cursor: "pointer",
        fontSize: 11,
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

  const handleClearRoute = useCallback(() => {
    // Clear panel-local state first so the UI responds immediately.
    confirmedLabelRef.current = {};
    setStartQ("");
    setEndQ("");
    setStartList([]);
    setEndList([]);
    setWaypointQueries([]);
    setWaypointLists([]);
    setActiveIdx(null);
    onClearRoute?.();
  }, [onClearRoute]);

  const onKey = (
    role: Role,
    items: GeoItem[],
    e: React.KeyboardEvent<HTMLInputElement>,
    wpIdx?: number
  ) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
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
      if (items.length > 0) {
        const cur =
          activeIdx && activeIdx.role === role && (role !== "waypoint" || activeIdx.wpIdx === wpIdx)
            ? activeIdx.idx
            : 0;
        const item = items[cur];
        if (item) onChoose(role, item, wpIdx);
        return;
      }
      const q =
        role === "start"
          ? startQ
          : role === "end"
            ? endQ
            : typeof wpIdx === "number"
              ? waypointQueries[wpIdx] ?? ""
              : "";
      if (!q.trim()) return;
      // Fallback: user typed text and pressed Enter before selecting dropdown.
      void resolveAndPick(role, q, wpIdx);
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
    const nextWaypoints = [...waypoints, { label: "", latLon: null }];
    setWaypointQueries([...waypointQueries, ""]);
    setWaypointLists([...waypointLists, []]);
    onWaypointsChange?.(nextWaypoints);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      {routePresets.length > 0 && (
        <div
          style={{
            border: "1px solid #dbeafe",
            borderRadius: 8,
            background: "#f8fbff",
            padding: 8,
          }}
        >
          <div style={{ ...box.label, marginBottom: 6 }}>熱門自行車路線</div>
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            style={box.select}
          >
            {routePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          {selectedPresetId && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
              {routePresets.find((p) => p.id === selectedPresetId)?.description ?? ""}
            </div>
          )}
          <button
            onClick={() => {
              if (!selectedPresetId) return;
              void onApplyPreset?.(selectedPresetId);
            }}
            disabled={!selectedPresetId || isApplyingPreset}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 7,
              border: "1px solid #bfdbfe",
              background: isApplyingPreset ? "#e2e8f0" : "#dbeafe",
              color: isApplyingPreset ? "#64748b" : "#1d4ed8",
              fontWeight: 700,
              fontSize: 13,
              cursor: isApplyingPreset ? "not-allowed" : "pointer",
            }}
          >
            {isApplyingPreset ? "路線載入中..." : "載入所選路線"}
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, color: "#64748b" }}>
        One routing panel: type places or pick directly on map.
      </div>
      {/* Start Point */}
      <div>
        <div style={{ ...box.label, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>📍 Start</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onMoveStartDown}
              disabled={!startLatLon}
              style={{
                ...box.tinyBtn,
                cursor: startLatLon ? "pointer" : "not-allowed",
                color: startLatLon ? "#334155" : "#94a3b8",
              }}
            >
              Down
            </button>
            <button
              onClick={onClearStart}
              disabled={!startLatLon}
              style={{
                ...box.tinyBtn,
                borderColor: "#fee2e2",
                color: startLatLon ? "#dc2626" : "#94a3b8",
                cursor: startLatLon ? "pointer" : "not-allowed",
              }}
            >
              Remove
            </button>
            <button
              onClick={() => onPickOnMap?.("start")}
              style={{
                ...box.tinyBtn,
                background: pickMode === "start" ? "#dbeafe" : "#fff",
                borderColor: pickMode === "start" ? "#93c5fd" : "#cbd5e1",
              }}
            >
              Pick on map
            </button>
          </div>
        </div>
        <div style={box.container}>
          <div style={box.inputRow}>
            <input
              value={startQ}
              onChange={(e) => {
                delete confirmedLabelRef.current.start;
                setStartQ(e.target.value);
              }}
              onKeyDown={(e) => onKey("start", startList, e)}
              placeholder="Starting location (Traditional Chinese supported)"
              style={box.input}
            />
            <button onClick={() => void resolveAndPick("start", startQ)} style={box.applyBtn}>
              Apply
            </button>
          </div>
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
          <div style={{ ...box.label, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>⋮⋮</span>
              🚩 Stop {i + 1}
              {pickMode === "waypoint" && pendingWaypointIndex === i ? " (click map...)" : ""}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => onPickOnMap?.("waypoint", i)}
                style={{
                  ...box.tinyBtn,
                  background: pickMode === "waypoint" && pendingWaypointIndex === i ? "#dbeafe" : "#fff",
                  borderColor:
                    pickMode === "waypoint" && pendingWaypointIndex === i ? "#93c5fd" : "#cbd5e1",
                }}
              >
                Pick
              </button>
              <button
                onClick={() => onMoveWaypoint?.(i, i - 1)}
                disabled={i === 0}
                style={{
                  ...box.tinyBtn,
                  cursor: i === 0 ? "not-allowed" : "pointer",
                  color: i === 0 ? "#94a3b8" : "#334155",
                }}
              >
                Up
              </button>
              <button
                onClick={() => onMoveWaypoint?.(i, i + 1)}
                disabled={i === waypointQueries.length - 1}
                style={{
                  ...box.tinyBtn,
                  cursor: i === waypointQueries.length - 1 ? "not-allowed" : "pointer",
                  color: i === waypointQueries.length - 1 ? "#94a3b8" : "#334155",
                }}
              >
                Down
              </button>
              <button
                onClick={() => removeWaypoint(i)}
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: "1px solid #fee2e2",
                  background: "#fff",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Remove
              </button>
            </div>
          </div>
          <div style={box.container}>
            <div style={box.inputRow}>
              <input
                value={q}
                onChange={(e) => {
                  delete confirmedLabelRef.current[`waypoint-${i}`];
                  const newQueries = [...waypointQueries];
                  newQueries[i] = e.target.value;
                  setWaypointQueries(newQueries);
                }}
                onKeyDown={(e) => onKey("waypoint", waypointLists[i] ?? [], e, i)}
                placeholder="Waypoint location (Traditional Chinese supported)"
                style={box.input}
              />
              <button
                onClick={() => {
                  const current = waypointQueries[i] ?? "";
                  void resolveAndPick("waypoint", current, i);
                }}
                style={box.applyBtn}
              >
                Apply
              </button>
            </div>
            {waypoints[i]?.latLon && (
              <div style={{ ...box.badge, marginTop: 4, display: "block", marginLeft: 0 }}>
                Selected: {waypoints[i].latLon![1].toFixed(4)}, {waypoints[i].latLon![0].toFixed(4)}
              </div>
            )}
            {waypointLists[i]?.length > 0 && renderList("waypoint", waypointLists[i], i)}
          </div>
        </div>
      ))}

      {/* End Point */}
      <div>
        <div style={{ ...box.label, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>📍 End</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onMoveEndUp}
              disabled={!endLatLon}
              style={{
                ...box.tinyBtn,
                cursor: endLatLon ? "pointer" : "not-allowed",
                color: endLatLon ? "#334155" : "#94a3b8",
              }}
            >
              Up
            </button>
            <button
              onClick={onClearEnd}
              disabled={!endLatLon}
              style={{
                ...box.tinyBtn,
                borderColor: "#fee2e2",
                color: endLatLon ? "#dc2626" : "#94a3b8",
                cursor: endLatLon ? "pointer" : "not-allowed",
              }}
            >
              Remove
            </button>
            <button
              onClick={() => onPickOnMap?.("end")}
              style={{
                ...box.tinyBtn,
                background: pickMode === "end" ? "#dbeafe" : "#fff",
                borderColor: pickMode === "end" ? "#93c5fd" : "#cbd5e1",
              }}
            >
              Pick on map
            </button>
          </div>
        </div>
        <div style={box.container}>
          <div style={box.inputRow}>
            <input
              value={endQ}
              onChange={(e) => {
                delete confirmedLabelRef.current.end;
                setEndQ(e.target.value);
              }}
              onKeyDown={(e) => onKey("end", endList, e)}
              placeholder="Destination (Traditional Chinese supported)"
              style={box.input}
            />
            <button onClick={() => void resolveAndPick("end", endQ)} style={box.applyBtn}>
              Apply
            </button>
          </div>
          {endLatLon && (
            <div style={{ ...box.badge, marginTop: 4, display: "block", marginLeft: 0 }}>
              Selected: {endLatLon[1].toFixed(4)}, {endLatLon[0].toFixed(4)}
            </div>
          )}
          {endList.length > 0 && renderList("end", endList)}
        </div>
      </div>

      {/* Add Waypoint Button */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={addWaypoint}
          style={{
            flex: 1,
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
          + Add Stop Input
        </button>
        <button
          onClick={() => {
            addWaypoint();
            onPickOnMap?.("waypoint", waypointQueries.length);
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#334155",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          + Add Stop On Map
        </button>
      </div>
      <button
        type="button"
        onClick={onSwapStartEnd}
        disabled={!startLatLon || !endLatLon}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #bfdbfe",
          background: "#eff6ff",
          color: !startLatLon || !endLatLon ? "#94a3b8" : "#1d4ed8",
          cursor: !startLatLon || !endLatLon ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Swap Start / End
      </button>
      <button
        type="button"
        onClick={onDownloadGpx}
        disabled={!canDownloadGpx}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #c7d2fe",
          background: "#eef2ff",
          color: canDownloadGpx ? "#3730a3" : "#94a3b8",
          cursor: canDownloadGpx ? "pointer" : "not-allowed",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Download GPX
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClearRoute();
        }}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #fecaca",
          background: "#fff1f2",
          color: "#b91c1c",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Clear Route
      </button>
    </div>
  );
}
