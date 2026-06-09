# MapView decomposition plan

`src/components/MapView.tsx` is ~2100 lines. The module-level prelude (types,
route presets, pure helpers) has already been extracted to
`src/components/mapview/`. What remains is the component body: **~25 `useState`,
~13 `useRef`, ~12 `useEffect`/`useMemo`/`useCallback`, and a large JSX return**.

This document plans the **next, riskier phase**: pulling the stateful logic into
custom hooks and the presentational JSX into sub-components — **without changing
behavior**.

## Why this needs care (not a blind refactor)

The component has **4 intentional `react-hooks/exhaustive-deps` disables**. They
are not bugs — they encode deliberate dependency choices that MUST be preserved
verbatim when code moves into a hook:

| Line | Effect | Deps | Why disabled |
|---|---|---|---|
| ~546 | Read `start`/`end` from URL | `[]` | mount-only |
| ~558 | Clear URL params | `[]` | mount-only |
| ~1323 | Auto-plan route | `[startLonLat, endLonLat, JSON.stringify(waypointInputs)]` | omits `planRouteMulti` on purpose |
| ~1356 | Re-apply route on forecast change | `[forecastIsoUtc]` | omits `route`/`applyRouteFromLonLat` on purpose |

If a hook extraction "helpfully" adds the omitted deps back, it will introduce
infinite loops or redundant network calls. **Preserve every dependency array
exactly.**

There are also `*Ref` flags used to coordinate async ordering
(`latestRouteReqRef`, `suppressAutoPlanRef`, `directGpxModeRef`,
`pendingPresetCacheRef`, `didAutoCenterToUserRef`). These must stay in the same
hook as the code that reads/writes them.

## State, grouped

- **Route planning**: `route`, `winds`, `elevPts`, `startLonLat`, `endLonLat`,
  `startLabel`, `endLabel`, `waypointInputs`, `applyingPresetId`,
  `segmentMeters` + refs `latestRouteReqRef`, `suppressAutoPlanRef`,
  `directGpxModeRef`, `routeCacheRef`, `routeApiCacheRef`,
  `pendingPresetCacheRef` + `planRouteMulti`, `applyRouteFromLonLat` + effects
  ~1306 and ~1351.
- **Map camera / geolocation**: `mapCenter`, `zoom`, `mapRef`, `focusPt`,
  `setProgrammaticCenter`, `tryFlyToPendingGeoCenter`, fly-to effect ~1335 +
  refs `pendingGeoCenterRef`, `didAutoCenterToUserRef`.
- **Webcams**: `webcams`, `activeWebcam`, `showWebcams`,
  `fetchWebcamsWithClientCache`, `webcamQueryCacheRef`, effects ~1345 / ~1359.
- **Interaction / picking**: `pickMode`, `pendingWaypointIndex`, `cursorPt`,
  `focusIdx`, `panelHoverIdx`.
- **UI toggles**: `showElevation`, `showRoutingPanel`, `showDataPanel`,
  `routeColorMode`, `windForecastLocal`, `viewportWidth`.
- **URL sync**: mount effects ~533 / ~550 + `writeQuery` (uses
  `searchParams`/`router`/`pathname`).
- **Derived (`useMemo`)**: `focusPt`, `forecastIsoUtc`, `elevationStats`,
  `windAngleRatio`, `displayWaypoints`.

## Extraction order (safest first)

Each step is its own commit. **After every step: `npm run lint && npm test &&
npm run build`, then run the app and exercise the listed scenario, comparing
behavior to `dev`.**

1. **`useViewportWidth()`** — `viewportWidth` + the resize effect. Zero coupling
   to anything else.
   *Verify:* resize the window; responsive breakpoints still flip.

2. **`useUrlRouteParams()`** — the two mount-only URL effects + `writeQuery`.
   Keep both dep arrays as `[]`.
   *Verify:* open with `?start=lat,lon&end=lat,lon`; route seeds and the URL is
   cleaned exactly as before.

3. **Presentational sub-components (no behavior risk, props-only):**
   - `WebcamPopup` (Popup ~1626) and the webcam markers
   - `DataPanel` (the debug/data panel)
   - `MapControlButtons` (the floating toggle buttons)
   *Verify:* each panel/popup renders and toggles identically.

4. **`useGeolocation()` / camera** — `mapCenter`, `focusPt` fly-to effect,
   `setProgrammaticCenter`, `tryFlyToPendingGeoCenter`, geo refs.
   *Verify:* first-load geolocation centering; fly-to on focus; no double-center.

5. **`useWebcams(route, mapCenter, showWebcams)`** — the webcam cluster incl.
   client cache and the two effects. Network + caching: watch for changed
   request cadence.
   *Verify:* toggle webcams on a planned route and on bare map center; progressive
   radius expansion; client cache hits (no duplicate requests within TTL).

6. **`useRoutePlanner()`** — LAST and highest risk. Holds `planRouteMulti`,
   `applyRouteFromLonLat`, the auto-plan effect (~1306) and the forecast
   re-apply effect (~1351), plus all routing refs. **Move the two disabled-deps
   effects verbatim, dep arrays unchanged.**
   *Verify, thoroughly:* plan A→B; add/reorder/remove waypoints; apply a preset
   (incl. a GPX preset → `directGpxModeRef` path); swap start/end; change the
   forecast time and confirm the route re-applies once (not looped); export GPX.

## Guardrails

- One concern per commit; never combine an extraction with a behavior tweak.
- Do not "fix" the `exhaustive-deps` disables. If lint complains after a move,
  re-add the disable comment — do not change the dep array.
- Keep refs and their readers/writers in the same hook.
- Prefer passing state down as props over re-deriving it inside sub-components.
- A green build/tsc is necessary but **not sufficient** — the sign-off for each
  step is the manual app scenario, since hook timing isn't covered by the
  current tests.

## Optional follow-up

Once hooks are isolated, several become unit-testable (e.g. the route-merge and
cache-key logic). Add targeted tests then, where it pays off.
