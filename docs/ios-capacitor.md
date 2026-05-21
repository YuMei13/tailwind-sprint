# iOS Wrapper Setup (Capacitor)

This project is prepared for a Capacitor iOS wrapper.

## 1) Install packages (requires internet)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
```

## 2) Add iOS platform files

```bash
npx cap add ios
```

## 3) Choose app content source

You have 2 modes:

- Recommended now: remote hosted web app
  - set env var before sync:

```bash
export CAP_SERVER_URL="https://your-vercel-domain.vercel.app"
```

- Advanced: local bundled assets (needs static export workflow; not recommended yet for this app).

## 4) Sync and open Xcode

```bash
npm run build
npm run cap:sync
npm run cap:open:ios
```

## 5) Add iOS permissions in Xcode (`Info.plist`)

Required for geolocation prompt:

- `NSLocationWhenInUseUsageDescription`: `Used to center the map at your current location and provide nearby route/weather context.`

Optional if you later add background location:

- `NSLocationAlwaysAndWhenInUseUsageDescription`

## 6) Test checklist

- App launches and shows splash then map
- Map gestures are smooth
- Location permission works and map centers correctly
- Route planning works
- Wind/elevation/webcam panels work

## 7) Build distribution

Use Xcode Organizer -> TestFlight.
