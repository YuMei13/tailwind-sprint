# Tailwind Sprint

Wind-aware cycling route planner built with Next.js and Mapbox.

## Overview

Tailwind Sprint lets you plan routes and overlay weather/context data directly on the map:

- Route geometry from Mapbox Directions
- Wind sampling and color-coded route segments
- Elevation profile along the route
- Nearby webcams around the current map center

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- `react-map-gl` + `mapbox-gl`
- Optional Upstash Redis cache (with in-memory fallback)

## Features

- Search start/end/waypoint locations (geocoding)
- Click map to place start/end/waypoints
- Multi-leg cycling route planning
- Wind arrows + color segments by configurable segment length
- Elevation sampling with provider fallback
- Webcam discovery panel with fly-to interaction
- URL query syncing for start/end

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Create `.env.local` in the project root:

```env
# Required
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
ORS_API_KEY=your_openrouteservice_key
WINDY_WEBCAMS_KEY=your_windy_webcams_key

# Optional
PUBLIC_SITE_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=your_upstash_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
```

Notes:
- `NEXT_PUBLIC_MAPBOX_TOKEN` is used by map rendering, Directions plugin, route API fallback, and elevation fallback.
- `ORS_API_KEY` is used by `/api/geocode`.
- `WINDY_WEBCAMS_KEY` is used by `/api/webcams`.
- If Upstash vars are missing, APIs use in-memory cache automatically.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## API Routes (App Router)

- `POST /api/mapbox-route`: Route geometry from Mapbox Directions API
- `GET /api/geocode`: Location search via OpenRouteService geocoding
- `POST /api/wind`: Wind at sampled points via Open-Meteo
- `POST /api/elevation`: Elevation sampling (OpenTopoData -> Open-Meteo fallback -> Mapbox terrain fallback)
- `GET /api/webcams`: Nearby webcams via Windy Webcams API
- `POST /api/route`: Legacy ORS route endpoint retained in codebase

## Documentation

- `API_SETUP.md`
- `docs/api.md`
- `docs/dev.md`
- `docs/deploy.md`
