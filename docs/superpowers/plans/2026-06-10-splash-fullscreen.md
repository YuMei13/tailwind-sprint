# Splash Full-Screen on Phone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the splash show a large, centered, whole logo that fills the phone screen with no white bars or seam, on both the web splash and the native iOS launch screen.

**Architecture:** Swap the padded square `soonla-splash.jpg` for the already-tightly-cropped `soonla-splash.png`, and set the surrounding background to the png's edge color `#FCFCFA` so the `contain` letterbox blends seamlessly. Apply the same logo + color to the native iOS launch (imageset + storyboard), which also fixes its dark-mode black background. No image cropping, no logic, no new dependencies.

**Tech Stack:** Next.js (App Router) inline styles in `src/app/page.tsx`; Capacitor iOS launch storyboard + asset catalog.

**Spec:** `docs/superpowers/specs/2026-06-10-splash-fullscreen-design.md`

---

## File Structure

- `src/app/page.tsx` — the web splash `<div>` background (image path + color). One change.
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732{,-1,-2}.png` — the native launch image (3 scale variants). Replaced with the tight logo.
- `ios/App/App/Base.lproj/LaunchScreen.storyboard` — the launch view background color. One change.

Two tasks: **Task 1 (web)** is fully verifiable in this environment; **Task 2 (native)** is specified exactly but verified by the user's Xcode build.

---

### Task 1: Web splash → tight logo on matched background

**Files:**
- Modify: `src/app/page.tsx:22-23`

The current splash block is:

```tsx
            backgroundColor: "#ffffff",
            backgroundImage: 'url("/soonla-splash.jpg")',
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "contain",
```

- [ ] **Step 1: Confirm the tight asset exists**

Run: `git ls-files --error-unmatch public/soonla-splash.png && echo OK`
Expected: prints the path then `OK` (the 1024×559 tight logo is tracked).

- [ ] **Step 2: Point the splash at the png and match the background color**

In `src/app/page.tsx`, change exactly these two lines:

```tsx
            backgroundColor: "#ffffff",
            backgroundImage: 'url("/soonla-splash.jpg")',
```

to:

```tsx
            backgroundColor: "#FCFCFA",
            backgroundImage: 'url("/soonla-splash.png")',
```

Leave `backgroundRepeat`, `backgroundPosition`, and `backgroundSize: "contain"` unchanged.

- [ ] **Step 3: Verify the production build still passes**

Run: `npm run build`
Expected: `✓ Compiled successfully` and the route table prints, exit 0. (Type/lint unaffected — this is a style-only change.)

- [ ] **Step 4: Verify visually in a portrait phone viewport**

Run: `npm run dev` then open `http://localhost:3000` and set the browser device emulation to ~390×844 (portrait).
Expected: for the first ~1 second, a **large centered Soonla logo** fills most of the width, with a uniform `#FCFCFA` background above and below it — **no small logo, no white bars, no seam** — then the map appears. Also check a wide/landscape window: the logo stays centered and whole.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix(splash): use tight logo png on matched background

Replace the padded square jpg with the already-tight soonla-splash.png
and set the splash background to its #FCFCFA edge color, so the logo is
large and centered with a seamless full-screen fill (no small logo, no
white bars)."
```

---

### Task 2: Native iOS launch — same logo, matched background, dark-mode fix

**Files:**
- Replace: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png`
- Replace: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png`
- Replace: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png`
- Modify: `ios/App/App/Base.lproj/LaunchScreen.storyboard:18`

The current native launch images are a different composition (a small logo low inside a cream card), and the storyboard background is `systemBackgroundColor` (white in light mode, **black in dark mode**).

- [ ] **Step 1: Replace the three launch images with the tight logo**

Run:

```bash
cp public/soonla-splash.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
cp public/soonla-splash.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
cp public/soonla-splash.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
```

(Filenames are kept, so `Splash.imageset/Contents.json` needs no change.)

- [ ] **Step 2: Verify the copies landed**

Run: `cd ios/App/App/Assets.xcassets/Splash.imageset && file splash-2732x2732.png && cd -`
Expected: `PNG image data, 1024 x 559, 8-bit/color RGB` (now the tight logo, not the 2732×2732 card).

- [ ] **Step 3: Set the launch background to `#FCFCFA` (fixes dark-mode black)**

In `ios/App/App/Base.lproj/LaunchScreen.storyboard`, change exactly this line (line 18):

```xml
                        <color key="backgroundColor" systemColor="systemBackgroundColor"/>
```

to:

```xml
                        <color key="backgroundColor" red="0.9882352941" green="0.9882352941" blue="0.9803921569" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
```

(0.9882, 0.9882, 0.9804 ≈ `#FCFCFA`. Leave `contentMode="scaleAspectFit"` and the unused `systemBackgroundColor` resource definition as-is.)

- [ ] **Step 4: Sync Capacitor so the native project picks up the assets**

Run: `npm run cap:sync` (i.e. `npx cap sync ios`)
Expected: `✔ Sync finished` with no errors. (If iOS tooling isn't installed in this environment, skip — the file changes above are already committed; the user runs sync/build in Xcode.)

- [ ] **Step 5: Commit**

```bash
git add ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png \
        ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png \
        ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png \
        ios/App/App/Base.lproj/LaunchScreen.storyboard
git commit -m "fix(ios): native launch shows the tight logo on #FCFCFA

Replace the card-composition launch images with the tight Soonla logo
and set the launch view background to #FCFCFA, matching the web splash
and fixing the dark-mode black background."
```

- [ ] **Step 6: User verification (Xcode — cannot be done in this environment)**

Build/run the iOS app in Xcode. Expected: the native launch screen shows the same large centered logo on a `#FCFCFA` background, in **both light and dark mode**, with no black background and no card. This is the sign-off for the native change.

---

## Self-Review

**Spec coverage:**
- Web splash large/centered/whole/no-bars/no-seam → Task 1 ✓
- Native launch same logo + matched background → Task 2 Steps 1–3 ✓
- Dark-mode black background fix → Task 2 Step 3 ✓
- Background color `#FCFCFA` on both surfaces → Task 1 Step 2 + Task 2 Step 3 ✓
- Verification (web visual + build; native Xcode) → Task 1 Steps 3–4, Task 2 Step 6 ✓

**Placeholder scan:** none — every step has the exact path, old/new code, or command.

**Consistency:** `#FCFCFA` is used identically as the CSS hex (Task 1) and as the sRGB triple 0.9882/0.9882/0.9804 (Task 2); both reference `public/soonla-splash.png`; filenames in the `cp` and `git add` commands match the imageset's `Contents.json`.
