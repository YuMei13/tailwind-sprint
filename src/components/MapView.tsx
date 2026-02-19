// src/components/MapView.tsx
"use client";

import Map, { Marker, Source, Layer, NavigationControl, MapRef } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapMouseEvent } from "mapbox-gl";
import RouteWindLayer, { WindPoint as WindPointType } from "@/components/RouteWindLayer";
import WindLegend from "@/components/WindLegend";
import ElevationPanel, { ElevPt } from "@/components/ElevationPanel";
import SegmentationControls from "@/components/SegmentationControls";
import WebcamsPanel, { WebcamItem } from "@/components/WebcamsPanel";
import MapboxRoutingPanel, { type Role as RoutingPanelRole } from "@/components/MapboxRoutingPanel";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LatLng = [number, number]; // [lat, lon]
type LineLatLng = LatLng[];
type LonLat = [number, number];

type WindPoint = WindPointType;
type ElevPoint = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };
type RouteSource = "planned";
type WaypointInput = { label: string; lonLat: LonLat | null };
type RouteDebug = {
  source: RouteSource;
  incomingCount: number;
  mergedCount: number;
  sampleLonLat: [number, number][];
  windCount: number;
  elevationReturned: number;
  elevationValid: number;
  elevationErrors: number;
  updatedAt: string;
  message?: string;
};

// Validate coordinates
function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

// Fetch JSON with retry and timeout
function absUrl(path: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return path.startsWith("http") ? path : `${base}${path}`;
}
const DEFAULT_TIMEOUT = process.env.NODE_ENV === "development" ? 45000 : 10000;
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
    } finally {
      clearTimeout(t);
    }
  };
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await once();
    } catch (e) {
      if (i === MAX_RETRIES - 1) throw e as Error;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

// Find nearest elevation index
function nearestElevIndex(elevPts: ElevPoint[], lat: number, lon: number): number | null {
  if (!elevPts.length) return null;
  let best = 0;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < elevPts.length; i++) {
    const p = elevPts[i];
    const dx = p.lat - lat;
    const dy = p.lon - lon;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

// Map interaction handler
function MapInteraction({
  onPickIndex,
  onHoverIndex,
  elevPts,
  mapRef,
  pickMode,
  onPick,
  onDone,
}: {
  onPickIndex: (idx: number | null) => void;
  onHoverIndex: (idx: number | null) => void;
  elevPts: ElevPoint[];
  mapRef: React.RefObject<MapRef | null>;
  pickMode: "none" | "start" | "end" | "waypoint";
  onPick: (role: "start" | "end" | "waypoint", lat: number, lon: number) => void;
  onDone: () => void;
}) {
  const rafRef = useRef<number | null>(null);
  const lastIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    
    const handleMouseMove = (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const idx = nearestElevIndex(elevPts, lat, lng);
        if (idx !== lastIdxRef.current) {
          lastIdxRef.current = idx;
          onHoverIndex(idx);
        }
      });
    };

    const handleMouseOut = () => {
      lastIdxRef.current = null;
      onHoverIndex(null);
    };

    const handleClick = (e: MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      
      if (pickMode !== "none") {
        onPick(pickMode, lat, lng);
        onDone();
      } else {
        onPickIndex(nearestElevIndex(elevPts, lat, lng));
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", handleMouseOut);
    map.on("click", handleClick);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", handleMouseOut);
      map.off("click", handleClick);
    };
  }, [elevPts, onHoverIndex, onPickIndex, pickMode, onPick, onDone, mapRef]);

  return null;
}

export default function MapView() {
  const toggleButtonStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    padding: "6px 10px",
    background: "rgba(15,23,42,0.9)",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 999,
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
    backdropFilter: "blur(2px)",
  };
  const closeButtonStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: "20px",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
    padding: 0,
  };
  const panelCardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.95)",
    color: "#1e293b",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    padding: 8,
  };
  const panelHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  };

  // === State ===
  const [route, setRoute] = useState<LineLatLng>([]);
  const [winds, setWinds] = useState<WindPoint[]>([]);
  const [elevPts, setElevPts] = useState<ElevPoint[]>([]);
  const [segmentMeters, setSegmentMeters] = useState<number>(500);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({
    lat: 25.05,
    lon: 121.52,
  });
  const [zoom, setZoom] = useState<number>(13);
  const [webcamFlyTarget, setWebcamFlyTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [webcams, setWebcams] = useState<WebcamItem[]>([]);

  // Start/End [lon, lat]
  const [startLonLat, setStartLonLat] = useState<[number, number] | null>(null);
  const [endLonLat, setEndLonLat] = useState<[number, number] | null>(null);
  const [startLabel, setStartLabel] = useState("");
  const [endLabel, setEndLabel] = useState("");
  const [waypointInputs, setWaypointInputs] = useState<WaypointInput[]>([]);

  // Map pick mode
  const [pickMode, setPickMode] = useState<"none" | "start" | "end" | "waypoint">("none");
  const [pendingWaypointIndex, setPendingWaypointIndex] = useState<number | null>(null);

  // Panel interaction
  const [cursorPt, setCursorPt] = useState<{ lat: number; lon: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [panelHoverIdx, setPanelHoverIdx] = useState<number | null>(null);

  // Show/hide panels
  const [showWebcams, setShowWebcams] = useState(true);
  const [showSegments, setShowSegments] = useState(true);
  const [showElevation, setShowElevation] = useState(true);
  const [routeDebug, setRouteDebug] = useState<RouteDebug | null>(null);
  const latestRouteReqRef = useRef<number>(0);

  const mapRef = useRef<MapRef | null>(null);

  const focusPt = useMemo(() => {
    if (focusIdx == null || !elevPts[focusIdx]) return null;
    const p = elevPts[focusIdx];
    return typeof p.lat === "number" && typeof p.lon === "number" ? { lat: p.lat, lon: p.lon } : null;
  }, [focusIdx, elevPts]);

  // === URL Read/Write ===
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const parse = (v: string | null): [number, number] | null => {
      if (!v) return null;
      const [latS, lonS] = v.split(",");
      const lat = Number(latS);
      const lon = Number(lonS);
      return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
    };
    const s = parse(searchParams.get("start"));
    const e = parse(searchParams.get("end"));
    if (s) setStartLonLat(s);
    if (e) setEndLonLat(e);
    if (s && e) setMapCenter({ lat: (s[1] + e[1]) / 2, lon: (s[0] + e[0]) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear URL params on mount to start fresh
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (sp.has("start") || sp.has("end")) {
      sp.delete("start");
      sp.delete("end");
      const newParams = sp.toString();
      router.replace(newParams ? `${pathname}?${newParams}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeQuery = (start: [number, number] | null, end: [number, number] | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    const fmt = (p: [number, number]) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`; // lat,lon
    if (start) sp.set("start", fmt(start));
    else sp.delete("start");
    if (end) sp.set("end", fmt(end));
    else sp.delete("end");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  async function fetchLegCoords(a: LonLat, b: LonLat): Promise<LonLat[]> {
    const r = await fetchJSON<{
      geometry: { type: string; coordinates: [number, number][] };
    }>("/api/mapbox-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [a, b], profile: "cycling" }),
        timeoutMs: 45000,
      });
    return (r?.geometry?.coordinates ?? []).filter(([lon, lat]) =>
      isValidCoordinate(lat, lon)
    );
  }

  function sameLonLat(a: LonLat, b: LonLat) {
    return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  }

  // Multi-point route planning
  const applyRouteFromLonLat = async (
    merged: [number, number][],
    meta: { source: RouteSource; incomingCount: number },
    requestId: number
  ) => {
    if (requestId !== latestRouteReqRef.current) return;

    // Keep existing wind/elevation until fresh results are ready.

    if (merged.length < 2) {
      if (requestId !== latestRouteReqRef.current) return;
      setRoute([]);
      setWinds([]);
      setElevPts([]);
      setRouteDebug({
        source: meta.source,
        incomingCount: meta.incomingCount,
        mergedCount: 0,
        sampleLonLat: [],
        windCount: 0,
        elevationReturned: 0,
        elevationValid: 0,
        elevationErrors: 0,
        updatedAt: new Date().toISOString(),
        message: "No valid merged coordinates",
      });
      return;
    }

    // Set route (convert to [lat, lon])
    const line: [number, number][] = merged.map(([lon, lat]) => [lat, lon]);
    if (requestId !== latestRouteReqRef.current) return;
    setRoute(line);

    // Wind: sample ~40 points
    const step = Math.max(1, Math.floor(merged.length / 40));
    const sample = merged.filter((_, i) => i % step === 0).map(([lon, lat]) => [lat, lon]);
    const last = merged[merged.length - 1];
    const lastS = sample[sample.length - 1];
    if (!lastS || lastS[0] !== last[1] || lastS[1] !== last[0]) {
      sample.push([last[1], last[0]]);
    }
    let windPoints: WindPoint[] = [];
    let windRequestFailed = false;
    try {
      const windData = await fetchJSON<{ points?: WindPoint[] }>("/api/wind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: sample }),
        timeoutMs: 30000,
      });
      windPoints = Array.isArray(windData.points) ? windData.points : [];
      if (requestId !== latestRouteReqRef.current) return;
      setWinds(windPoints);
    } catch {
      windRequestFailed = true;
      if (requestId !== latestRouteReqRef.current) return;
      setWinds([]);
      console.error("[routing] wind request failed");
    }

    // Elevation (~300m intervals)
    let elevationPoints: ElevPoint[] = [];
    let elevationRequestFailed = false;
    try {
      const elevData = await fetchJSON<{ points: ElevPoint[] }>("/api/elevation?nocache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords: merged, intervalMeters: 300, dataset: "srtm90m" }),
        timeoutMs: 30000,
      });
      elevationPoints = Array.isArray(elevData.points) ? elevData.points : [];
      if (requestId !== latestRouteReqRef.current) return;
      if (elevationPoints.length > 0) {
        setElevPts(elevationPoints);
      }
      if (elevationPoints.length > 0) {
        setShowElevation(true);
      }
    } catch (err) {
      elevationRequestFailed = true;
      if (requestId !== latestRouteReqRef.current) return;
      console.error("[routing] elevation request failed", err instanceof Error ? err.message : String(err));
    }

    if (requestId !== latestRouteReqRef.current) return;
    const sampleLonLat = [...merged.slice(0, 3), ...merged.slice(-3)];
    const elevationValid = elevationPoints.filter((p) => typeof p.elevation === "number").length;
    const elevationErrors = elevationPoints.filter((p) => p.error).length;
    setRouteDebug({
      source: meta.source,
      incomingCount: meta.incomingCount,
      mergedCount: merged.length,
      sampleLonLat,
      windCount: windPoints.length,
      elevationReturned: elevationPoints.length,
      elevationValid,
      elevationErrors,
      updatedAt: new Date().toISOString(),
      message: elevationRequestFailed
        ? "Elevation request failed"
        : elevationValid > 0
          ? windRequestFailed
            ? "Wind request failed"
            : undefined
          : "Elevation API returned no numeric elevations",
    });

    // Center view
    const mid = line[Math.floor(line.length / 2)];
    if (mid) setMapCenter({ lat: mid[0], lon: mid[1] });

    // Clear interaction state
    setCursorPt(null);
    setFocusIdx(null);
    setPanelHoverIdx(null);
  };

  const planRouteMulti = async (points: [number, number][]) => {
    try {
      if (points.length < 2) return;
      const requestId = ++latestRouteReqRef.current;
      const merged: LonLat[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const leg = await fetchLegCoords(points[i], points[i + 1]);
        if (requestId !== latestRouteReqRef.current) return;
        if (leg.length < 2) continue;
        if (merged.length === 0) {
          merged.push(...leg);
          continue;
        }
        const first = leg[0];
        const tail = sameLonLat(merged[merged.length - 1], first) ? leg.slice(1) : leg;
        merged.push(...tail);
      }
      if (merged.length < 2) {
        throw new Error("No valid route legs returned for input stop order");
      }
      await applyRouteFromLonLat(
        merged,
        { source: "planned", incomingCount: points.length },
        requestId
      );
    } catch (e) {
      console.error("Route plan failed", e);
    }
  };

  const moveWaypoint = (fromIndex: number, toIndex: number) => {
    setWaypointInputs((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moving] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moving);
      return next;
    });
  };

  const beginMapPick = (role: "start" | "end" | "waypoint", wpIdx?: number) => {
    if (role === "waypoint") {
      setPendingWaypointIndex(typeof wpIdx === "number" ? wpIdx : null);
      setPickMode("waypoint");
      return;
    }
    setPendingWaypointIndex(null);
    setPickMode(role);
  };

  const clearStart = () => {
    setStartLonLat(null);
    setStartLabel("");
    writeQuery(null, endLonLat);
    setPickMode("none");
    setPendingWaypointIndex(null);
  };

  const clearEnd = () => {
    setEndLonLat(null);
    setEndLabel("");
    writeQuery(startLonLat, null);
    setPickMode("none");
    setPendingWaypointIndex(null);
  };

  const moveStartDown = () => {
    if (!startLonLat || waypointInputs.length === 0) return;
    const first = waypointInputs[0];
    if (!first.lonLat) return;
    const oldStart = startLonLat;
    const oldStartLabel = startLabel || `${startLonLat[1].toFixed(5)}, ${startLonLat[0].toFixed(5)}`;
    setStartLonLat(first.lonLat);
    setStartLabel(first.label || `${first.lonLat[1].toFixed(5)}, ${first.lonLat[0].toFixed(5)}`);
    setWaypointInputs((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { label: oldStartLabel, lonLat: oldStart };
      return next;
    });
  };

  const moveEndUp = () => {
    if (!endLonLat || waypointInputs.length === 0) return;
    const lastIdx = waypointInputs.length - 1;
    const last = waypointInputs[lastIdx];
    if (!last.lonLat) return;
    const oldEnd = endLonLat;
    const oldEndLabel = endLabel || `${endLonLat[1].toFixed(5)}, ${endLonLat[0].toFixed(5)}`;
    setEndLonLat(last.lonLat);
    setEndLabel(last.label || `${last.lonLat[1].toFixed(5)}, ${last.lonLat[0].toFixed(5)}`);
    setWaypointInputs((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[lastIdx] = { label: oldEndLabel, lonLat: oldEnd };
      return next;
    });
  };

  // Plan route when start/end change
  useEffect(() => {
    const waypointCoords = waypointInputs
      .map((w) => w.lonLat)
      .filter((v): v is LonLat => Array.isArray(v));
    if (startLonLat && endLonLat) {
      const all: [number, number][] = [startLonLat, ...waypointCoords, endLonLat];
      void planRouteMulti(all);
      return;
    }
    setRoute([]);
    setWinds([]);
    setElevPts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLonLat, endLonLat, JSON.stringify(waypointInputs)]);

  const displayWaypoints = useMemo(
    () =>
      waypointInputs
        .map((wp, idx) => ({ idx, lonLat: wp.lonLat }))
        .filter((wp): wp is { idx: number; lonLat: LonLat } => Array.isArray(wp.lonLat)),
    [waypointInputs]
  );

  // Fly to target
  useEffect(() => {
    if (!mapRef.current || !focusPt) return;
    const map = mapRef.current.getMap();
    map.flyTo({
      center: [focusPt.lon, focusPt.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 800,
    });
  }, [focusPt]);

  useEffect(() => {
    if (!mapRef.current || !webcamFlyTarget) return;
    const map = mapRef.current.getMap();
    map.flyTo({
      center: [webcamFlyTarget.lon, webcamFlyTarget.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 800,
    });
  }, [webcamFlyTarget]);

  const routeGeoJSON = useMemo(() => {
    if (route.length < 2) return null;
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: route.map(([lat, lon]) => [lon, lat]),
      },
      properties: {},
    };
  }, [route]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: mapCenter.lon,
          latitude: mapCenter.lat,
          zoom: zoom,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        onMove={(evt) => {
          setMapCenter({ lat: evt.viewState.latitude, lon: evt.viewState.longitude });
          setZoom(evt.viewState.zoom);
        }}
      >
        <NavigationControl position="top-left" />

        <MapInteraction
          mapRef={mapRef}
          elevPts={elevPts}
          onPickIndex={(idx) => {
            if (typeof idx === "number") setFocusIdx((p) => (p === idx ? p : idx));
          }}
          onHoverIndex={(idx) => {
            setPanelHoverIdx((p) => (p === idx ? p : idx));
          }}
          pickMode={pickMode}
          onPick={(role, lat, lon) => {
            const v: [number, number] = [lon, lat];
            if (role === "start") {
              setStartLonLat(v);
              setStartLabel(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
              writeQuery(v, endLonLat);
            } else if (role === "end") {
              setEndLonLat(v);
              setEndLabel(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
              writeQuery(startLonLat, v);
            } else {
              setWaypointInputs((prev) => {
                if (typeof pendingWaypointIndex === "number") {
                  const next = [...prev];
                  while (next.length <= pendingWaypointIndex) {
                    next.push({ label: `Stop ${next.length + 1}`, lonLat: null });
                  }
                  next[pendingWaypointIndex] = {
                    label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                    lonLat: v,
                  };
                  return next;
                }
                return [
                  ...prev,
                  { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lonLat: v },
                ];
              });
            }
          }}
          onDone={() => {
            setPickMode("none");
            setPendingWaypointIndex(null);
          }}
        />

        {/* Start marker */}
        {startLonLat && (
          <Marker longitude={startLonLat[0]} latitude={startLonLat[1]} color="#22c55e" />
        )}

        {/* End marker */}
        {endLonLat && (
          <Marker longitude={endLonLat[0]} latitude={endLonLat[1]} color="#ef4444" />
        )}

        {/* Waypoint markers */}
        {displayWaypoints.map(({ idx, lonLat: [lon, lat] }) => (
          <Marker
            key={`wp-${idx}`}
            longitude={lon}
            latitude={lat}
            color="#f59e0b"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setWaypointInputs((prev) => prev.filter((_, i) => i !== idx));
            }}
          />
        ))}

        {/* Webcam markers */}
        {webcams.map((w) => (
          <Marker
            key={`cam-${w.id || w.lat.toFixed(5)}-${w.lon.toFixed(5)}`}
            longitude={w.lon}
            latitude={w.lat}
            color="#0284c7"
          />
        ))}

        {/* Route line */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer
              id="route-line"
              type="line"
              paint={{
                "line-color": "#3b82f6",
                "line-width": 3,
              }}
            />
          </Source>
        )}

        {/* Route with wind coloring */}
        {route.length > 0 && (
          <RouteWindLayer route={route} winds={winds} weight={6} segmentMeters={segmentMeters} />
        )}

        {/* Cursor highlight */}
        {cursorPt && (
          <Source
            id="cursor-point"
            type="geojson"
            data={{
              type: "Feature",
              geometry: { type: "Point", coordinates: [cursorPt.lon, cursorPt.lat] },
              properties: {},
            }}
          >
            <Layer
              id="cursor-point-layer"
              type="circle"
              paint={{
                "circle-radius": 6,
                "circle-color": "#a5b4fc",
                "circle-stroke-color": "#6366f1",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
        )}

        {/* Focus highlight */}
        {focusPt && (
          <Source
            id="focus-point"
            type="geojson"
            data={{
              type: "Feature",
              geometry: { type: "Point", coordinates: [focusPt.lon, focusPt.lat] },
              properties: {},
            }}
          >
            <Layer
              id="focus-point-layer"
              type="circle"
              paint={{
                "circle-radius": 7,
                "circle-color": "#60a5fa",
                "circle-stroke-color": "#1d4ed8",
                "circle-stroke-width": 3,
              }}
            />
          </Source>
        )}
      </Map>

      {/* Left top: Webcams panel */}
      <div style={{ position: "absolute", left: 50, top: 12, zIndex: 1600 }}>
        {showWebcams ? (
          <div style={panelCardStyle}>
            <div style={panelHeaderStyle}>
              <span style={{ fontWeight: 600 }}>Webcams</span>
              <button onClick={() => setShowWebcams(false)} style={closeButtonStyle} aria-label="Close webcams panel">
                ✖
              </button>
            </div>
            <WebcamsPanel
              center={mapCenter}
              onPick={(lat, lon) => {
                setFocusIdx(null);
                setWebcamFlyTarget({ lat, lon });
              }}
              onLoaded={setWebcams}
            />
          </div>
        ) : (
          <button onClick={() => setShowWebcams(true)} style={toggleButtonStyle}>
            Show Webcams
          </button>
        )}
      </div>

      <div style={{ position: "absolute", right: 12, top: 12, zIndex: 1400 }}>
        <div style={panelCardStyle}>
          <MapboxRoutingPanel
            center={mapCenter}
            startLatLon={startLonLat}
            startLabel={startLabel}
            endLatLon={endLonLat}
            endLabel={endLabel}
            waypoints={waypointInputs.map((w) => ({ label: w.label, latLon: w.lonLat }))}
            onWaypointsChange={(next) =>
              setWaypointInputs(next.map((w) => ({ label: w.label, lonLat: w.latLon ?? null })))
            }
            onMoveWaypoint={moveWaypoint}
            onClearStart={clearStart}
            onClearEnd={clearEnd}
            onMoveStartDown={moveStartDown}
            onMoveEndUp={moveEndUp}
            onPickOnMap={(role, wpIdx) => beginMapPick(role, wpIdx)}
            pickMode={pickMode}
            pendingWaypointIndex={pendingWaypointIndex}
            onPick={(role: RoutingPanelRole, lat, lon, label, wpIdx) => {
              const v: LonLat = [lon, lat];
              if (role === "start") {
                setStartLonLat(v);
                setStartLabel(label);
                writeQuery(v, endLonLat);
                return;
              }
              if (role === "end") {
                setEndLonLat(v);
                setEndLabel(label);
                writeQuery(startLonLat, v);
                return;
              }
              if (typeof wpIdx !== "number") return;
              setWaypointInputs((prev) => {
                const next = [...prev];
                while (next.length <= wpIdx) {
                  next.push({ label: `Stop ${next.length + 1}`, lonLat: null });
                }
                next[wpIdx] = { label, lonLat: v };
                return next;
              });
            }}
          />
        </div>
      </div>

      {/* Bottom-right: Segments + Wind legend */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          zIndex: 1600,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div>
          {showSegments ? (
            <div style={panelCardStyle}>
              <div style={panelHeaderStyle}>
                <span style={{ fontWeight: 600 }}>Wind Sampling Segments</span>
                <button onClick={() => setShowSegments(false)} style={closeButtonStyle} aria-label="Close segments panel">
                  ✖
                </button>
              </div>
              <SegmentationControls value={segmentMeters} onChange={setSegmentMeters} />
            </div>
          ) : (
            <button onClick={() => setShowSegments(true)} style={toggleButtonStyle}>
              Show Segments
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#1e293b" }}>
          <WindLegend />
        </div>
      </div>

      {/* Left middle: Routing debug */}
      {routeDebug && (
        <div
          style={{
            position: "absolute",
            left: 65,
            top: 210,
            zIndex: 1300,
            ...panelCardStyle,
            padding: 8,
            maxWidth: 560,
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Routing Data</div>
          <div>source: {routeDebug.source}</div>
          <div>incoming points: {routeDebug.incomingCount}</div>
          <div>merged points: {routeDebug.mergedCount}</div>
          <div>wind points: {routeDebug.windCount}</div>
          <div>elevation returned: {routeDebug.elevationReturned}</div>
          <div>elevation valid: {routeDebug.elevationValid}</div>
          <div>elevation error points: {routeDebug.elevationErrors}</div>
          {routeDebug.message && <div style={{ color: "#b91c1c" }}>message: {routeDebug.message}</div>}
          <div>updated: {new Date(routeDebug.updatedAt).toLocaleTimeString()}</div>
        </div>
      )}

      {/* Left bottom: Elevation panel */}
      <div style={{ position: "absolute", left: 65, bottom: 12, zIndex: 1600 }}>
        {showElevation ? (
          <div
            style={{
              ...panelCardStyle,
              padding: 6,
              maxHeight: "60vh",
              overflowY: "auto",
              minWidth: "250px",
            }}
          >
            <div style={panelHeaderStyle}>
              <span style={{ fontWeight: 600 }}>Elevation {elevPts.length > 0 ? `(${elevPts.length})` : ""}</span>
              <button onClick={() => setShowElevation(false)} style={closeButtonStyle} aria-label="Close elevation panel">
                ✖
              </button>
            </div>
            {/* Debug info */}
            <div style={{ fontSize: 11, color: "#999", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 4 }}>
              Points: {elevPts.length} | Valid: {elevPts.filter((p) => typeof p.elevation === "number").length}
            </div>
            {elevPts.length === 0 ? (
              <div style={{ fontSize: 12, color: "#666", padding: "8px 0" }}>
                No elevation data. Draw a route to see the elevation profile.
              </div>
            ) : (
              <ElevationPanel
                points={elevPts as ElevPt[]}
                selectedIndex={focusIdx}
                externalHoverIndex={panelHoverIdx}
                onHover={(pt) => {
                  setCursorPt(
                    pt && typeof pt.lat === "number" && typeof pt.lon === "number"
                      ? { lat: pt.lat, lon: pt.lon }
                      : null
                  );
                }}
                onLeave={() => setCursorPt(null)}
                onClick={(_, idx) => {
                  if (typeof idx === "number") setFocusIdx((p) => (p === idx ? p : idx));
                }}
              />
            )}
          </div>
        ) : (
          <button onClick={() => setShowElevation(true)} style={toggleButtonStyle}>
            Show Elevation
          </button>
        )}
      </div>
    </div>
  );
}
