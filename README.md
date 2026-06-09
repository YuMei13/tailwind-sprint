# Tailwind Sprint

Wind-aware cycling route planner built with Next.js + Mapbox.

## Overview

Tailwind Sprint helps riders plan routes and evaluate wind/elevation impact before riding.

## Current Features

- Route planning with start/end + multiple stops
- Geocoding search and map click-to-pick for points
- Popular route presets (including GPX-backed routes)
- Direct GPX track rendering (point-by-point, no re-routing for preset GPX routes)
- Swap start/end with full route reversal behavior
- Route export to GPX
- Wind visualization on route:
- Direction arrows
- Speed-based arrow thickness
- Zoom-aware arrow density (more detail when zooming in)
- Route color modes:
- `wind`: route-vs-wind angle coloring
- `slope`: gradient/slope coloring
- Wind forecast time selector (date/time) for scenario comparison
- Elevation profile panel (fixed bottom dock), interactive hover/focus sync with map
- Rider icon marker synced between map and elevation profile
- Nearby webcam discovery along route and map center
- Webcam progressive radius logic (starts near route, expands when needed)
- Client + server caching for faster webcam queries
- User geolocation centering on load (with mobile-safe behavior)
- Splash screen on entry (shows logo image briefly before map)
- Mobile-friendly panel/icon controls

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript
- `react-map-gl` + `mapbox-gl`
- Open-Meteo (wind forecast/current)
- Windy Webcams API
- Optional Upstash Redis cache (in-memory fallback if not configured)

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
ORS_API_KEY=your_openrouteservice_key
WINDY_WEBCAMS_KEY=your_windy_webcams_key

# Optional
PUBLIC_SITE_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=your_upstash_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
```

Notes:
- `NEXT_PUBLIC_MAPBOX_TOKEN`: map rendering + Mapbox routing/elevation fallbacks.
- `ORS_API_KEY`: geocoding API.
- `WINDY_WEBCAMS_KEY`: webcams API.
- Without Upstash vars, the app still works using in-memory cache.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
```

## API Routes

- `POST /api/mapbox-route` - Mapbox route geometry
- `GET /api/geocode` - location search
- `POST /api/wind` - wind data for points (supports forecast datetime)
- `POST /api/elevation` - elevation sampling with fallback providers
- `GET /api/webcams` - nearby webcams (Windy provider + cache)
- `POST /api/route` - legacy endpoint kept for compatibility

## Docs

- `docs/api.md`
- `docs/dev.md`
- `docs/deploy.md`
- `docs/ios-capacitor.md`
- `docs/archive/` — older setup notes and point-in-time summaries


## iOS (Capacitor Wrapper)

- Setup guide: `docs/ios-capacitor.md`
- Config file: `capacitor.config.ts`
- Scripts: `npm run cap:sync`, `npm run cap:open:ios`, `npm run ios:setup`
