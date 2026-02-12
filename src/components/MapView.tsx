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
import MapboxDirectionsControl from "@/components/MapboxDirectionsControl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LatLng = [number, number]; // [lat, lon]
type LineLatLng = LatLng[];

type WindPoint = WindPointType;
type ElevPoint = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };
type RouteSource = "planned" | "mapbox-directions";
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

function toLonLat(coord: [number, number]): [number, number] | null {
  const [a, b] = coord;
  const aLatLon = Math.abs(a) <= 90 && Math.abs(b) <= 180;
  const aLonLat = Math.abs(a) <= 180 && Math.abs(b) <= 90;
  if (aLonLat && !aLatLon) return [a, b];
  if (aLatLon) return [b, a];
  return null;
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
  // Waypoints [lon, lat]
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);

  // Map pick mode
  const [pickMode, setPickMode] = useState<"none" | "start" | "end" | "waypoint">("none");

  // Panel interaction
  const [cursorPt, setCursorPt] = useState<{ lat: number; lon: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [panelHoverIdx, setPanelHoverIdx] = useState<number | null>(null);

  // Show/hide panels
  const [showWebcams, setShowWebcams] = useState(true);
  const [showSegments, setShowSegments] = useState(true);
  const [showElevation, setShowElevation] = useState(true);
  const [routeDebug, setRouteDebug] = useState<RouteDebug | null>(null);

  const mapRef = useRef<MapRef | null>(null);

  const focusPt = useMemo(() => {
    if (focusIdx == null || !elevPts[focusIdx]) return null;
    const p = elevPts[focusIdx];
    return typeof p.lat === "number" && typeof p.lon === "number" ? { lat: p.lat, lon: p.lon } : null;
  }, [focusIdx, elevPts]);

  useEffect(() => {
    console.warn("MapView: mounted");
  }, []);

  useEffect(() => {
    if (!routeDebug) return;
    console.groupCollapsed(
      `[routing-debug] ${routeDebug.source} incoming=${routeDebug.incomingCount} merged=${routeDebug.mergedCount}`
    );
    console.log("routeDebug", routeDebug);
    console.log("sampleLonLat", routeDebug.sampleLonLat);
    console.groupEnd();
  }, [routeDebug]);

  useEffect(() => {
    console.warn("[MapView] elevPts updated", {
      count: elevPts.length,
      hasElevation: elevPts.filter((p) => typeof p.elevation === "number").length,
      sample: elevPts.slice(0, 3),
    });
  }, [elevPts]);

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

  // Fetch single leg coordinates using Mapbox Directions API
  async function fetchLegCoords(
    a: [number, number],
    b: [number, number]
  ): Promise<[number, number][]> {
    const r = await fetchJSON<{ geometry: { type: string; coordinates: [number, number][] } }>("/api/mapbox-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: a, end: b, profile: "cycling" }),
      timeoutMs: 45000,
    });
    const coordsRaw = r?.geometry?.coordinates ?? [];
    return coordsRaw.filter(([lon, lat]) => isValidCoordinate(lat, lon));
  }

  // Normalize a full route by sending raw coordinates to Mapbox route API
  async function fetchRouteFromCoords(coords: [number, number][]): Promise<[number, number][]> {
    const r = await fetchJSON<{ geometry: { type: string; coordinates: [number, number][] } }>("/api/mapbox-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords, profile: "cycling" }),
      timeoutMs: 45000,
    });
    const coordsRaw = r?.geometry?.coordinates ?? [];
    return coordsRaw.filter(([lon, lat]) => isValidCoordinate(lat, lon));
  }

  // Multi-point route planning
  const applyRouteFromLonLat = async (
    merged: [number, number][],
    meta: { source: RouteSource; incomingCount: number }
  ) => {
    console.log("[routing] applyRouteFromLonLat:start", {
      source: meta.source,
      incomingCount: meta.incomingCount,
      mergedCount: merged.length,
      first: merged[0],
      last: merged[merged.length - 1],
    });

    // Clear old wind arrows immediately
    setWinds([]);
    setElevPts([]);

    if (merged.length < 2) {
      console.warn("No valid merged coordinates");
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
      setWinds(windPoints);
      console.log("[routing] wind response", { count: windPoints.length });
    } catch {
      windRequestFailed = true;
      setWinds([]);
      console.error("[routing] wind request failed");
    }

    // Elevation (~300m intervals)
    let elevationPoints: ElevPoint[] = [];
    let elevationRequestFailed = false;
    try {
      console.log("[routing] elevation request starting", {
        mergedCount: merged.length,
        first: merged[0],
        last: merged[merged.length - 1],
      });
      const elevData = await fetchJSON<{ points: ElevPoint[] }>("/api/elevation?nocache=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords: merged, intervalMeters: 300, dataset: "srtm90m" }),
        timeoutMs: 30000,
      });
      elevationPoints = Array.isArray(elevData.points) ? elevData.points : [];
      setElevPts(elevationPoints);
      if (elevationPoints.length > 0) {
        setShowElevation(true);
      }
      console.log("[routing] elevation response", {
        returned: elevationPoints.length,
        valid: elevationPoints.filter((p) => typeof p.elevation === "number").length,
        errors: elevationPoints.filter((p) => p.error).length,
        sample: elevationPoints.slice(0, 3),
      });
    } catch (err) {
      elevationRequestFailed = true;
      setElevPts([]);
      console.error("[routing] elevation request failed", err instanceof Error ? err.message : String(err));
    }

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

      const merged: [number, number][] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const leg = await fetchLegCoords(points[i], points[i + 1]);
        if (!leg.length) continue;
        if (merged.length) {
          merged.push(...leg.slice(1));
        } else {
          merged.push(...leg);
        }
      }
      await applyRouteFromLonLat(merged, { source: "planned", incomingCount: merged.length });
    } catch (e) {
      console.error("Route plan failed", e);
    }
  };

  // Plan route when start/end change
  useEffect(() => {
    if (startLonLat && endLonLat) {
      const all: [number, number][] = [startLonLat, ...waypoints, endLonLat];
      void planRouteMulti(all);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLonLat, endLonLat, JSON.stringify(waypoints)]);

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
              writeQuery(v, endLonLat);
            } else if (role === "end") {
              setEndLonLat(v);
              writeQuery(startLonLat, v);
            } else {
              setWaypoints((prev) => [...prev, v]);
            }
            const s = role === "start" ? v : startLonLat;
            const e = role === "end" ? v : endLonLat;
            const wps = role === "waypoint" ? [...waypoints, v] : waypoints;
            if (s && e) void planRouteMulti([s, ...wps, e]);
          }}
          onDone={() => setPickMode("none")}
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
        {waypoints.map(([lon, lat], i) => (
          <Marker
            key={`wp-${i}`}
            longitude={lon}
            latitude={lat}
            color="#f59e0b"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setWaypoints((prev) => prev.filter((_, idx) => idx !== i));
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
      <div style={{ position: "absolute", left: 50, top: 12, zIndex: 1400 }}>
        {showWebcams ? (
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              color: "#1e293b",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: 6,
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
            >
              <span style={{ fontWeight: 600 }}>Webcams</span>
              <button onClick={() => setShowWebcams(false)} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>
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
          <button onClick={() => setShowWebcams(true)} style={{ fontSize: 12, padding: "2px 6px", background: "rgba(255,255,255,0.9)", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>
            Show Webcams
          </button>
        )}
      </div>

      {/* Mapbox Directions Control */}
      <MapboxDirectionsControl
        mapRef={mapRef}
        onRoute={(coords) => {
          console.warn("[routing] onRoute callback fired", { coordsCount: coords.length });
          if (coords.length <= 1) return;
          void (async () => {
            const mergedFromPlugin = coords
              .map((p) => toLonLat(p))
              .filter((p): p is [number, number] => p !== null)
              .filter(([lon, lat]) => isValidCoordinate(lat, lon));

            let merged = mergedFromPlugin;
            try {
              const mergedFromMapboxApi = await fetchRouteFromCoords(mergedFromPlugin);
              if (mergedFromMapboxApi.length > 1) {
                merged = mergedFromMapboxApi;
                console.warn("[routing] using mapbox-route geometry for elevation pipeline", {
                  pluginPoints: mergedFromPlugin.length,
                  mapboxRoutePoints: mergedFromMapboxApi.length,
                });
              }
            } catch (e) {
              console.error("[routing] mapbox-route normalization failed, fallback to plugin geometry", e);
            }

            await applyRouteFromLonLat(merged, {
              source: "mapbox-directions",
              incomingCount: coords.length,
            });
            const first = merged[0];
            const last = merged[merged.length - 1];
            writeQuery(
              first ? ([first[0], first[1]] as [number, number]) : null,
              last ? ([last[0], last[1]] as [number, number]) : null
            );
          })();
        }}
      />

      {/* Bottom-right: Segments + Wind legend */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          zIndex: 1200,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div>
          {showSegments ? (
            <div
              style={{
                background: "rgba(255,255,255,0.95)",
                color: "#1e293b",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                padding: 6,
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
              >
                <span style={{ fontWeight: 600 }}>Wing Sampling Segments</span>
                <button onClick={() => setShowSegments(false)} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>
                  ✖
                </button>
              </div>
              <SegmentationControls value={segmentMeters} onChange={setSegmentMeters} />
            </div>
          ) : (
            <button onClick={() => setShowSegments(true)} style={{ fontSize: 12, padding: "2px 6px", background: "rgba(255,255,255,0.9)", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>
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
            background: "rgba(255,255,255,0.95)",
            color: "#0f172a",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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
      <div style={{ position: "absolute", left: 65, bottom: 12, zIndex: 1200 }}>
        {showElevation ? (
          <div
            style={{
              background: "rgba(255,255,255,0.95)",
              color: "#1e293b",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: 6,
              maxHeight: "60vh",
              overflowY: "auto",
              minWidth: "250px",
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
            >
              <span style={{ fontWeight: 600 }}>Elevation {elevPts.length > 0 ? `(${elevPts.length})` : ""}</span>
              <button onClick={() => setShowElevation(false)} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>
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
          <button onClick={() => setShowElevation(true)} style={{ fontSize: 12, padding: "2px 6px", background: "rgba(255,255,255,0.9)", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>
            Show Elevation
          </button>
        )}
      </div>
    </div>
  );
}
