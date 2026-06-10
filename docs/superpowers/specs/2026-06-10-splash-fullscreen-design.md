# Splash full-screen on phone — Design

**Status:** Approved (design)
**Date:** 2026-06-10
**Scope:** Revision item #1 of the app revision backlog. Standalone — one branch / one PR.

## Problem

On a portrait phone the splash logo looks small and lost in empty space — it
does not fill the screen.

The web splash (`src/app/page.tsx`) renders `public/soonla-splash.jpg`, which
is a **2732×2732 square** where the actual logo (blue "Soonla" script +
mountain/wind/cyclist illustration + the tagline "公路車路線與風向 / ROADS & WIND
FOR CYCLING") occupies only **~24% of the width and ~16% of the height**, dead
centre, surrounded by a huge margin of **near-white** padding baked into the
image. With `background-size: contain` on a tall portrait screen the logo is
sized to that tiny fraction, so it appears small with lots of empty space.

The native iOS launch screen (`LaunchScreen.storyboard`) uses a **different**
asset — `Splash.imageset/splash-2732x2732*.png` — which places an even smaller
logo low inside a cream "card" on a white field, and its background resolves to
`systemBackgroundColor` (white in light mode, **black in dark mode**).

### Findings that drove the design (measured, not eyeballed)

- `soonla-splash.jpg` background is **`#FEFEFE` — neutral near-white, not cream.**
  So there are no coloured bars to recolour; "fill with the background colour"
  would be a no-op. The real problem is the logo is **too small** (76% baked-in
  padding).
- The repo already contains **`public/soonla-splash.png` (1024×559)** — the
  **same logo, already tightly cropped** with even margins, on a near-white
  (`~#FCFCFA`) background. This is the asset we should display; **no cropping is
  required.**

## Goal

A large, centred logo that fills the phone screen comfortably, **whole** (never
cropped, never distorted), with a uniform near-white background and **no bars or
seam**, on **both** the web splash and the native iOS launch screen, in portrait
or landscape, light or dark mode.

## Approach (revised after measurement)

Use the already-tight `soonla-splash.png` instead of the padded square, and make
the surrounding colour match the asset.

1. **Web splash — `src/app/page.tsx`**
   - Point `backgroundImage` at `/soonla-splash.png` (the tight 1024×559 logo)
     instead of `/soonla-splash.jpg`.
   - Set `backgroundColor` to **`#FCFCFA`** (the png's edge colour) so the
     `contain` letterbox bands blend seamlessly into the image edges.
   - Keep `background-size: contain`, `background-position: center`,
     `background-repeat: no-repeat`.
   Result: on portrait the logo fills the width and sits centred (~66% of width,
   comfortable side margins), with seamless `#FCFCFA` above/below — no small
   logo, no bars, no seam.

2. **Native iOS launch screen**
   - **`Splash.imageset`**: replace the three card-composition PNGs
     (`splash-2732x2732.png`, `-1.png`, `-2.png`) with copies of the tight
     `soonla-splash.png`, keeping the filenames so `Contents.json` is untouched.
   - **`LaunchScreen.storyboard`**: set the launch view's background colour
     explicitly to **`#FCFCFA`** (currently `systemBackgroundColor`), keeping
     `contentMode="scaleAspectFit"`. This makes the native launch match the web
     splash and fixes the dark-mode black background.

## Decision log

- **Fit:** whole logo, no cropping. (Rejected `cover` — crops the logo edges.)
- **Enlarge by:** using the already-tight png. (Rejected: cropping the square
  jpg — unnecessary once the tight png was found; rejected a brand-new asset —
  out of scope.)
- **Background colour:** `#FCFCFA`, sampled from the png's edge pixels (the jpg's
  `#FEFEFE` was its corners; the png — the asset we now use — is `~#FCFCFA`).
- **Logo size:** "comfortable centred size" = `contain` of the tight png (~66%
  of screen width on portrait). Not enlarged further.

## Out of scope

- Creating or editing the splash artwork.
- The 1-second splash duration and the splash→map transition.
- `public/soonla-splash.jpg` — left in the repo, simply no longer referenced.
- Android (project is iOS-only via Capacitor today).

## Files touched

- Modify: `src/app/page.tsx` (background image path + background colour)
- Replace: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png`
- Replace: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png`
- Replace: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png`
- Modify: `ios/App/App/Base.lproj/LaunchScreen.storyboard` (launch view background colour)

## Verification

- **Web (automated-ish + visual):** `npm run dev`, open in a browser at a
  portrait phone size (~390×844). Confirm: large centred logo, seamless
  `#FCFCFA` fill, **no small logo, no bars, no seam**. Check a wide/landscape
  size too — logo still centred and whole. Confirm `npm run build` still passes.
- **Native (build-time, done by the user):** build the iOS app in Xcode and
  confirm the launch screen shows the same logo on `#FCFCFA`, in both light and
  dark mode, with no black background and no card.

## Risks

- **Seam** if the page colour doesn't match the png edge — mitigated by using
  the sampled `#FCFCFA` and the same value on both surfaces.
- **Native not verifiable in this environment** (no Xcode build here) — the
  native asset/storyboard changes are specified exactly but signed off by the
  user's Xcode build. Web is fully verifiable here.
- Low blast radius: presentation-only, no logic, no new dependencies.
