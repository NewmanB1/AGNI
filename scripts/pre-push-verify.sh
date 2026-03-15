#!/bin/sh
# Optional pre-push hook: run verify:all before pushing to catch failures early.
# Install: cp scripts/pre-push-verify.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
# Or run manually: ./scripts/pre-push-verify.sh

set -e
cd "$(dirname "$0")/.."
echo "Running verify:all before push..."
npm run verify:all
echo "verify:all passed."
