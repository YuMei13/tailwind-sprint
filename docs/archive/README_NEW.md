# 🌬️ Tailwind Sprint

> A wind-aware route planner for cyclists and outdoor explorers

---

## 🌐 Overview

**Tailwind Sprint** is a map-based tool for route planning that takes wind direction and speed into account. You can select start and end points, visualize elevation profiles, view nearby webcams, and see wind direction arrows and speed-based color segments along the route.

Built with: **Next.js 16**, **React Map GL**, **TypeScript**, **Tailwind CSS**

---

## ✅ Status

- ✅ All bugs fixed
- ✅ All components working
- ✅ Build passes successfully
- ✅ Ready for configuration

**See [VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md) for detailed status**

---

## 🔧 Features

- 📍 Search locations or click on map to set start/end points
- 🧭 Plan cycling routes via OpenRouteService
- 💨 Visualize wind direction (arrows) and speed (color-coded segments)
- 📈 Interactive elevation profile with distance tracking
- 🎥 Display nearby webcams within configurable radius
- ⚙️ Adjustable segment length for wind visualization
- 💾 Smart caching with Redis fallback
- 🔗 Shareable routes via URL parameters

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/YuMei13/tailwind-sprint.git
cd tailwind-sprint
npm install
```

### 2. Configure API Keys

Create `.env.local` file:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
ORS_API_KEY=your_openrouteservice_key
WINDY_WEBCAMS_KEY=your_windy_api_key
PUBLIC_SITE_URL=http://localhost:3000
```

**See [API_SETUP.md](./API_SETUP.md) for detailed instructions on obtaining free API keys**

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Required Environment Variables

| Variable | Status | Source |
|----------|--------|--------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | ✅ Configured | [Mapbox](https://account.mapbox.com/) |
| `ORS_API_KEY` | 🔄 Needs setup | [OpenRouteService](https://openrouteservice.org/dev/) |
| `WINDY_WEBCAMS_KEY` | 🔄 Needs setup | [Windy Webcams](https://api.windy.com/webcams/api/v3) |
| `PUBLIC_SITE_URL` | ✅ Default: `http://localhost:3000` | Your domain |
| `UPSTASH_REDIS_REST_URL` | ⚙️ Optional | [Upstash](https://console.upstash.com/) |
| `UPSTASH_REDIS_REST_TOKEN` | ⚙️ Optional | [Upstash](https://console.upstash.com/) |

---

## 📚 Documentation

- **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** - Complete project overview and architecture
- **[API_SETUP.md](./API_SETUP.md)** - Step-by-step guide to configure required APIs
- **[FIXES_APPLIED.md](./FIXES_APPLIED.md)** - Details of bugs fixed
- **[VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md)** - Complete verification status
- **[docs/api.md](./docs/api.md)** - API documentation
- **[docs/dev.md](./docs/dev.md)** - Development guide
- **[docs/deploy.md](./docs/deploy.md)** - Deployment instructions

---

## 🏗️ Architecture

### Frontend
- **Next.js 16** - React framework with server components
- **React Map GL** - Mapbox integration
- **React Hooks** - State management

### Backend APIs
- **OpenRouteService** - Route planning
- **Open-Meteo** - Wind data (free, no auth)
- **OpenTopoData** - Elevation data (free, no auth)
- **Windy Webcams** - Webcam discovery

### Caching
- **Upstash Redis** (optional) - Distributed caching
- **In-Memory Cache** (default) - Local development

---

## 💡 How It Works

1. **Route Planning**
   - User inputs start & end locations
   - Geocoding API converts addresses to coordinates
   - OpenRouteService plans optimal cycling route
   
2. **Wind Visualization**
   - Route sampled into segments (configurable length)
   - Wind data fetched for each segment
   - Segments colored by average wind speed
   - Direction arrows displayed as markers

3. **Elevation Profile**
   - Elevation data sampled every 300m
   - Interactive chart displays profile
   - Hover/click highlights points on map
   - Statistics (min, max, gain, distance)

4. **Webcams**
   - Nearby webcams queried based on route location
   - Results displayed with preview images
   - Click to fly to location or view on Windy

---

## 🛠️ Development

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
```

### Dev Server
```bash
npm run dev
```

### Production
```bash
npm run start
```

---

## 📊 API Rate Limits

All APIs have generous free tiers suitable for development:

| API | Rate Limit | Caching |
|-----|-----------|---------|
| OpenRouteService | 40 req/min | 1 hour |
| Windy Webcams | Generous | 2 minutes |
| Open-Meteo | Unrestricted | 90 seconds |
| OpenTopoData | Unrestricted | 24 hours |

---

## 💰 Cost

**Total Monthly Cost: $0** (free tier APIs only)

All features use free/freemium APIs with no credit card required.

---

## 🤝 Contributing

Contributions welcome! Please check [docs/dev.md](./docs/dev.md) for development setup.

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🆘 Troubleshooting

**Routes not calculating?**
- Check `ORS_API_KEY` is set in `.env.local`
- Verify key is valid at OpenRouteService

**Webcams not showing?**
- Check `WINDY_WEBCAMS_KEY` is set in `.env.local`
- Verify key is valid at Windy

**Map not displaying?**
- Check `NEXT_PUBLIC_MAPBOX_TOKEN` is set
- Verify token is valid at Mapbox

See [API_SETUP.md](./API_SETUP.md) for detailed troubleshooting.

---

**Next Step:** Read [API_SETUP.md](./API_SETUP.md) to configure your API keys! 🚀
