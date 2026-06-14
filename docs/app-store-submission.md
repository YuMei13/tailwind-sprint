# Shipping Soonla to the App Store — runbook

The technical prep is done (icon, version 1.1.1 / build 2, privacy policy,
listing text). What remains are the steps **only you can do** — they need your
Apple ID, your money, and your API keys. Follow these in order.

Bundle ID: **`soonla.tailwindsprint.com`** · Version: **1.1.1 (build 2)**

---

## Phase 1 — Enroll in the Apple Developer Program (~$99/yr, 24–48h)

1. Go to https://developer.apple.com/programs/ → **Enroll**.
2. Sign in with your Apple ID (turn on two-factor auth if prompted).
3. Choose **Individual** (recommended — fastest, no D-U-N-S number needed; your
   legal name shows as the seller). Pick **Organization** only if you have a
   registered company and want the company name shown.
4. Pay the **$99** annual fee. Apple may ask you to verify your identity in the
   **Apple Developer** app on your iPhone.
5. Wait for the approval email (usually a day or two).

You can't do any of the later phases until this clears.

---

## Phase 2 — Deploy your own backend (so the app doesn't depend on the frozen Vercel)

The app calls `/api/*` for routing, geocoding, wind, elevation, and webcams.
Routing/geocode/webcams need **secret API keys**, so they must live on a server
— they can't be embedded in the app. Redeploy the same code to a **new Vercel
project under your own account**.

1. Push the repo to GitHub (already done: `YuMei13/tailwind-sprint`).
2. Go to https://vercel.com → log in with **your** account → **Add New →
   Project** → import `tailwind-sprint`.
3. Framework preset: **Next.js**. Leave build settings default. **Do not** set
   `CAPACITOR_BUILD` (you want the full server build with `/api`, not the static
   export).
4. Add **Environment Variables** (Production). Copy the values from your local
   `.env.local`:
   - `ORS_API_KEY`
   - `MAPBOX_ACCESS_TOKEN`
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
   - `WINDY_WEBCAMS_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `PUBLIC_SITE_URL` → set to your new Vercel URL (e.g. `https://soonla.vercel.app`)
5. **Deploy.** Note the production URL (e.g. `https://soonla-xxxx.vercel.app`).
6. Test it: open `https://YOUR-URL/api/wind` etc. should respond (not 404/500).

> Cost: this traffic almost certainly fits Vercel's free tier. Keep the project
> alive — if it goes down, installed apps lose their data.

---

## Phase 3 — Rebuild the app bundle pointed at your backend

On your Mac, in the repo:

```bash
NEXT_PUBLIC_API_BASE="https://YOUR-NEW-VERCEL-URL" npm run ios:bundle
```

This builds the static front-end, points it at your backend, and runs
`cap sync ios`. Then open Xcode:

```bash
open ios/App/App.xcworkspace
```

(If there's no `.xcworkspace`, open `ios/App/App.xcodeproj`.)

---

## Phase 4 — Screenshots (do these once the app is running on your Mac)

App Store Connect requires screenshots for a **6.9-inch iPhone** (iPhone 16/17
Pro Max). Easiest path:

1. In Xcode, run the app on an **iPhone 17 Pro Max** simulator.
2. Tap **Allow While Using App** on the location prompt (the one I couldn't tap
   from here).
3. Plan a route (search a start/end, or tap the map). Wait for the wind-colored
   route + elevation panel.
4. Capture with **⌘S** in the simulator (saves to Desktop), for 3–5 screens:
   - the welcome/onboarding screen,
   - a planned route with the wind coloring,
   - the elevation profile,
   - the nearby-webcams panel.

Tip: you can deep-link straight to a planned route with the params
`?start=LAT,LON&end=LAT,LON&onboarded=1` if you run the web app, or just plan
in-app.

---

## Phase 5 — Create the app in App Store Connect

1. Go to https://appstoreconnect.apple.com → **My Apps → +  → New App**.
2. Platform **iOS**, name **Soonla**, primary language, bundle ID
   **`soonla.tailwindsprint.com`** (it appears in the dropdown once your
   developer account is active and the ID is registered — Xcode registers it on
   first archive, or add it under Certificates, IDs & Profiles → Identifiers).
3. Fill in the listing using **`docs/app-store-listing.md`**: subtitle,
   description, keywords, promotional text, support URL, **privacy policy URL**
   (host `docs/privacy-policy.md` first — see below), category, age rating.
4. Complete **App Privacy** using the table in the listing doc (Precise
   Location → App Functionality, not linked to identity, not used for tracking;
   everything else No).
5. Upload the screenshots from Phase 4.

### Hosting the privacy policy
You need a public URL. Quickest options:
- **GitHub Pages:** enable Pages on the repo, the markdown renders at a public
  URL, paste that.
- **Or** add a `/privacy` route to your web app that renders the policy, and use
  `https://YOUR-VERCEL-URL/privacy`.

---

## Phase 6 — Sign, archive, upload

In Xcode:

1. Select the **App** target → **Signing & Capabilities**.
2. Check **Automatically manage signing**, choose your **Team** (your developer
   account). Xcode creates the distribution certificate + provisioning profile.
3. Set the run destination to **Any iOS Device (arm64)** (not a simulator).
4. **Product → Archive.** When it finishes, the Organizer opens.
5. **Distribute App → App Store Connect → Upload.** Accept the defaults; let
   Xcode handle signing.
6. Wait ~15–30 min for the build to finish processing in App Store Connect.

---

## Phase 7 — Submit for review

1. In App Store Connect, open the app → your **1.1.1** version.
2. Under **Build**, select the uploaded build (build 2).
3. Add the **review notes** from the listing doc, confirm **no sign-in
   required**, set export-compliance (this app uses only standard HTTPS →
   typically "No" to custom encryption / exempt).
4. **Add for Review → Submit.**

First review is usually **1–3 days**. If rejected, Apple tells you why in
Resolution Center — common ones for wrapper apps are Guideline 4.2 (minimum
functionality) and privacy-string clarity; both are addressed here (native
location, real features, clear usage string).

---

## Quick reference — what's already done

- ✅ App icon (Didot "S" monogram), opaque 1024×1024, in the AppIcon set
- ✅ Version **1.1.1**, build **2** (in the Xcode project)
- ✅ Self-contained bundle architecture (`npm run ios:bundle`)
- ✅ Privacy policy draft → `docs/privacy-policy.md`
- ✅ Listing text + App Privacy answers → `docs/app-store-listing.md`
- ⬜ Everything in Phases 1–7 above (needs your account / keys / device)
