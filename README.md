# 🌬️ Tailwind Sprint

> A wind-aware route planner for cyclists and outdoor explorers

---

## 🌐 Overview

**Tailwind Sprint** is a map-based tool for route planning that takes wind direction and speed into account. You can select start and end points, visualize elevation profiles, view nearby webcams, and see wind direction arrows and speed-based color segments along the route.

Built with: **Next.js 15**, **React Leaflet**, **TypeScript**, **Tailwind CSS**

---

## 🔧 Features

- 📍 Search or click to set start/end points
- 🧭 Plan routes via OpenRouteService
- 💨 Visualize wind direction (arrow) and wind speed (color)
- 📈 Elevation profile integrated with wind data
- 🎥 Display nearby webcams within 20km
- ⚙️ Modular components for easy expansion

---

## 📦 Installation

```bash
git clone https://github.com/YuMei13/tailwind-sprint.git
cd tailwind-sprint
npm install
npm run dev
```
---

## 🔐 Environment Variable

Add .env.local file and file the API keys as below:
Optional if using external APIs in production
- OPENROUTESERVICE_API_KEY=your_ors_key
- OPEN_METEO_API_URL=https://api.open-meteo.com
- WEBCAMS_API_URL=https://api.windy.com/api/webcams/v2
- WEBCAMS_API_KEY=your_webcams_key
---

## 👉 Documentation [docs/](./docs)：

- [API Introduction](./docs/api.md)
- [Deployment](./docs/deploy.md)
- [Development](./docs/dev.md)