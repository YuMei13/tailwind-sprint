"use client";
import { useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl";
import mapboxgl from "mapbox-gl";
import type { IControl, Map as MapboxMap } from "mapbox-gl";

type MapboxDirectionsControlProps = {
  mapRef: React.RefObject<MapRef | null>;
  onRoute?: (coords: [number, number][]) => void;
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

export default function MapboxDirectionsControl({ mapRef, onRoute }: MapboxDirectionsControlProps) {
  const directionsRef = useRef<MapboxDirectionsControlInstance | null>(null);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializedRef = useRef(false);
  const initAttemptsRef = useRef(0);
  const onRouteRef = useRef<typeof onRoute>(onRoute);
  const mapInstanceRef = useRef<MapboxMap | null>(null);

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
          alternatives: true,
          geometries: "geojson",
          profile: "mapbox/cycling",
          controls: {
            profileSwitcher: false,
          },
        });

        directionsRef.current = directions;
        m.addControl(directions, "top-right");
        isInitializedRef.current = true;

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
            const coords = ev.route[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]);
            onRouteRef.current?.(coords);
          }
        });

        directions.on("error", (e: unknown) => {
          console.error("MapboxDirectionsControl: plugin error event", e);
        });

        // Track origin/destination features and fetch a normalized route
        const originRef: { current: [number, number] | null } = { current: null };
        const destRef: { current: [number, number] | null } = { current: null };
        let lastRouteKey = "";

        const extractFeatureCoord = (evt: unknown): [number, number] | null => {
          try {
            const maybeEvent = evt as {
              feature?: { geometry?: { coordinates?: unknown } };
              geometry?: { coordinates?: unknown };
            };
            const f = maybeEvent?.feature ?? maybeEvent;
            const coord = f?.geometry?.coordinates;
            if (Array.isArray(coord) && coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
              return [coord[0], coord[1]] as [number, number];
            }
          } catch {
            // ignore
          }
          return null;
        };

        const tryFetchNormalizedRoute = async () => {
          const o = originRef.current;
          const d = destRef.current;
          if (!o || !d) return;
          const key = `${o[0]},${o[1]}|${d[0]},${d[1]}`;
          if (key === lastRouteKey) return;
          lastRouteKey = key;
          try {
            const res = await fetch("/api/mapbox-route", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ start: o, end: d, profile: "cycling" }),
            });
            const json = await res.json();
            const coordsRaw = Array.isArray(json?.geometry?.coordinates) ? json.geometry.coordinates : [];
            if (!coordsRaw.length) return;
            // map [lon, lat] -> [lat, lon] to match existing onRoute expectations
            const coords = coordsRaw.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]);
            onRouteRef.current?.(coords);
          } catch (err) {
            console.error("MapboxDirectionsControl: failed to fetch normalized route", err instanceof Error ? err.message : String(err));
          }
        };

        directions.on("origin", (e: unknown) => {
          const c = extractFeatureCoord(e);
          originRef.current = c;
          void tryFetchNormalizedRoute();
        });

        directions.on("destination", (e: unknown) => {
          const c = extractFeatureCoord(e);
          destRef.current = c;
          void tryFetchNormalizedRoute();
        });

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

  return null;
}
