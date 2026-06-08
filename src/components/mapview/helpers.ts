// Pure helpers for MapView: geometry, GPX parsing, sampling and fetch utilities.
// These are side-effect free (aside from network in fetchJSON) and carry no
// component state.
import type { LatLng, LineLatLng, LonLat, WindPoint, WebcamItem, ElevPoint } from "./types";

export const isWebpPreviewUrl = (url?: string): boolean => {
  if (!url) return false;
  const value = String(url).toLowerCase();
  return value.includes(".webp") || value.includes("format=webp");
};

export function parseGpxTrackPoints(gpxText: string): LonLat[] {
  const doc = new DOMParser().parseFromString(gpxText, "application/xml");
  const nodes = Array.from(doc.getElementsByTagName("trkpt"));
  const out: LonLat[] = [];
  for (const node of nodes) {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (isValidCoordinate(lat, lon)) out.push([lon, lat]);
  }
  return out;
}

// Validate coordinates
export function isValidCoordinate(lat: number, lon: number): boolean {
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

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeDeg(v: number) {
  const x = v % 360;
  return x < 0 ? x + 360 : x;
}

export function bearingDeg(from: LatLng, to: LatLng): number {
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const dLon = ((to[1] - from[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

export function smallestAngleDiffDeg(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return d > 180 ? 360 - d : d;
}

export function cumulativeDistancesLatLng(route: LatLng[]): number[] {
  const n = route.length;
  const cum: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = route[i - 1];
    const b = route[i];
    cum[i] = cum[i - 1] + haversineMeters(a[0], a[1], b[0], b[1]);
  }
  return cum;
}

export function sliceBetweenLatLng(route: LatLng[], cum: number[], d0: number, d1: number): LatLng[] {
  const n = route.length;
  if (n < 2 || d1 <= d0) return [];
  const out: LatLng[] = [];
  let started = false;

  for (let i = 1; i < n; i++) {
    const a = route[i - 1];
    const b = route[i];
    const da = cum[i - 1];
    const db = cum[i];
    const segLen = db - da;
    if (segLen <= 0) continue;

    if (db < d0) continue;
    if (da > d1) break;

    if (!started) {
      if (d0 <= da) {
        out.push(a);
      } else {
        const t0 = (d0 - da) / segLen;
        out.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]);
      }
      started = true;
    }

    if (db >= d1) {
      const t1 = (d1 - da) / segLen;
      out.push([a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]);
      break;
    } else {
      out.push(b);
    }
  }

  return out.length >= 2 ? out : [];
}

export function nearestWindDirDeg(winds: WindPoint[], p: LatLng): number | undefined {
  let bestD2 = Number.POSITIVE_INFINITY;
  let best: number | undefined = undefined;
  for (const w of winds) {
    if (!Number.isFinite(w.lat) || !Number.isFinite(w.lon) || !Number.isFinite(w.dirDeg)) continue;
    const dx = w.lat - p[0];
    const dy = w.lon - p[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = w.dirDeg as number;
    }
  }
  return best;
}

export function webcamKeyOf(w: WebcamItem): string {
  if (w.id != null) return String(w.id);
  return `${w.lat.toFixed(6)},${w.lon.toFixed(6)}`;
}

export function sampleRoutePoints(route: LineLatLng, maxPoints = 8): { lat: number; lon: number }[] {
  if (route.length === 0) return [];
  if (route.length <= maxPoints) return route.map(([lat, lon]) => ({ lat, lon }));
  const step = Math.max(1, Math.floor((route.length - 1) / (maxPoints - 1)));
  const out: { lat: number; lon: number }[] = [];
  for (let i = 0; i < route.length; i += step) {
    const [lat, lon] = route[i];
    out.push({ lat, lon });
    if (out.length >= maxPoints - 1) break;
  }
  const last = route[route.length - 1];
  if (!out.length || out[out.length - 1].lat !== last[0] || out[out.length - 1].lon !== last[1]) {
    out.push({ lat: last[0], lon: last[1] });
  }
  return out.slice(0, maxPoints);
}

// Fetch JSON with retry and timeout
function absUrl(path: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return path.startsWith("http") ? path : `${base}${path}`;
}
const DEFAULT_TIMEOUT = process.env.NODE_ENV === "development" ? 45000 : 10000;
const MAX_RETRIES = 4;

export async function fetchJSON<T>(
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
export function nearestElevIndex(elevPts: ElevPoint[], lat: number, lon: number): number | null {
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
