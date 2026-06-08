// Shared domain types for MapView and its helpers.
import type { WindPoint as RouteWindPoint } from "@/components/RouteWindLayer";

export type LatLng = [number, number]; // [lat, lon]
export type LineLatLng = LatLng[];
export type LonLat = [number, number];

export type WindPoint = RouteWindPoint;
export type ElevPoint = { lat: number; lon: number; elevation?: number; error?: true; msg?: string };
export type WebcamItem = {
  id?: string | number;
  provider?: "windy";
  title?: string;
  lat: number;
  lon: number;
  distance?: number;
  city?: string;
  region?: string;
  country?: string;
  detailUrl?: string;
  preview?: string;
};
export type RouteSource = "planned";
export type WaypointInput = { label: string; lonLat: LonLat | null };
export type PresetStop = { name: string; lonLat: LonLat };
export type RoutePreset = {
  id: string;
  name: string;
  description: string;
  stops: PresetStop[];
  gpxPath?: string;
};
export type RouteDebug = {
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
