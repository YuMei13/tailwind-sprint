"use client";
import { useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl";
import mapboxgl from "mapbox-gl";
import type { IControl, Map as MapboxMap } from "mapbox-gl";

type MapboxDirectionsControlProps = {
  mapRef: React.RefObject<MapRef | null>;
  onRoute?: (coords: [number, number][]) => void;
  onAddStopClick?: () => void;
};

type DirectionsRouteEvent = {
  route?: Array<{
    geometry?: {
      coordinates?: [number, number][];
    };
  }>;
};

type MapboxDirectionsControlInstance = IControl & {
  on: (event: string, handler: (e: unknown) => void) => void;
  container?: HTMLElement | null;
  _container?: HTMLElement | null;
};

type MapboxDirectionsConstructor = new (options: {
  accessToken: string | undefined;
  alternatives?: boolean;
  geometries?: "geojson" | "polyline" | "polyline6";
  profile?: string;
  controls?: {
    profileSwitcher?: boolean;
  };
}) => MapboxDirectionsControlInstance;

declare global {
  interface Window {
    MapboxDirections?: MapboxDirectionsConstructor;
  }
}

export default function MapboxDirectionsControl({ mapRef, onRoute, onAddStopClick }: MapboxDirectionsControlProps) {
  const directionsRef = useRef<MapboxDirectionsControlInstance | null>(null);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializedRef = useRef(false);
  const initAttemptsRef = useRef(0);
  const onRouteRef = useRef<typeof onRoute>(onRoute);
  const mapInstanceRef = useRef<MapboxMap | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    onRouteRef.current = onRoute;
  }, [onRoute]);

  useEffect(() => {
    let isCancelled = false;

    const attemptInit = () => {
      if (isCancelled || isInitializedRef.current) return;
      initAttemptsRef.current += 1;
      const m = mapRef.current?.getMap?.();
      if (!m) {
        initTimerRef.current = setTimeout(attemptInit, 300);
        return;
      }
      mapInstanceRef.current = m;

      if (!m.isStyleLoaded()) {
        initTimerRef.current = setTimeout(attemptInit, 300);
        return;
      }

      // Check if plugin is ready
      const MapboxDir = window.MapboxDirections;
      const hasMapboxGl = Boolean((window as unknown as { mapboxgl?: unknown }).mapboxgl);
      if (!MapboxDir || !hasMapboxGl) {
        initTimerRef.current = setTimeout(attemptInit, 300);
        return;
      }

      try {
        // Remove existing
        if (directionsRef.current) {
          m.removeControl(directionsRef.current);
        }

        // Create control
        const directions = new MapboxDir({
          accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
          alternatives: false,
          geometries: "geojson",
          profile: "mapbox/cycling",
          controls: {
            profileSwitcher: false,
          },
        });

        directionsRef.current = directions;
        m.addControl(directions, "top-right");
        isInitializedRef.current = true;
        setIsReady(true);

        // Position it
        setTimeout(() => {
          const el = document.querySelector(".mapbox-gl-directions") as HTMLElement;
          if (el) {
            el.style.zIndex = "10001";
            el.style.position = "fixed";
            el.style.top = "12px";
            el.style.right = "12px";
            el.style.maxWidth = "380px";
          }
        }, 100);

        // Ensure map stays interactive
        try {
          m.dragPan?.enable?.();
          m.scrollZoom?.enable?.();
          m.boxZoom?.enable?.();
        } catch {
          // ignore
        }

        // Listen for routes from the directions control
        directions.on("route", (e: unknown) => {
          const ev = e as DirectionsRouteEvent;
          if (ev.route?.[0]?.geometry?.coordinates) {
            // Keep [lon, lat] order from Mapbox route geometry.
            const coords = ev.route[0].geometry.coordinates.map(
              ([lon, lat]: [number, number]) => [lon, lat] as [number, number]
            );
            onRouteRef.current?.(coords);
          }
        });

        directions.on("error", (e: unknown) => {
          console.error("MapboxDirectionsControl: plugin error event", e);
        });

        // Keep plugin route as the source of truth.
        // It already includes intermediate stops added in the Mapbox UI.

      } catch (err) {
        console.error("MapboxDirectionsControl error:", err);
      }
    };

    attemptInit();

    return () => {
      isCancelled = true;
      if (initTimerRef.current) clearTimeout(initTimerRef.current);
      try {
        const m = mapInstanceRef.current;
        const directions = directionsRef.current;
        const container = directions?.container ?? directions?._container;
        if (directions && container?.parentNode && m?.removeControl) {
          m.removeControl(directions);
        }
      } catch {
        // ignore
      }
      directionsRef.current = null;
      isInitializedRef.current = false;
      mapInstanceRef.current = null;
      setIsReady(false);
    };
  }, [mapRef]);

  // Load scripts once
  useEffect(() => {
    (window as unknown as { mapboxgl?: unknown }).mapboxgl = mapboxgl;

    const ensureScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
          if ((existing as HTMLScriptElement).dataset.loaded === "1") {
            resolve();
            return;
          }
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error(`Failed loading ${src}`)), {
            once: true,
          });
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.addEventListener(
          "load",
          () => {
            s.dataset.loaded = "1";
            resolve();
          },
          { once: true }
        );
        s.addEventListener("error", () => reject(new Error(`Failed loading ${src}`)), { once: true });
        document.head.appendChild(s);
      });

    // Turf
    void ensureScript("https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js").catch((err) => {
      console.error("MapboxDirectionsControl: turf load failed", err);
    });

    // Mapbox Directions JS
    void ensureScript(
      "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-directions/v4.3.0/mapbox-gl-directions.js"
    ).catch((err) => {
      console.error("MapboxDirectionsControl: directions plugin load failed", err);
    });

    // Mapbox Directions CSS
    if (!document.querySelector('link[href*="mapbox-gl-directions"]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-directions/v4.3.0/mapbox-gl-directions.css";
      document.head.appendChild(l);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        onAddStopClick?.();
        const api = directionsRef.current as unknown as {
          addWaypoint?: (index: number, waypoint?: unknown) => void;
          setWaypoint?: (index: number, waypoint?: unknown) => void;
          getWaypoints?: () => unknown[];
          getOrigin?: () => unknown;
          getDestination?: () => unknown;
        };
        if (!api?.addWaypoint) return;
        if (!api.getOrigin?.() || !api.getDestination?.()) {
          console.error("MapboxDirectionsControl: set origin and destination first");
          return;
        }
        const extractLonLat = (obj: unknown): [number, number] | null => {
          const maybe = obj as {
            geometry?: { coordinates?: unknown };
            feature?: { geometry?: { coordinates?: unknown } };
          };
          const fromObj = maybe?.geometry?.coordinates;
          const fromFeature = maybe?.feature?.geometry?.coordinates;
          const coord = fromObj ?? fromFeature;
          if (
            Array.isArray(coord) &&
            coord.length >= 2 &&
            Number.isFinite(coord[0]) &&
            Number.isFinite(coord[1])
          ) {
            return [Number(coord[0]), Number(coord[1])];
          }
          return null;
        };
        const waypoints = Array.isArray(api.getWaypoints?.()) ? api.getWaypoints!() : [];
        const count = waypoints.length;
        const insertIndex = Math.max(0, count - 1); // insert before destination
        const oldDestination =
          extractLonLat(api.getDestination?.()) ?? extractLonLat(waypoints[count - 1]);
        if (!oldDestination) return;
        const oldDestinationFeature = {
          type: "Feature",
          geometry: { type: "Point", coordinates: oldDestination },
          properties: { name: `Stop ${Math.max(1, count - 1)}` },
        };
        try {
          // Preferred behavior: add an empty stop field before destination.
          // User then fills the new stop and keeps destination (B) unchanged.
          try {
            api.addWaypoint(insertIndex);
            return;
          } catch {
            // continue
          }
          // Fallback for plugin versions that require a waypoint payload.
          // Insert current destination as waypoint; destination itself remains unchanged.
          try {
            api.addWaypoint(insertIndex, oldDestination);
            return;
          } catch {
            try {
              api.addWaypoint(insertIndex, oldDestinationFeature);
              return;
            } catch {
              api.addWaypoint(insertIndex);
              api.setWaypoint?.(insertIndex, oldDestination);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("MapboxDirectionsControl: failed to add waypoint:", msg);
        }
      }}
      disabled={!isReady}
      style={{
        position: "fixed",
        top: 12,
        right: 400,
        zIndex: 10002,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #cbd5e1",
        background: isReady ? "#ffffff" : "#f1f5f9",
        color: isReady ? "#0f172a" : "#94a3b8",
        fontSize: 13,
        fontWeight: 700,
        cursor: isReady ? "pointer" : "not-allowed",
      }}
      title="Add a stop to Mapbox Directions"
    >
      + Add Stop
    </button>
  );
}
