# Splash full-screen on phone — Design

**Status:** Approved (design)
**Date:** 2026-06-10
**Scope:** Revision item #1 of the app revision backlog. Standalone — one branch / one PR.

## Problem

On a portrait phone the splash does not fill the screen. The asset
`public/soonla-splash.jpg` is a **2732×2732 square** in which the actual logo
(blue "Soonla" script + mountain/wind/cyclist illustration + the tagline
"公路車路線與風向 / ROADS & WIND FOR CYCLING") sits as a **landscape band in the
vertical centre**, surrounded by a **warm cream / off-white background**.

It is rendered in `src/app/page.tsx` with `background-size: contain` on a pure
**white** (`#ffffff`) container. On a tall portrait screen this produces:

1. The square is sized to the screen **width**, so the logo appears small and
   centred with large **white bars top and bottom**.
2. A faint **seam** where the image's cream background meets the white page
   background.

There are two splashes in the launch sequence on the native app:

- the **native iOS launch screen** (`LaunchScreen.storyboard`), shown first,
  before the webview loads — currently `scaleAspectFit` on the system
  background (white);
- the **web splash** (`src/app/page.tsx`), shown for ~1s after the webview
  loads.

Both exhibit the white-bar / white-background problem.

## Goal

One seamless **cream full-screen splash** with the **whole logo visible**,
centred at a comfortable size, on **both** the native launch screen and the web
splash, in portrait or landscape. Nothing cropped, nothing distorted, no white
bars, no seam.

## Decision (chosen during brainstorming)

- **Fit:** "Whole logo, no white bars." Fill the screen with the splash's own
  cream background colour and keep the entire logo visible. (Rejected: `cover`
  — crops the logo edges; a new portrait asset — out of scope.)
- **Logo size:** centred at a **comfortable size** on cream (keep `contain`
  behaviour for the logo; do not zoom/enlarge to the point of cropping the
  logo art). Only the empty cream margins may extend past the screen edges.

## Approach

Two small, surgical changes — no new asset, no logo redesign, no timing change.

1. **Web splash — `src/app/page.tsx`**
   Change the splash container background from `#ffffff` to the asset's exact
   **cream** hex, keeping `background-size: contain`, `background-position:
   center`, `background-repeat: no-repeat`. The cream then fills the entire
   `position: fixed; inset: 0` container, the logo stays fully visible and
   centred, and the cream-vs-white seam disappears.

2. **Native iOS launch screen — `ios/App/App/Base.lproj/LaunchScreen.storyboard`**
   Set the launch view's `backgroundColor` to the **same cream** hex (it
   currently resolves to `systemBackgroundColor` = white), keeping
   `contentMode="scaleAspectFit"`. This removes the white flash/bars before the
   web splash appears, so the whole launch sequence is one cream screen.

### Exact cream colour

The exact hex is **not** eyeballed. At implementation time, sample a corner
pixel of `public/soonla-splash.jpg` (a region of pure background, e.g. 15px
in from a corner) and use that value for both the web container background and
the storyboard background. PIL is not installed on the dev machine, so sample
via a Node/canvas read or an equivalent one-off, not by eye. The two surfaces
MUST use the identical value so there is no visible boundary.

## Out of scope

- Creating or editing the splash artwork (no new portrait asset).
- The unused `public/soonla-splash.png` (landscape variant) — left as-is.
- The 1-second splash duration and the splash→map transition.
- Android (project is iOS-only via Capacitor today).

## Files touched

- Modify: `src/app/page.tsx` (splash container background colour)
- Modify: `ios/App/App/Base.lproj/LaunchScreen.storyboard` (launch view background colour)

## Verification

Manual, visual (no automated test — this is a styling/asset-fit change):

1. `npm run dev`, open in a browser, and use device-emulation at a portrait
   phone size (~390×844). Confirm: cream fills the whole viewport, logo centred
   and fully visible, **no white bars**, **no seam**.
2. Confirm at a landscape / wide size that the logo is still centred and whole.
3. (When building the iOS app) confirm the native launch screen shows the same
   cream with no white flash before the web splash.

## Risks

- **Colour mismatch / seam** if the sampled hex is wrong — mitigated by
  sampling the actual asset pixel and using one shared value on both surfaces.
- Low blast radius: only two files, both presentation-only, no logic.
