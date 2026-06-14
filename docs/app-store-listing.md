# Soonla — App Store Connect listing

Copy/paste reference for the App Store submission. Edit the wording to taste.

## Basics

- **App name:** Soonla
- **Subtitle (≤30 chars):** `Wind-smart cycling routes`
- **Bundle ID:** `soonla.tailwindsprint.com`
- **Primary category:** Navigation _(alt: Sports / Health & Fitness)_
- **Secondary category (optional):** Sports
- **Version:** 1.1.1
- **Age rating:** 4+ (no objectionable content)
- **Price:** Free

## Promotional text (≤170 chars, editable anytime without review)

```
Plan smarter rides. See tailwind vs. headwind along your whole route, check
every climb, and peek at nearby webcams before you roll out.
```

## Description

```
Soonla helps you plan cycling routes with the wind and the hills in mind.

Most route planners stop at "fastest" or "shortest." Soonla shows you what the
ride will actually feel like — where you'll have a tailwind pushing you along,
and where you'll be grinding into a headwind.

PLAN A ROUTE
Search or tap the map to set your start, end, and stops — or pick a preset and
go. Soonla draws a cycling-friendly route in seconds.

READ THE WIND
Your route is colored from tailwind to headwind using live wind data, so you can
choose the smarter direction and pace yourself for the tough stretches.

CHECK THE CLIMB
A clear elevation profile shows every slope along the way, with a rider that
tilts to match the gradient — so there are no surprises on the road.

NEARBY WEBCAMS
Peek at live webcams near your route to check real conditions before you head
out.

Soonla has no accounts, no ads, and no tracking. Just plan and ride.
```

## Keywords (≤100 chars, comma-separated, no spaces after commas)

```
cycling,bike,route,wind,headwind,tailwind,elevation,climb,gradient,ride,planner,gps,road,weather
```

## URLs

- **Support URL:** _(required)_ — e.g. a simple page or the GitHub repo:
  `https://github.com/YuMei13/tailwind-sprint`
- **Marketing URL (optional):** your site, if any
- **Privacy Policy URL:** _(required — you must host this)_
  host `docs/privacy-policy.md` somewhere public and put the URL here.
  Easiest options: GitHub Pages, or add a `/privacy` page to your web app.

## App Privacy ("nutrition label") answers

In App Store Connect → App Privacy, answer the questionnaire as follows. This
matches what the app actually does (no analytics, no accounts, no tracking).

**Do you or your third-party partners collect data from this app?**
→ The honest answer is **Yes** — because "Location" is sent to service providers
to deliver features. Declare it minimally:

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| **Precise Location** | Yes | **No** | **No** | App Functionality (routing, wind, nearby webcams) |
| Everything else (name, email, contacts, identifiers, usage, diagnostics, purchases, etc.) | **No** | — | — | — |

Key follow-up answers:
- **Used to track you?** → **No** (no advertising/cross-app tracking).
- **Linked to your identity?** → **No** (no accounts; location isn't tied to a user).
- Location purpose → **App Functionality** only (not analytics, not ads).

> Note: the on-device storage (onboarding flag, route presets) is **not**
> "collected" in Apple's sense because it never leaves the device — you don't
> declare it.

## Review notes (App Review → Notes field)

```
Soonla is a cycling route planner. It uses location to center the map and to
plan routes / fetch wind and nearby webcams from public mapping and weather APIs
(Mapbox, OpenRouteService, Open-Meteo, OpenTopoData, Windy). There are no
accounts — no login is required to review the app. Just allow location (or deny
it and tap the map to set points) and plan a route.
```

## "Sign in required?" → No
No demo account needed; reviewers can use all features without logging in.
