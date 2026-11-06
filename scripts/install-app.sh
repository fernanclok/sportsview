#!/usr/bin/env bash
# Builds SportsView.app and installs it in ~/Applications.
# Packaging happens outside ~/Documents: with iCloud "Desktop & Documents" on, the
# file provider re-adds xattrs and codesign fails ("...detritus not allowed").
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$HOME/Library/Caches/sportsview-release"
rm -rf "$OUT"
npm run build
npx electron-builder --mac dir --arm64 -c.directories.output="$OUT"

mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/SportsView.app"
ditto "$OUT/mac-arm64/SportsView.app" "$HOME/Applications/SportsView.app"
codesign --verify --deep "$HOME/Applications/SportsView.app"
echo "✓ Instalada en ~/Applications/SportsView.app"
