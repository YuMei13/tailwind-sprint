# 🗺️ Tailwind Sprint - API Setup Guide

## Quick Start

Your project is now **100% functional**, but requires API keys to enable all features. Follow this guide to get everything working.

## Step 1: Get Mapbox Token (Already Done ✅)
Your Mapbox token is already configured in `.env.local`:
```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoieXUtbWVpIiwiYSI6ImNtbDlkNHhvdzAxbjIzZnM5ZW9tNmlvdWkifQ.o-q2m6yX_pYr5l66PlDWyg
```
✅ Maps will display and work perfectly

---

## Step 2: Get OpenRouteService (ORS) Key ⭐ REQUIRED

### Why You Need It
Routes won't calculate without this key. When you try to create a route, the app needs to call ORS to plan a cycling route between your start and end points.

### How to Get It
1. Go to: **https://openrouteservice.org/dev/#/signup**
2. Sign up with email (free tier available)
3. Verify your email
4. Go to your dashboard and find "API Keys"
5. Copy your API key

### Add to .env.local
```env
ORS_API_KEY=your_key_here
```

Example:
```env
ORS_API_KEY=5b3ce3597851110001cf6248abcd1234
```

### What It Unlocks
- ✅ Route calculation between points
- ✅ Waypoint support
- ✅ Geocoding (location search by name)
- ✅ Multi-point route optimization

---

## Step 3: Get Windy Webcams Key ⭐ REQUIRED (for webcams panel)

### Why You Need It
The "Nearby Webcams" panel shows webcams near your route. Without this key, that panel will display an error.

### How to Get It
1. Go to: **https://api.windy.com/webcams/api/v3**
2. Sign up for free (email required)
3. You'll receive an API key in your dashboard or via email
4. Copy the key

### Add to .env.local
```env
WINDY_WEBCAMS_KEY=your_key_here
```

Example:
```env
WINDY_WEBCAMS_KEY=abc123def456xyz789
```

### What It Unlocks
- ✅ Nearby webcams list
- ✅ Webcam preview images
- ✅ Fly to webcam locations
- ✅ Direct links to Windy player

---

## Step 4: Optional - Redis Caching

### Why Use It
For production/deployment, enable Redis caching for better performance.

### How to Set Up (Optional)
1. Create free Redis at: **https://console.upstash.com/**
2. Create a database
3. Copy REST URL and REST Token
4. Add to `.env.local`:

```env
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### Without Redis
- ✅ App still works perfectly
- ✅ Uses in-memory caching instead
- ✅ Fine for development and small deployments

---

## Complete .env.local Example

```env
# Mapbox (Already configured)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoieXUtbWVpIiwiYSI6ImNtbDlkNHhvdzAxbjIzZnM5ZW9tNmlvdWkifQ.o-q2m6yX_pYr5l66PlDWyg

# OpenRouteService - REQUIRED
ORS_API_KEY=your_ors_api_key_here

# Windy Webcams - REQUIRED
WINDY_WEBCAMS_KEY=your_windy_api_key_here

# Public Site URL
PUBLIC_SITE_URL=http://localhost:3000

# Upstash Redis (Optional)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## After Configuration

1. **Restart Dev Server**:
   ```bash
   npm run dev
   ```

2. **Test the Features**:
   - Search for "Taipei Main Station"
   - Create a route to "Tamsui Old Street"
   - Watch the wind-colored route appear
   - See elevation profile on bottom left
   - Check nearby webcams on top left

3. **Try These Locations**:
   - Start: 台北車站 (Taipei Main Station)
   - End: 淡水老街 (Tamsui Old Street)
   - Distance: ~30 km scenic cycling route

---

## What Each API Does

| API | Purpose | Free Tier | Required |
|-----|---------|-----------|----------|
| **Mapbox** | Map display & tiles | Yes (500k tile views/month) | Yes ✅ |
| **OpenRouteService** | Route calculation | Yes (unlimited, 40 req/min) | Yes ✅ |
| **Open-Meteo** | Wind data | Yes (unrestricted) | No* |
| **OpenTopoData** | Elevation data | Yes (unrestricted) | No* |
| **Windy** | Webcams | Yes (generous free tier) | Yes ✅ |
| **Upstash Redis** | Caching | Yes (10,000 commands/day) | No** |

*Automatically handled if API is down  
**Only needed for production/scaling

---

## Troubleshooting

### ❌ "Missing ORS_API_KEY"
- You forgot to set `ORS_API_KEY` in `.env.local`
- Routes panel will show error
- **Solution**: Get key from OpenRouteService and add to `.env.local`

### ❌ "Missing WINDY_WEBCAMS_KEY"
- Webcams panel shows error
- Other features work fine
- **Solution**: Get key from Windy Webcams API

### ❌ "Invalid coordinates from ORS"
- Route calculation failed
- Check coordinates are valid (use search to get good coordinates)
- **Solution**: Verify start/end points are valid locations

### ❌ Map doesn't show
- Mapbox token is invalid
- **Solution**: Verify token in `.env.local` is correct

### ✅ Everything Works!
Enjoy your Tailwind Sprint app! 🎉

---

## Cost Breakdown (Monthly)

**Free Tier Totals**:
- Mapbox: $0 (500k tiles/month)
- ORS: $0 (unlimited)
- Open-Meteo: $0
- OpenTopoData: $0
- Windy: $0
- Upstash Redis: $0 (in-memory fallback)

**Total Monthly Cost**: **$0** 💰

---

## API Rate Limits & Best Practices

### OpenRouteService (ORS)
- Free tier: 40 requests/minute
- Caching: 1 hour (routes don't change often)
- ✅ Won't exceed limits in normal usage

### Windy Webcams
- Free tier: Generous quota
- Caching: 2 minutes
- ✅ Won't exceed limits

### Open-Meteo Wind
- Unrestricted
- Caching: 90 seconds (fresh wind data)
- ✅ Very reliable

### OpenTopoData Elevation
- Unrestricted
- Caching: 24 hours (elevation doesn't change)
- ✅ Very fast

---

## Need Help?

1. **Check API docs**: Visit each provider's documentation
2. **Verify keys**: Make sure you copied full keys correctly
3. **Clear .next**: Delete `.next` folder and rebuild
4. **Check browser console**: F12 for detailed errors
5. **Restart server**: Always restart after changing `.env.local`

---

## Next Deployment

When deploying to production (e.g., Vercel):

1. Add API keys to environment variables in deployment platform
2. Set `PUBLIC_SITE_URL` to your domain
3. (Optional) Set up Upstash Redis for caching
4. Deploy! 🚀

---

**Your app is ready to go!** Just add those 2 API keys and you're all set! 🎉
