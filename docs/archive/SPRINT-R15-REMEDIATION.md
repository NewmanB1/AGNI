# Sprint R15: Post-R14 Remediation — Load Order, PWA Shell, Lock Timing, Tests

Addresses findings from the post-R14 harsh audit (2026-03-01). Focus areas:
critical factory load race condition, non-functional PWA shell, missing regression
tests, and file-lock timing bug. Follows `.cursor/rules/sprint-verification.md`
including mandatory Proof, Wiring, and Three Wiring Questions per fix.

**Scope:** 5 fixes, 12 new regression tests, 0 new CI gates (existing gates sufficient).

---

## Implementation Status

| # | Fix | Status | Tests |
|---|-----|--------|-------|
| **F1** | Factory load order: three-phase loading | Done | AUDIT-19 |
| **F2** | PWA shell: polyfills, factory-loader, lesson-data route, setSafeHtml | Done | — (integration) |
| **F3** | Regression tests for R14 claims | Done | AUDIT-15 through AUDIT-21 |
| **F4** | File lock timing: MAX_RETRIES exceeds STALE_TIMEOUT | Done | AUDIT-20 |
| **F5** | Sprint document (this file) | Done | — |

---

## F1: Factory Load Order — Three-Phase Loading

**Problem:** `loadDependencies()` loaded `deps[0]` first then all remaining deps
in parallel. After R14 made `polyfills.js` deps[0], `shared-runtime.js` lost its
guaranteed-first execution and could race with `svg-registry.js`, `svg-stage.js`,
etc. that depend on `window.AGNI_SHARED`.

**Fix:** Replaced the two-phase (one + rest) loading with explicit three-phase
loading based on file identity, not array position:

- Phase 1: `polyfills.js` (ES5 shims — must exist before any other JS executes)
- Phase 2: `shared-runtime.js` + `binary-utils.js` (no cross-dependency, safe to parallel)
- Phase 3: Everything else (depends on AGNI_SHARED from phase 2)

**Files changed:** `src/runtime/ui/factory-loader.js`

- [x] F1.1: Replace positional deps[0] logic with named-file phase classification
  - Proof: `tests/unit/regressions.test.js` → "AUDIT-19: factory-loader loadDependencies uses three-phase loading"
  - Wiring: `html.js` builds `factoryDeps[]` → embedded in `LESSON_DATA.requires.factories` → `factory-loader.js:loadDependencies()` classifies by filename → `runPhase(phase1).then(phase2).then(phase3)`
  - CI gate: `scripts/check-factory-order.js` (verifies polyfills.js is listed before shared-runtime.js)

**Three Wiring Questions:**
1. **Who calls this code?** — `player.js` calls `AGNI_LOADER.loadDependencies(LESSON_DATA)` on lesson boot.
2. **How does it get loaded?** — `factory-loader.js` is inlined into lesson HTML by `html.js` (step 9) and `hub-transform.js` (`_buildPwaShell`). Also served at `/factory-loader.js` for the PWA shell.
3. **What happens if it is missing?** — If the three-phase logic is removed, AUDIT-19 regression test fails. If factory-loader.js itself is missing, lesson HTML won't load any factories (visible as blank lesson with loading spinner stuck).

---

## F2: PWA Shell — Wire polyfills, factory-loader, lesson-data route, setSafeHtml

**Problem:** `server/pwa/shell.html` was completely non-functional:
- No `polyfills.js` loaded (ES5 APIs missing on Chrome 44)
- No `factory-loader.js` (factories never loaded, SVG stage never renders)
- `<script src="/lesson-data.js">` had no server route (404)
- `shared.js` never set `window.AGNI_SHARED`, so `setSafeHtml` was undefined
- HTML content rendered as plaintext instead of rich HTML

**Fix (4 files):**

### F2.1: `server/pwa/shell.html`
- Added `<script src="/factories/polyfills.js">` (loads from existing `/factories/` route)
- Added `<script src="/factory-loader.js">` (new route, see F2.3)
- Changed `<script src="/lesson-data.js">` to use the new server route (F2.3)
- Added `worker-src 'self'` to CSP meta tag
- Replaced `inset: 0` with `top:0;left:0;right:0;bottom:0` (Chrome 44 compat)

### F2.2: `server/pwa/shared.js`
- Added `sanitizeHtml()` and `setSafeHtml()` functions (matching shared-runtime.js API)
- Exposed `window.AGNI_SHARED = { setSafeHtml, sanitizeHtml, escapeAttr }` so `shell-boot.js` can render HTML content safely

### F2.3: `server/hub-transform.js`
- Added `GET /factory-loader.js` route serving `factory-loader.js` from FACTORY_DIR
- Added `GET /lesson-data.js?slug=<slug>` route that compiles a lesson and returns `var LESSON_DATA = <json>;` as a JS file

### F2.4: `server/pwa/shell-boot.js`
- Integrated with `AGNI_LOADER.loadDependencies()` when available (loads factories in correct dependency order before rendering)
- Used `AGNI_SHARED.setSafeHtml` for SVG container too (was using raw innerHTML)

- [x] F2.1: shell.html loads polyfills.js, factory-loader.js, lesson-data.js in order
  - Wiring: shell.html → `<script src="/factories/polyfills.js">` → hub-transform.js `/factories/` route → `src/runtime/polyfills.js`
  - Wiring: shell.html → `<script src="/factory-loader.js">` → hub-transform.js `/factory-loader.js` route → `src/runtime/ui/factory-loader.js`
  - Wiring: shell.html → `<script src="/lesson-data.js">` → hub-transform.js `/lesson-data.js` route → `compileLesson()` → sidecar JSON
- [x] F2.2: shared.js exposes window.AGNI_SHARED with setSafeHtml
  - Wiring: shell.html → `<script src="/shared.js">` → hub-transform.js `/shared.js` route → `server/pwa/shared.js` → sets `window.AGNI_SHARED`
- [x] F2.3: hub-transform.js serves /lesson-data.js and /factory-loader.js
  - Wiring: HTTP GET → `handleRequest()` → URL matching → `_sendText()` / `_sendFile()`
- [x] F2.4: shell-boot.js uses AGNI_LOADER before rendering
  - Wiring: shell.html → `<script src="/shell-boot.js">` → `boot()` → `AGNI_LOADER.loadDependencies()` → `renderLesson()`

**Three Wiring Questions (F2 aggregate):**
1. **Who calls this code?** — Browser loads shell.html on PWA install/navigate. Scripts execute in order.
2. **How does it get loaded?** — `<script src>` tags in shell.html, served by routes in hub-transform.js.
3. **What happens if it is missing?** — Without polyfills.js: ES5 API errors on Chrome 44. Without factory-loader.js: no factories load, SVG blank. Without lesson-data.js route: LESSON_DATA is null, error message displayed. Without AGNI_SHARED: HTML content renders as plaintext.

---

## F3: Missing Regression Tests

**Problem:** R14 audit found no regression tests for several key fixes.

**Tests added to `tests/unit/regressions.test.js`:**

| Test ID | What it proves | Sprint item |
|---------|---------------|-------------|
| AUDIT-15 | `sampleTheta` jitter retry does not mutate `state.bandit.A` | R14: Thompson copy fix |
| AUDIT-16 | `addMat` rejects row and column dimension mismatches | R14: math.js assertion |
| AUDIT-17 | SM-2 `easeFactor` is capped at exactly 3.0 (tight assertion) | R14: SM-2 upper bound |
| AUDIT-18 | `polyfills.js` defines `repeat` before `padStart` in source | R14: polyfill order |
| AUDIT-19 | `factory-loader.js` uses three-phase loading | R15-F1 |
| AUDIT-20 | File lock `MAX_RETRIES * interval > STALE_TIMEOUT_MS` | R15-F4 |
| AUDIT-21 | Governance routes `/api/governance/{report,policy,catalog}` return 401 without auth | R14: governance auth |

- [x] F3: All 12 new test cases pass (`npm test` → 681 pass, 0 fail)
  - Proof: `tests/unit/regressions.test.js` → AUDIT-15 through AUDIT-21

---

## F4: File Lock Timing

**Problem:** `MAX_RETRIES` (100) × `RETRY_INTERVAL_MS` (50ms) = 5,000ms retry
window. But `STALE_TIMEOUT_MS` = 10,000ms. A non-stale lock held for 6 seconds
would exhaust all retries before stale detection could fire, causing cascading
`Could not acquire lock` errors.

**Fix:** Increased `MAX_RETRIES` from 100 to 300. New math:
- Minimum retry window: 300 × 50ms = 15,000ms > 10,000ms stale timeout
- Average retry window: 300 × 75ms (50ms base + ~25ms random jitter) = 22,500ms
- This ensures at least one full stale-detection cycle completes within the retry window.

**File changed:** `src/utils/file-lock.js`

- [x] F4.1: MAX_RETRIES increased from 100 to 300
  - Proof: `tests/unit/regressions.test.js` → "AUDIT-20: file-lock MAX_RETRIES * interval exceeds STALE_TIMEOUT"
  - Wiring: `hub-tools/routes/telemetry.js` → `withLock()` → `acquire()` → retry loop uses `MAX_RETRIES`
  - Wiring: `hub-tools/routes/student.js` → `withLock()` → `acquire()` → retry loop uses `MAX_RETRIES`

**Three Wiring Questions:**
1. **Who calls this code?** — `withLock()` in `telemetry.js` (3 locks) and `student.js` (3 locks).
2. **How does it get loaded?** — `require('../../src/utils/file-lock')` in both route files.
3. **What happens if it is missing?** — AUDIT-20 regression test fails. At runtime, insufficiently long retry window causes lock acquisition failures under contention on Pi.

---

## Verification Summary

```
$ npm test
  681 tests, 0 failures (12 new: AUDIT-15 through AUDIT-21)

$ npm run verify:all
  OK: No orphaned source files (110 files scanned)
  OK: All .d.ts declarations match (5 pairs checked)
  OK: No unsafe innerHTML assignments (29 files scanned)
  OK: polyfills.js exists, in ALLOWED_FACTORY_FILES, ordered before shared-runtime.js
```
