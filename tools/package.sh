#!/usr/bin/env bash
# Build a Chrome Web Store upload zip from extension/.
# Validates first so a broken build never gets packaged.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node tools/validate.mjs
node tools/test.mjs

VERSION="$(node -p "require('./extension/manifest.json').version")"
OUT="dist/streamsnap-extension-v${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

# The demo page is a local development aid and is not shipped to the store.
(cd extension && zip -rq "../$OUT" . \
  -x "demo/*" \
  -x "*.DS_Store" \
  -x "*/.*")

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ built $OUT ($SIZE)"
