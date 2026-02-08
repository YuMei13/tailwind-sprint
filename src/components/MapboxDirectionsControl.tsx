"use client";
import { useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl";
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
  on: (event: "route", handler: (e: DirectionsRouteEvent) => void) => void;
  container?: HTMLElement | null;
  _container?: HTMLElement | null;
};

type MapboxDirectionsConstructor = new (options: {
  accessToken: string | undefined;
  alternatives?: boolean;
  geometries?: "geojson" | "polyline" | "polyline6";
  profile?: string;
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
  const onRouteRef = useRef<typeof onRoute>(onRoute);
  const mapInstanceRef = useRef<MapboxMap | null>(null);

  useEffect(() => {
    onRouteRef.current = onRoute;
  }, [onRoute]);

  useEffect(() => {
    let isCancelled = false;

    const attemptInit = () => {
      if (isCancelled || isInitializedRef.current) return;
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
      if (!MapboxDir) {
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
        });

        directionsRef.current = directions;
        m.addControl(directions, "top-right");
        isInitializedRef.current = true;
        console.log("MapboxDirectionsControl: initialized successfully");

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
        directions.on("route", (e: DirectionsRouteEvent) => {
          if (e.route?.[0]?.geometry?.coordinates) {
            const coords = e.route[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]);
            onRouteRef.current?.(coords);
          }
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
    // Turf
    if (!document.querySelector('script[src*="turf"]')) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js";
      s.async = true;
      document.head.appendChild(s);
    }

    // Mapbox Directions JS
    if (!document.querySelector('script[src*="mapbox-gl-directions"]')) {
      const s = document.createElement("script");
      s.src = "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-directions/v4.3.0/mapbox-gl-directions.js";
      s.async = true;
      document.head.appendChild(s);
    }

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
