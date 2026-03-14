# AGNI Run Environments

**Single source of truth for hardware constraints.** Other docs and package headers should reference this file. See "Linking to this document" below.

---

## Edge device baseline (canonical)

- **OS:** Android 7.0 (Nougat, API 24)
- **WebView:** Chrome 51
- **JavaScript:** ES5 only (no `let`/`const`, arrow functions, template literals, `class`, spread, etc.)
- **Stack:** Vanilla JS, HTML5, CSS3 — no frameworks

**Village Hub:**
- **Hardware:** Raspberry Pi — Node.js 14+, ARM, limited RAM

This document maps every piece of code to its run environment and enforced constraints.

---

## 1. Edge device (browser) — Android 7.0 (Nougat)

Runs in the student's browser/WebView. Must be **ES5** and **vanilla JavaScript, HTML5, CSS3**. No frameworks.

| Path | Role | ES5 |
|------|------|-----|
| `packages/agni-runtime/**/*.js` (except index.js, svg-catalog.js) | Lesson player, factories, telemetry, sensors | ✓ |
| `packages/agni-hub/sw.js` | Service Worker (cache) | ✓ |
| `packages/agni-hub/pwa/shell-boot.js` | PWA shell bootstrap | ✓ |
| `packages/agni-hub/pwa/precache.js` | Opportunistic precache | ✓ |
| `packages/agni-hub/pwa/shared.js` | Shared helpers for PWA | ✓ |
| `packages/agni-runtime/style.css` | Lesson UI styles | — |
| `packages/agni-runtime/shell/index.html` | Village Library shell | ⚠ CSS Grid (Chrome 57+) — may need fallback |
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

**Hub time (Pi without RTC):** Raspberry Pi has no hardware clock. On boot without network, the system clock may be epoch (1970). To avoid telemetry corruption (`AGNI_SENTRY_MIN_VALID_YEAR` rejects writes when year < 2020), set the clock via:
- USB sync: include `syncTimestamp` in the inbound payload; run sync with `AGNI_SYNC_SET_CLOCK=1` to set `date` from the payload (Linux only; requires appropriate permissions).
- Manual: `sudo date -s "2024-01-15 12:00:00"` after boot.
- See `docs/archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md` for time-skew details.

**Sessions / JWT:** Auth tokens use `exp` timestamps. If the hub clock is wrong (e.g. epoch), tokens may be rejected or behave unexpectedly. Ensure the Pi clock is set before relying on session auth.

**Memory (Pi):**
- `npm run start:hub` sets `NODE_OPTIONS=--max-old-space-size=512` to cap V8 heap and prevent OOM during KaTeX/Markdown compilation.
- `compileConcurrency`: 1 for Pi 3 (1GB RAM), 2 for Pi 4 (2GB). Set in hub-config.pi.json.

**Disk (Pi `serveDir/lessons`) — P2-20:** Automatic GC prevents disk exhaustion. Policy: keep compiled output only for slugs in `catalog.json` or with YAML in `yamlDir`. Orphan dirs (no catalog, no YAML) are pruned on hub startup (`rebuildLessonIndex`) and when a lesson is deleted via `/api/author/delete/:slug`. See `packages/agni-hub/gc-disk-lessons.js`. No automatic GC for old YAML backups — manage manually or via external cron.

**Service Worker cache eviction (P2-24):** The SW in `packages/agni-hub/sw.js` requests `navigator.storage.persist()` on activate when available (Chrome 55+); `shell-boot.js` also requests it when the page loads. Eviction: LESSON_CACHE uses FIFO via `cache.delete()` when `keys.length >= MAX_LESSON_CACHE_ENTRIES` (20). `navigator.storage.estimate()` triggers proactive eviction when usage > 85% of quota (logs to console for diagnostics). `QuotaExceededError` on `cache.put` is caught and handled gracefully (best-effort caching; response still returned). Factory files use versioned URLs (`?v=<version>`), so cache misses trigger fresh fetches. On older devices (e.g. Chrome 51), `persist` and `estimate` are not available; eviction remains best-effort.

**Service Worker fallback (B2):** When SW is unavailable or registration fails (e.g. private browsing, restricted storage, pre-Nougat WebView), the app continues to work. Lesson and factory fetches go directly to the network (no SW intercept). The factory-loader (`packages/agni-runtime/ui/factory-loader.js`) checks `caches` availability and falls back to direct fetch when the Cache API is absent. Both `shell-boot.js` and the lesson HTML shell (`hub-transform/assemble.js`) register the SW with `.catch()` to avoid unhandled rejections and log a warning. Offline lesson access is not available when SW is absent.

---

## 3. Node.js scripts and tools

Runs on developer machine or CI. Not edge, not necessarily Pi.

| Path | Role |
|------|------|
| `packages/agni-cli/cli.js` | CLI (compile, hub setup, lms-repair) |
| `scripts/*.js` | Verification, init, wizards |
| `tools/curriculum-gen/*.js` | Independent bulk lesson generator (not part of core AGNI) |
| `tests/*` | Unit, integration, contract tests |

---

## 4. Portal (teacher UI — browser)

Runs in teacher's browser. May use a modern desktop browser; not constrained to Nougat.

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

---

## Linking to this document

When documenting edge or hub constraints elsewhere, reference this file:

- **Short:** "See `docs/RUN-ENVIRONMENTS.md`"
- **Inline:** "Edge: Android 7.0 (Nougat), Chrome 51 — see `docs/RUN-ENVIRONMENTS.md`"
