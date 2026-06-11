#!/usr/bin/env bash
# Build the self-contained iOS bundle: a static front-end that ships inside the
# app and calls the deployed backend for /api (via native HTTP, no CORS).
#
# Usage: NEXT_PUBLIC_API_BASE=https://your-backend npm run ios:bundle
set -euo pipefail
cd "$(dirname "$0")/.."

API_BASE="${NEXT_PUBLIC_API_BASE:-https://tailwind-sprint.vercel.app}"
echo "==> Building static front-end (API base: $API_BASE)"

# /api route handlers are force-dynamic and cannot be statically exported. They
# live on the deployed backend, not in the bundle, so move them aside for the
# export build and restore them afterwards (even on failure).
API_DIR="src/app/api"
TMP_API="$(mktemp -d)/api"
moved=0
restore() { if [ "$moved" = "1" ] && [ ! -d "$API_DIR" ]; then mv "$TMP_API" "$API_DIR"; fi; }
trap restore EXIT
if [ -d "$API_DIR" ]; then mv "$API_DIR" "$TMP_API"; moved=1; fi

rm -rf out .next
CAPACITOR_BUILD=1 NEXT_PUBLIC_API_BASE="$API_BASE" npx next build

restore
moved=0
trap - EXIT

echo "==> Syncing bundle into iOS project"
npx cap sync ios
echo "==> Done. The iOS app now ships its own front-end (out/) and calls $API_BASE for data."
