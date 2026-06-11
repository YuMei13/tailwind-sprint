import { apiFetch } from "@/lib/apiFetch";

export type LonLat = [number, number];

export type ManagedStop = {
  id: string;
  label: string;
  lonLat: LonLat;
};

export type MultiStopRouteState = {
  start: ManagedStop | null;
  end: ManagedStop | null;
  stops: ManagedStop[];
};

export type MultiStopAction =
  | { type: "set-start"; stop: ManagedStop | null }
  | { type: "set-end"; stop: ManagedStop | null }
  | { type: "add-stop"; stop: ManagedStop; index?: number }
  | { type: "update-stop"; id: string; patch: Partial<ManagedStop> }
  | { type: "remove-stop"; id: string }
  | { type: "move-stop"; id: string; toIndex: number }
  | { type: "clear-all" };

export type MultiStopRouteResult = {
  state: MultiStopRouteState;
  coordinates: LonLat[];
  canRoute: boolean;
  reason?: string;
};

export const MAPBOX_MAX_COORDINATES = 25;

export function createManagedStop(label: string, lonLat: LonLat, id?: string): ManagedStop {
  return {
    id: id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    label,
    lonLat,
  };
}

export function isValidLonLat(value: unknown): value is LonLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function cloneState(state: MultiStopRouteState): MultiStopRouteState {
  return {
    start: state.start ? { ...state.start } : null,
    end: state.end ? { ...state.end } : null,
    stops: state.stops.map((s) => ({ ...s })),
  };
}

export function buildDirectionsCoordinates(state: MultiStopRouteState): LonLat[] {
  const coords: LonLat[] = [];
  if (state.start && isValidLonLat(state.start.lonLat)) {
    coords.push(state.start.lonLat);
  }
  for (const stop of state.stops) {
    if (isValidLonLat(stop.lonLat)) {
      coords.push(stop.lonLat);
    }
  }
  if (state.end && isValidLonLat(state.end.lonLat)) {
    coords.push(state.end.lonLat);
  }
  return coords;
}

export function applyMultiStopAction(
  state: MultiStopRouteState,
  action: MultiStopAction
): MultiStopRouteResult {
  const next = cloneState(state);

  switch (action.type) {
    case "set-start": {
      next.start = action.stop ? { ...action.stop } : null;
      break;
    }
    case "set-end": {
      next.end = action.stop ? { ...action.stop } : null;
      break;
    }
    case "add-stop": {
      const idx =
        typeof action.index === "number"
          ? clamp(action.index, 0, next.stops.length)
          : next.stops.length;
      next.stops.splice(idx, 0, { ...action.stop });
      break;
    }
    case "update-stop": {
      if (next.start?.id === action.id) {
        next.start = { ...next.start, ...action.patch };
        break;
      }
      if (next.end?.id === action.id) {
        next.end = { ...next.end, ...action.patch };
        break;
      }
      const i = next.stops.findIndex((s) => s.id === action.id);
      if (i >= 0) next.stops[i] = { ...next.stops[i], ...action.patch };
      break;
    }
    case "remove-stop": {
      if (next.start?.id === action.id) {
        next.start = null;
        break;
      }
      if (next.end?.id === action.id) {
        next.end = null;
        break;
      }
      next.stops = next.stops.filter((s) => s.id !== action.id);
      break;
    }
    case "move-stop": {
      const fromIndex = next.stops.findIndex((s) => s.id === action.id);
      if (fromIndex < 0) break;
      const toIndex = clamp(action.toIndex, 0, next.stops.length - 1);
      if (fromIndex === toIndex) break;
      const [moving] = next.stops.splice(fromIndex, 1);
      next.stops.splice(toIndex, 0, moving);
      break;
    }
    case "clear-all": {
      next.start = null;
      next.end = null;
      next.stops = [];
      break;
    }
    default: {
      const _never: never = action;
      return {
        state: next,
        coordinates: buildDirectionsCoordinates(next),
        canRoute: false,
        reason: `Unhandled action: ${String(_never)}`,
      };
    }
  }

  return {
    state: next,
    ...getMultiStopRouteStatus(next),
  };
}

export function getMultiStopRouteStatus(state: MultiStopRouteState): {
  coordinates: LonLat[];
  canRoute: boolean;
  reason?: string;
} {
  const coordinates = buildDirectionsCoordinates(state);
  if (coordinates.length < 2) {
    return {
      coordinates,
      canRoute: false,
      reason: "Start and end are required to route.",
    };
  }

  if (coordinates.length > MAPBOX_MAX_COORDINATES) {
    return {
      coordinates,
      canRoute: false,
      reason: `Mapbox Directions supports up to ${MAPBOX_MAX_COORDINATES} coordinates.`,
    };
  }

  return { coordinates, canRoute: true };
}

export async function fetchManagedMultiStopRoute(
  state: MultiStopRouteState,
  init?: RequestInit
): Promise<{ geometry: { type: string; coordinates: LonLat[] } }> {
  const { canRoute, coordinates, reason } = getMultiStopRouteStatus(state);

  if (!canRoute) {
    throw new Error(reason ?? "Unable to compute route for current stops.");
  }

  const response = await apiFetch("/api/mapbox-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates, profile: "cycling" }),
    ...init,
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`mapbox-route ${response.status} ${txt}`.trim());
  }

  const data = (await response.json()) as { geometry?: { type: string; coordinates: LonLat[] } };
  if (!data.geometry || !Array.isArray(data.geometry.coordinates)) {
    throw new Error("mapbox-route returned invalid geometry");
  }

  return { geometry: data.geometry };
}
