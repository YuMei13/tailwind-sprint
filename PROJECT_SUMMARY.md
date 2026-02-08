# Tailwind Sprint - Project Overview & Fixes

## Project Gist

**Tailwind Sprint** is an interactive web application that displays cycling routes on a map with real-time wind data visualization and elevation profiles. It combines multiple APIs to provide comprehensive route planning and environmental analysis.

### Main Features

1. **Interactive Map View**
   - Built with Mapbox GL and React Map GL
   - Start point (green marker), end point (red marker), and waypoints (yellow markers)
   - Real-time map interactions and zoom controls

2. **Route Planning**
   - Integrates with **OpenRouteService (ORS)** for cycling route calculation
   - Supports start point, end point, and multiple waypoints
   - Multi-point route optimization

3. **Wind Visualization**
   - Fetches current wind speed and direction from **Open-Meteo** API
   - **Color-coded route segments** based on wind speed:
     - Green: 0–3 m/s (light wind)
     - Yellow: 3–6 m/s (moderate wind)
     - Orange: 6–10 m/s (strong wind)
     - Red: ≥10 m/s (very strong wind)
   - Wind direction arrows displayed as markers on the map

4. **Elevation Profile**
   - Fetches elevation data using **OpenTopoData** (SRTM90m dataset)
   - Interactive elevation chart showing:
     - Distance along the route (km)
     - Elevation (m)
     - Elevation gain/loss
     - Min/max elevation
   - Interactive hover/selection to highlight points on the map

5. **Nearby Webcams**
   - Integrates with **Windy Webcams API**
   - Shows webcams within specified radius (10, 20, or 50 km)
   - Click to fly to webcam location
   - Preview images and links to Windy

6. **Route Search**
   - Geocoding powered by OpenRouteService
   - Search for locations by name (with focus on Taiwan)
   - Pick start/end points on the map or through search
   - URL-based state persistence (shareable routes)

7. **Segmentation Controls**
   - Customize wind visualization segment length
   - Presets: 300m, 500m, 800m, or custom values

## Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Main page component
│   ├── layout.tsx              # Root layout
│   ├── globals.css             # Global styles
│   └── api/
│       ├── route/route.ts       # ORS routing API
│       ├── elevation/route.ts   # Elevation data API
│       ├── wind/route.ts        # Weather data API
│       ├── geocode/route.ts     # Geocoding API
│       └── webcams/route.ts     # Webcams API
├── components/
│   ├── MapView.tsx             # Main map component
│   ├── RouteWindLayer.tsx      # Wind visualization overlay
│   ├── ElevationPanel.tsx      # Elevation chart
│   ├── GeocodeSearch.tsx       # Location search
│   ├── WebcamsPanel.tsx        # Nearby webcams list
│   ├── WindLegend.tsx          # Wind speed legend
│   └── SegmentationControls.tsx # Segment length controls
└── lib/
    ├── cache.ts                # In-memory & Redis caching
    ├── geo.ts                  # Haversine distance & sampling
    ├── wind.ts                 # Wind color mapping
    ├── windIcons.ts            # Wind direction arrow SVG
    └── sampling.ts             # Coordinate sampling utilities
```

## Errors Found & Fixed

### 1. **Missing Environment Variables** ✅
- **Issue**: API endpoints require authentication keys (ORS, Windy) that weren't configured
- **Files**: `.env.local`
- **Fix**: Added template environment variables with instructions:
  - `ORS_API_KEY` - OpenRouteService API key
  - `WINDY_WEBCAMS_KEY` - Windy webcams API key
  - `NEXT_PUBLIC_MAPBOX_TOKEN` - Already present
  - `PUBLIC_SITE_URL` - Referer for webcams
  - `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN` - Optional Redis caching

### 2. **GeocodeSearch Input Styling** ✅
- **Issue**: Input elements didn't have proper styling applied (styling was commented out)
- **File**: `src/components/GeocodeSearch.tsx`
- **Lines**: 169, 180
- **Fix**: Uncommented and applied `style={box.input}` to both start and end input fields

### 3. **ElevationPanel Circle Color Typo** ✅
- **Issue**: SVG circle fill color was `#1d4e8` (invalid hex) instead of `#3b82f6` (Tailwind blue)
- **File**: `src/components/ElevationPanel.tsx`
- **Line**: 260
- **Fix**: Corrected the hex color value to `#3b82f6`

## API Integration Details

### OpenRouteService (ORS)
- **Endpoint**: `POST https://api.openrouteservice.org/v2/directions/{profile}`
- **Use**: Route planning between coordinates
- **Profile**: `cycling-regular` (can be customized)
- **Response**: GeoJSON LineString with route coordinates

### Open-Meteo (Free, No Auth)
- **Endpoint**: `GET https://api.open-meteo.com/v1/forecast`
- **Use**: Current wind speed & direction
- **Parameters**: `latitude`, `longitude`, `current=wind_speed_10m,wind_direction_10m`

### OpenTopoData (Free, No Auth)
- **Endpoint**: `GET https://api.opentopodata.org/v1/{dataset}`
- **Use**: Elevation data along route
- **Dataset**: `srtm90m` (90m resolution global dataset)
- **Response**: Array of elevation points

### Windy Webcams API
- **Endpoint**: `GET https://api.windy.com/webcams/api/v3/webcams`
- **Use**: Nearby webcams discovery
- **Query Methods**: `nearby` or `bbox`
- **Response**: Webcam details with images, location, player embeds

## Data Flow

1. **Route Planning**
   - User enters start/end locations
   - Geocoding API converts addresses → coordinates
   - Route API calculates cycling path using ORS
   - Map displays route with green line (fallback color)

2. **Wind Visualization**
   - Route is sampled into ~40 points
   - Wind API fetches data for each point
   - Points grouped into segments (default 500m)
   - Each segment colored by average wind speed
   - Wind direction arrows rendered as markers

3. **Elevation Profile**
   - Route coordinates sampled every 300m (default)
   - Elevation API returns elevation for each point
   - Interactive chart displays profile
   - Hover/click highlights points on map

4. **Webcams Lookup**
   - Map center used as focus point
   - Windy API queries nearby webcams
   - Results displayed in left panel with distance

## Caching Strategy

- **Memory Cache** (default): Uses in-memory Map for fast access
- **Redis Cache** (optional): If Upstash credentials provided, uses distributed Redis
- **TTLs**:
  - Routes: 1 hour
  - Elevation: 24 hours
  - Wind: 90 seconds (fresh data)
  - Geocode: 6 hours
  - Webcams: 2 minutes

## How to Use

### Setup
1. Create `.env.local` with required API keys:
   ```env
   ORS_API_KEY=your_openrouteservice_key
   WINDY_WEBCAMS_KEY=your_windy_webcams_key
   NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
   PUBLIC_SITE_URL=http://localhost:3000
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

### Features in UI

1. **Route Search Panel** (top right)
   - Type location names to search
   - Select from dropdown or "Pick on map"
   - Clear route to start over

2. **Map Interaction**
   - Scroll to zoom
   - Drag to pan
   - Click while in "Pick Start/End/Waypoint" mode

3. **Elevation Chart** (bottom left)
   - Hover to see elevation at specific distance
   - Click to focus on that location
   - Shows min/max/gain statistics

4. **Wind Legend** (bottom right)
   - Color reference for wind speeds
   - Route segments colored accordingly

5. **Segments Control** (right middle)
   - Adjust segment length for wind visualization
   - Shorter = more detailed, longer = less flickering

6. **Webcams Panel** (top left)
   - Click "Fly to" to navigate to webcam location
   - Adjust search radius with dropdown
   - View webcam images and links

## Technology Stack

- **Frontend**: React 19, Next.js 16
- **Mapping**: Mapbox GL, React Map GL
- **APIs**: ORS, Open-Meteo, OpenTopoData, Windy
- **Caching**: Upstash Redis (optional), in-memory fallback
- **Build**: Turbopack (Next.js bundler)
- **Styling**: Inline CSS with Tailwind color palette

## Deployment Notes

- Edge Runtime: Some APIs work on Edge, others require Node.js runtime
- All API routes marked with `export const runtime = "nodejs"`
- Cache can use Redis for distributed deployments
- Vercel deployment ready (all free/freemium APIs compatible)

## Future Enhancements

- [ ] Multiple route alternatives
- [ ] Import/export GPX files
- [ ] Bike-specific hazard warnings
- [ ] Historical wind data
- [ ] Route difficulty analysis
- [ ] Community route sharing
- [ ] Mobile app version
