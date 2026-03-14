#!/bin/bash
# Compile OLS lessons to HTML for the Kolibri Ricecooker chef.
# Run from AGNI repo root or ensure AGNI packages are on PATH.

set -e
AGNI_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="${AGNI_ROOT}/dist"
mkdir -p "$DIST"

echo "Compiling OLS lessons to $DIST/ ..."
for f in "$AGNI_ROOT"/lessons/*.yaml; do
  [ -f "$f" ] || continue
  slug=$(basename "$f" .yaml)
  echo "  $slug"
  node "$AGNI_ROOT/packages/agni-cli/cli.js" "$f" --format=html --output="$DIST/${slug}.html"
done
echo "Done. Run: python sushichef_ols.py --token=YOUR_STUDIO_TOKEN"
