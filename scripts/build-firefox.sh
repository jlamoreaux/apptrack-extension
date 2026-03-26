#!/usr/bin/env bash
set -euo pipefail

# Build the Firefox version of the AppTrack extension.
# Outputs to dist-firefox/ with a Firefox-compatible manifest.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Type-checking..."
npx tsc --noEmit

echo "==> Building for Firefox (no CRXJS)..."
npx vite build --config vite.config.firefox.ts

echo "==> Copying Firefox manifest..."
cp src/manifest.firefox.json dist-firefox/manifest.json

echo "==> Copying icons..."
mkdir -p dist-firefox/icons
cp public/icons/*.png dist-firefox/icons/

echo "==> Firefox build complete: dist-firefox/"
echo "    Load as a temporary add-on in about:debugging or package with web-ext."
