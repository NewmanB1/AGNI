# AGNI Run Environments

**Hardware constraints (canonical):**
- **Village Hub:** Raspberry Pi — Node.js 14+, ARM, limited RAM
- **Edge devices (students):** Android 6.0 Marshmallow — Chrome 44 WebView, ES5 only, vanilla JS/HTML5/CSS3

This document maps every piece of code to its run environment and enforced constraints.

---

## 1. Edge device (browser) — Android Marshmallow

Runs in the student's browser/WebView. Must be **ES5** and **vanilla JavaScript, HTML5, CSS3**. No frameworks.

| Path | Role | ES5 |
|------|------|-----|
| `packages/agni-runtime/**/*.js` (except index.js, svg-catalog.js) | Lesson player, factories, telemetry, sensors | ✓ |
| `packages/agni-hub/sw.js` | Service Worker (cache) | ✓ |
| `packages/agni-hub/pwa/shell-boot.js` | PWA shell bootstrap | ✓ |
| `packages/agni-hub/pwa/precache.js` | Opportunistic precache | ✓ |
| `packages/agni-hub/pwa/shared.js` | Shared helpers for PWA | ✓ |
| `packages/agni-runtime/style.css` | Lesson UI styles | — |
| `src/runtime/shell/index.html` | Village Library shell | ⚠ CSS Grid (Chrome 57+) — may need fallback |
| `packages/agni-runtime/shell/library.js` | Library logic for shell | ✓ |

**Excluded from edge:** `packages/agni-runtime/index.js`, `packages/agni-runtime/svg-catalog.js` — Node-only tooling.

---

## 2. Village Hub (Node.js on Raspberry Pi)

Runs on the Raspberry Pi server. Node 14+.

| Path | Role |
|------|------|
| `packages/agni-hub/*.js` (except sw.js, pwa/*.js) | Theta, hub-transform, routes, sync, sentry |
| `packages/agni-engine/*.js` | LMS: Rasch, Thompson, embeddings, federation, math |
| `packages/agni-services/*.js` | Accounts, author, governance, LMS, lesson-chain, compiler |
| `packages/ols-compiler/*.js` | Lesson compilation |
| `packages/agni-governance/*.js` | Policy, compliance, catalog |
| `packages/agni-utils/*.js` | Utilities (used by hub, compiler, etc.) |
| `packages/ols-schema/*.js` | Schema, validators |
| `hub-tools/theta.js`, `hub-tools/sync.js`, `hub-tools/sentry.js` | Entry wrappers |
| `server/hub-transform.js` | Shim to hub |

**Config:** `data/hub-config.pi.json` — Pi-optimized settings (see `scripts/check-hub-config-pi.js`).

---

## 3. Node.js scripts and tools

Runs on developer machine or CI. Not edge, not necessarily Pi.

| Path | Role |
|------|------|
| `src/cli.js` | CLI (compile, hub setup, lms-repair) |
| `scripts/*.js` | Verification, init, wizards |
| `tools/curriculum-gen/*.js` | LLM lesson generator |
| `tests/*` | Unit, integration, contract tests |

---

## 4. Portal (teacher UI — browser)

Runs in teacher's browser. May use a modern desktop browser; not constrained to Marshmallow.

| Path | Role |
|------|------|
| `portal/*.html`, `portal/js/*.js`, `portal/css/*.css` | Teacher admin UI |

---

## 5. Dual-use / Node-only runtime

| Path | Runs on |
|------|---------|
| `packages/agni-runtime/index.js` | Node (RUNTIME_ROOT, resolve) |
| `packages/agni-runtime/svg-catalog.js` | Node (compiler, portal) |

---

## 6. Legacy / deprecated

| Path | Notes |
|------|-------|
| `player.js` (root) | Legacy player; uses ES6. Canonical: `packages/agni-runtime/ui/player.js`. |

---

## Verification

- **ES5 for edge:** `npm run test:es5` (checks `packages/agni-runtime` + `packages/agni-hub/sw.js` + `packages/agni-hub/pwa/*.js`)
- **Hub Pi config:** `npm run verify:hub-config-pi`
- **Run-environment headers:** `npm run verify:run-environments`
- **Run-environment unit tests:** `node --test tests/unit/run-environments.test.js`

These run as part of `npm run verify:all`.
