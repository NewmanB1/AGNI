# Sprint R10: Security Hardening & Completion Verification

Addresses findings from the 2026-03-01 comprehensive codebase audit.
Continues from R9 (all phases done) in `docs/SPRINT-R9-FIXES.md`.

**Scope:** 5 phases — Trust Boundaries, Concurrency & Data Safety, CI/CD & Infrastructure, Algorithm Extraction & Testing, Structural Debt & Verification Gates.

**Core principle:** Every fix in this sprint has a **machine-verifiable acceptance criterion**. No item is marked Done until a CI gate, test, or lint rule prevents regression. This addresses the chronic "Done but not done" pattern identified across D7–R9.

---

## Implementation Status

| Phase | Status | Summary |
|-------|--------|---------|
| **P1** | **Done** | Trust boundary & XSS hardening (devMode, innerHTML, postMessage, feature flags, canonical JSON) |
| **P2** | **Done** | Concurrency, timing attacks, memory safety (file locks, timingSafeEqual, bounded caches, checkpoint fix) |
| **P3** | **Done** | CI/CD pipeline & infrastructure (cosign, multi-arch, Playwright, build-all, async gzip) |
| **P4** | **Done** | Algorithm extraction, ES5 compliance, test depth (SM-2, Array.from/padStart/inset, steady evaluator, telemetry index) |
| **P5** | **Done** | Structural debt (badge externalization, env validation, sentry hardening, no-var/prefer-const ESLint) |

---

## Phase P1: Trust Boundary & XSS Hardening

**Priority:** P0 — exploitable security issues.
**Duration:** 2–3 days.

| # | Task | Deliverable | Success | Gate |
|---|------|-------------|---------|------|
| **P1.1** | **Fix integrity devMode bypass** | In `src/runtime/integrity/integrity.js`, `verify()` (line 93) skips verification when `devMode` is true. But `devMode` is derived from `LESSON_DATA._devMode` — **inside the data being verified**. An attacker who tampers with lesson content can set `_devMode: true` to bypass verification entirely. **Fix:** Remove the `devMode` parameter from `verify()`. Derive dev mode from an out-of-band source: a `<meta>` tag set by the build tool, or `AGNI_SHARED._devMode` set by the factory-loader based on a URL parameter (`?dev=1`). The lesson data payload must never control its own verification. | `verify()` ignores `LESSON_DATA._devMode`. Dev mode is derived from builder/URL, not payload. | Unit test: a tampered lesson with `_devMode: true` still fails verification. |
| **P1.2** | **Sanitize innerHTML in player.js** | `src/runtime/ui/player.js` uses `innerHTML = step.htmlContent` in 31 locations. Content is pre-compiled Markdown HTML, but if community-contributed lessons ever enter the pipeline, this is stored XSS. **Fix:** Route all `innerHTML` assignments through a shared `AGNI_SHARED.setSafeHtml(element, html)` helper that strips `<script>`, `on*` attributes, and `javascript:` URIs. Use a DOM-based approach (parse into a detached `<template>`, walk and strip) for ES5 compatibility. Alternatively, use the existing `rehype-sanitize` schema during compilation to guarantee the HTML is safe before it reaches the runtime. | All `innerHTML` assignments go through sanitization. | `test:es5` passes. Manual test: inject `<img onerror=alert(1)>` into a step's markdown — it is stripped before rendering. |
| **P1.3** | **Validate postMessage origin in sensor-bridge** | `src/runtime/sensors/sensor-bridge.js` `_onPhyphoxMessage()` (line 295) accepts messages from any origin with `type: 'phyphox'`. An attacker on the same network can inject fake sensor readings to auto-complete hardware-trigger steps. **Fix:** Add `event.origin` validation. Accept messages only from: (a) the same origin (`event.origin === location.origin`), (b) `'null'` (file:// protocol sandboxed iframes), (c) an explicit allowlist stored in `LESSON_DATA.phyphoxOrigins` (set by the lesson author). Reject all others silently. | `_onPhyphoxMessage` checks `event.origin` before processing. | Unit test (JSDOM): message from disallowed origin is ignored. Message from same origin is processed. |
| **P1.4** | **Fix feature flag rollout independence** | `src/utils/feature-flags.js` `isEnabled()` (line 60) hashes only `studentId`. Two flags at `rollout: 50` activate for the exact same 50% of students, making independent A/B testing impossible. **Fix:** Hash `flagName + ':' + studentId` instead of just `studentId`. This makes each flag's assignment independent. | `isEnabled()` hashes `flagName + ':' + studentId`. | Unit test: two flags at rollout 50 produce measurably different student sets (>80% Jaccard distance across 1000 synthetic IDs). Old test for bucket uniformity still passes. |
| **P1.5** | **Canonicalize JSON for integrity hashing** | `src/runtime/integrity/integrity.js` uses `JSON.stringify(lesson)` (lines 35, 68) for content hashing. Key ordering in `JSON.stringify` is implementation-dependent. A lesson signed on Node 20 may fail verification on Chrome 49 if key order differs. **Fix:** Replace `JSON.stringify(lesson)` with a canonical serializer that sorts object keys recursively. Implement as `AGNI_SHARED.canonicalJSON(obj)` — a ~20-line ES5 function that walks the object and produces deterministic output. Use in both `integrity.js` and `src/utils/crypto.js` `signContent()`. | Both signing (Node) and verification (browser) use the same canonical serializer. | Integration test: sign a lesson in Node, verify in a JSDOM environment — passes. Swap two top-level keys in the IR — verification still passes (canonical ordering). |

---

## Phase P2: Concurrency & Data Safety

**Priority:** P1 — data corruption under concurrent access.
**Duration:** 2 days.

| # | Task | Deliverable | Success | Gate |
|---|------|-------------|---------|------|
| **P2.1** | **Extend file locking to all mutating account operations** | `src/services/accounts.js`: `registerCreator` (line 121) and `createStudentsBulk` (line 322) use `withLock`. The remaining 8 mutating operations do not: `createStudent` (304), `updateStudent` (350), `generateTransferToken` (369), `claimTransferToken` (384), `verifyStudentPin` (408 — writes on migration), `setCreatorApproval` (243), `recordLessonAuthored` (253), `loginCreator` session write (179-187). **Fix:** Wrap each in `withLock(STUDENTS_PATH, ...)` or `withLock(CREATORS_PATH, ...)` as appropriate. The session write in `loginCreator` needs `withLock(SESSIONS_PATH, ...)`. | Every load-modify-save cycle in accounts.js is wrapped in `withLock`. | Review: `grep -n "saveStudents\|saveCreators\|saveJson.*SESSIONS" src/services/accounts.js` — every match is inside a `withLock` callback. Stress test: 10 concurrent `createStudent` calls produce 10 distinct records with no data loss. |
| **P2.2** | **Timing-safe legacy PIN comparison** | `src/services/accounts.js` line 420: `hashPinLegacy(pin) === student.pinHash` uses string `===` for hash comparison, enabling timing attacks. **Fix:** Replace with `crypto.timingSafeEqual(Buffer.from(hashPinLegacy(pin), 'hex'), Buffer.from(student.pinHash, 'hex'))`. Add a length check first (different lengths → reject immediately, which is safe since the length itself doesn't leak the secret). | Legacy PIN comparison uses `timingSafeEqual`. | Unit test: `verifyStudentPin` with a legacy SHA-256 hash still succeeds for correct PIN and fails for incorrect PIN. Code review confirms no `===` on hash values. |
| **P2.3** | **Bound memory growth in rate limiter and theta cache** | (a) `_loginAttempts` in `accounts.js` (line 149) grows forever. **Fix:** Add a periodic sweep — every 60s, delete entries older than `LOGIN_WINDOW_MS`. Or cap at 10,000 keys and evict oldest on overflow. (b) `thetaCache` in `hub-tools/shared.js` is an unbounded `Map`. **Fix:** Add a max-size check (e.g., 500 entries). On overflow, `clear()` the entire map (simple, and cache misses just re-compute). | Both caches have bounded growth. | Unit test for rate limiter: after 10,001 unique emails, memory usage is bounded. Code review confirms `thetaCache` has a size guard. |
| **P2.4** | **Replace custom Promise in checkpoint.js** | `src/runtime/telemetry/checkpoint.js` lines 114-125 implement a hand-rolled Promise where `.catch` callbacks (`_ecbs`) are populated but **never invoked** — `onerror` (line 152) calls `_cbs`, not `_ecbs`. Error handling is silently broken. **Fix:** Replace the custom thenable with a real XHR-based pattern. For ES5 compatibility (Chrome 44 lacks native Promise), use a Promises/A+-compliant micro-polyfill (~30 lines) registered on `AGNI_SHARED`, or restructure `loadRemote` to accept `onSuccess`/`onError` callbacks directly (matching the existing call pattern in player.js). | Error callbacks are invoked on XHR failure. | Unit test (mock XHR): network error triggers the error callback. |
| **P2.5** | **Add locking to claimTransferToken** | `claimTransferToken` (line 384) is vulnerable to double-claim: two devices submitting the same token simultaneously both find the student, both clear the token, both get `{ ok: true }`. **Fix:** Wrap in `withLock(STUDENTS_PATH, ...)` (covered by P2.1, but called out separately due to security impact). | `claimTransferToken` is wrapped in `withLock`. | Unit test: two near-simultaneous claims with the same token — exactly one succeeds, the other gets "Invalid or expired transfer token". |

---

## Phase P3: CI/CD & Infrastructure

**Priority:** P1 — the pipeline must stop lying; the Docker image must work on target hardware.
**Duration:** 2–3 days.

| # | Task | Deliverable | Success | Gate |
|---|------|-------------|---------|------|
| **P3.1** | **Wire cosign signing into docker-publish.yml** | Cosign is installed (line 34) but never invoked. Add a `cosign sign` step after `build-and-push` that signs the image digest with the GitHub OIDC identity (keyless signing). | Pushed images are signed. | `cosign verify --certificate-identity-regexp '.*' --certificate-oidc-issuer-regexp '.*' ghcr.io/newmanb1/agni:latest` succeeds. |
| **P3.2** | **Add multi-arch Docker build for Pi** | Add `platforms: linux/amd64,linux/arm64,linux/arm/v7` to the `docker/build-push-action` step. Add QEMU setup step for cross-compilation. | Docker image runs on Raspberry Pi (ARM). | `docker manifest inspect ghcr.io/newmanb1/agni:latest` shows arm64 and arm/v7 manifests. |
| **P3.3** | **Wire Playwright e2e tests into CI** | Add a new job to `validate.yml`: start the hub server, wait for health, run `npx playwright test`, upload report as artifact. Use `npx playwright install --with-deps chromium` for minimal footprint. | E2e tests run on every push/PR. | Playwright job appears in CI and fails if smoke test fails. |
| **P3.4** | **Build all lessons in CI** | Replace the single-lesson `npm run build` with a dynamic build step: `for f in lessons/*.yaml; do node src/cli.js "$f" --format=html --output="dist/$(basename "$f" .yaml).html"; done`. Or create `npm run build:all-lessons`. | Every lesson YAML in `lessons/` is compiled in CI. | `ls dist/*.html` matches `ls lessons/*.yaml` count. |
| **P3.5** | **Align CSP: nonce-based for CLI builder** | `src/builders/html.js` line 209 uses `'unsafe-inline'` while `hub-transform.js` uses nonce-based CSP via `buildCspMeta()`. **Fix:** Generate a nonce in `buildHtml()`, pass it through `buildLessonScript()`, and add `nonce="..."` to the `<script>` tag. Update the CSP meta tag to use `'nonce-<value>'` instead of `'unsafe-inline'`. | CLI-built lessons use nonce-based CSP. | Manual test: CLI output HTML contains `nonce=` on the script tag and `nonce-` in the CSP header. No `'unsafe-inline'` for `script-src`. |
| **P3.6** | **Add PWA manifest icons** | `server/manifest.json` references `/icons/icon-192.png` and `/icons/icon-512.png` that don't exist. **Fix:** Either (a) add icon files to `server/icons/`, or (b) add a build step that generates them from a source SVG, or (c) remove the icon references from the manifest if PWA install is not yet supported. | Icon paths in manifest resolve to real files, or manifest has no dangling references. | CI: validate manifest icon paths resolve (add to `validate-all.js`). |
| **P3.7** | **Replace synchronous gzip with async** | `server/hub-transform.js` uses `zlib.gzipSync()` (blocking the event loop on every request). On a Pi serving 30 devices, this serializes all responses. **Fix:** Replace with `zlib.gzip()` (callback) or a `pipeline(Readable.from(buf), zlib.createGzip(), res)` stream. | No synchronous zlib calls in hub-transform.js. | `grep -n "gzipSync" server/hub-transform.js` returns empty. Load test: 10 concurrent requests complete without serialized blocking (p99 < 2× p50). |

---

## Phase P4: Algorithm Extraction & Testing

**Priority:** P2 — untested algorithms and compatibility violations.
**Duration:** 3–4 days.

| # | Task | Deliverable | Success | Gate |
|---|------|-------------|---------|------|
| **P4.1** | **Extract SM-2 spaced repetition into a testable module** | The SM-2 algorithm is implemented inline in `hub-tools/routes/telemetry.js` lines 48-76. It has **zero test coverage**. A single-character bug would silently corrupt review schedules for every student. **Fix:** Extract to `src/engine/sm2.js` with a pure function `updateSchedule(existing, quality) → { interval, easeFactor, repetition, ... }`. Add unit tests with known SM-2 reference values: (a) quality 5 with repetition 0 → interval 1, (b) quality 5 with repetition 1 → interval 6, (c) quality 5 with repetition 2 → interval = round(6 × ef), (d) quality 2 → repetition resets to 0, (e) ease factor floor of 1.3. | SM-2 algorithm extracted into a pure function with ≥8 unit tests. Route handler calls the extracted function. | `npm test` includes sm2 tests. `grep -n "easeFactor" hub-tools/routes/telemetry.js` shows only a call to the extracted module, not inline math. |
| **P4.2** | **Fix ES6 on ES5 target in runtime** | Four violations in runtime code targeting Chrome 44: (a) `Array.from` + `padStart` in `src/runtime/telemetry/telemetry.js` line 190-194. **Fix:** Replace `Array.from(...)` with a manual loop, `.padStart(2, '0')` with `('0' + hex).slice(-2)`. (b) CSS `inset: 0` in `src/runtime/ui/a11y.js` line ~116. **Fix:** Replace with `top:0;right:0;bottom:0;left:0`. | No ES6+ syntax or APIs in `src/runtime/`. | `npm run test:es5` passes. Add `Array.from`, `padStart`, and `inset` to the ES5 checker patterns in `scripts/check-es5.js`. |
| **P4.3** | **Fix `steady` evaluator left-side handling** | `src/runtime/sensors/threshold-evaluator.js` lines 230-250: the `AND` evaluator only checks `rightIsSteady`. If `steady` appears on the LEFT side of AND (e.g., `steady > 1s AND accel.total > 5`), the `_passed` parameter is never provided and `steady` can never trigger. **Fix:** Add `leftIsSteady` handling that passes the right evaluator's result to the left `steady` function. | `steady` works on either side of AND. | Unit test: `steady > 1s AND accel.total > 5` triggers correctly when conditions are met for 1 second. |
| **P4.4** | **Index telemetry events by pseudoId for theta** | `hub-tools/theta.js` line 263-264 loads and scans ALL telemetry events for every student recommendation request. As data grows, theta response time degrades linearly. **Fix:** Maintain a lightweight in-memory index (`Map<pseudoId, Event[]>`) that is rebuilt when the telemetry file mtime changes (same cache-invalidation pattern already used for mastery/schedule in theta.js). Or pre-aggregate frustration scores per student in the telemetry ingest path (P4.1's extraction gives a clean hook). | Theta frustration lookup is O(1) per student, not O(n) over all events. | Benchmark: theta response time with 10,000 events is < 2× response time with 100 events. |
| **P4.5** | **Add meaningful gate-renderer tests** | `tests/unit/gate-renderer.test.js` currently has 8 tests that only verify DOM children exist. They don't test quiz answer logic, `max_attempts`, `retry_delay`, or `passing_score`. **Fix:** Add ≥6 tests: (a) correct answer resolves to 'pass', (b) wrong answer shows retry feedback, (c) max_attempts reached resolves to 'fail', (d) retry_delay enforced between attempts, (e) passing_score threshold, (f) manual verification code acceptance. | Gate renderer has behavioral tests, not just structural tests. | `npm test` includes gate-renderer behavioral tests. |
| **P4.6** | **Pin numerical values in engine tests** | Engine tests (rasch, thompson) only verify directional behavior ("ability increases on correct"). For a reference implementation, tests should pin exact numerical values. **Fix:** Add ≥4 pinned-value tests: (a) Rasch: 2 correct probes at difficulty 0 → assert specific ability value (Newton-Raphson MAP result), (b) Rasch: mixed correct/incorrect → assert specific delta, (c) Thompson: known A matrix + b vector → assert specific theta vector, (d) Markov: recorded transition → assert specific edge weight. | Engine math is regression-tested against exact reference values. | Tests fail if the algorithm output changes by more than 1e-6. |

---

## Phase P5: Structural Debt & Verification Gates

**Priority:** P3 — prevent the "Done but not done" pattern.
**Duration:** 3–4 days.

| # | Task | Deliverable | Success | Gate |
|---|------|-------------|---------|------|
| **P5.1** | **Complete student.js route split** | D8.8 is marked "Done" but `hub-tools/routes/student.js` is still 376 lines with 14 routes. **Fix:** Actually complete the split: `routes/analytics.js` (step-analytics, mastery-history, skill-graph, collab-stats), `routes/reviews.js` (reviews, streaks, badges), `routes/diagnostics.js` (diagnostic GET/POST), `routes/learning-paths.js` (learning paths CRUD). Wire into theta.js router. | No route file exceeds ~120 lines. | `wc -l hub-tools/routes/student.js` ≤ 120. Contract tests pass unchanged. |
| **P5.2** | **Clean up dual filenames** | Git status shows both old and new filenames coexisting (e.g., `src/compiler/buildLessonIR.js` + `src\compiler\build-lesson-ir.js`). S4.2 file renames created new files instead of using `git mv`. **Fix:** For each pair: verify the new file is correct, `git rm` the old file, ensure all `require()` paths reference the new name. Affected: ~25 file pairs across `src/`, `hub-tools/`, `data/`, `schemas/`, `scripts/`, `tests/`, `docs/`. | `git status` shows no untracked files that duplicate a tracked file. | `git ls-files --others --exclude-standard` shows no file whose kebab-case equivalent is already tracked. |
| **P5.3** | **Extract badge definitions from route handler** | `hub-tools/routes/student.js` lines 185-197 hardcode badge names, thresholds, and metadata inline. **Fix:** Move to `data/badge-definitions.json` (with a JSON schema) or a `src/config/badges.js` module. Route handler reads the definitions at request time. | Badge definitions live in a config/data file, not in route handler code. | Adding a new badge requires zero changes to route handler code. |
| **P5.4** | **Add range validation to env-config.js** | Ports accept any integer (negative, zero, >65535). `masteryThreshold` has no bounds. **Fix:** Add validation in `env-config.js`: ports must be 1-65535, `masteryThreshold` must be 0.0-1.0, `embeddingDim` must be ≥1. Throw on invalid values at startup (fail fast). | Invalid config values crash at startup with a clear message. | Unit test: `AGNI_THETA_PORT=-1` throws. `AGNI_MASTERY_THRESHOLD=999` throws. |
| **P5.5** | **Extract HTTP routes from feature-flags.js** | `src/utils/feature-flags.js` `registerRoutes()` (lines 83-141) couples the utility module to HTTP routing. **Fix:** Move to `hub-tools/routes/flags.js`. The utility module exports only pure functions (`loadFlags`, `isEnabled`, etc.). | `src/utils/feature-flags.js` has no HTTP/router code. | `grep -n "router\|sendResponse\|req\|res" src/utils/feature-flags.js` returns empty. |
| **P5.6** | **Fix sentry event validation dropping steps** | `hub-tools/sentry.js` `validateEvent()` requires `steps` to be a valid array but the validated output object **doesn't include `steps`**. Data passes validation then gets silently stripped. **Fix:** Include `steps` in the validated output, or remove the `steps` requirement from validation if they're intentionally dropped. | Validation input requirements match output shape. | Code review: every field checked in validation appears in the output object. |
| **P5.7** | **Add CI gate for data directory cleanliness** | R3.5 specified this but it was never implemented. Tests in `tests/integration/feature-flags.test.js` and `tests/integration/frustration-theta.test.js` still write to `data/`. **Fix:** (a) Migrate both integration tests to `fs.mkdtempSync` temp directories. (b) Add a CI step that checksums `data/*.json` before and after `npm test` — fail if any file changed. | Tests cannot pollute committed data files. | CI step: `sha256sum data/*.json > /tmp/before && npm test && sha256sum -c /tmp/before`. |
| **P5.8** | **Add Docker Compose for multi-service deployment** | The system runs 3+ services on different ports (theta:8082, sentry:8081, serve:8080) but has no orchestration file. **Fix:** Add `docker-compose.yml` with three services sharing a `data/` volume. Include healthchecks, restart policies, and a `.env` template for port configuration. | `docker compose up` starts all services. | `docker compose up -d && curl localhost:8082/health` returns 200. |
| **P5.9** | **Enforce `var` ban outside runtime via ESLint** | Mixed `var`/`const`/`let` across non-runtime files (`env-config.js`, `feature-flags.js`, `crypto.js`, `theta.js`). S5.1 claimed `no-var` was added but it is **not present** in `eslint.config.js`. **Fix:** Add `'no-var': 'error'` and `'prefer-const': 'error'` to the default rule set. Add an override for `src/runtime/**` and `player.js` to disable both rules (ES5 target requires `var`). Fix all resulting violations in non-runtime files. | `npm run lint` passes with zero `var` warnings outside runtime. | `grep -rn "^var \|[^a-zA-Z]var " hub-tools/ src/ --include="*.js" --exclude-dir=runtime` returns empty. |
| **P5.10** | **Add completion verification checklist to sprint process** | Create `.github/PULL_REQUEST_TEMPLATE.md` with a checklist: `[ ] CI green`, `[ ] No new lint warnings`, `[ ] Acceptance criterion from sprint doc verified`, `[ ] Gate column check passes`. This prevents the "mark done without verification" pattern. | PR template enforces verification. | Template file exists. First PR using it demonstrates the checklist. |

---

## Hardware Constraints (affects all phases)

Inherited from R9. Reproduced for reference.

- **Student devices:** Android 6.0 Marshmallow — Chrome 49 WebView, 512MB–1GB RAM, intermittent or no connectivity.
- **Village hub:** Raspberry Pi — ARM CPU, SD card storage (slow random I/O, limited write endurance), Node 18+, single-process server.

Implications for this sprint:
- **P1.2** (innerHTML sanitization): Must be ES5, no DOMParser (Chrome 49 DOMParser doesn't support `text/html`). Use `<template>` element or manual string stripping.
- **P1.5** (canonical JSON): Must be ES5-compatible. No `Object.entries`, no `Array.from`.
- **P2.4** (Promise replacement): Chrome 44 lacks native Promise. Use callback pattern or micro-polyfill.
- **P3.2** (multi-arch Docker): ARM build is the whole point — the image must run on Pi.
- **P3.7** (async gzip): Critical for Pi's single-threaded server under concurrent load.

---

## Dependency Graph

```
P1 (Trust Boundaries) ──── do first, security-critical ──────────────┐
    P1.1 + P1.2 + P1.3 are independent of each other                │
    P1.4 independent (feature-flags.js only)                         │
    P1.5 depends on P1.1 (shared canonical JSON util)                │
                                                                      │
P2 (Concurrency) ──── after P1 (accounts.js touched in both) ────────┤
    P2.1–P2.5 are independent of each other                          │
    P2.1 subsumes P2.5 (claimTransferToken locking)                  │
                                                                      │
P3 (CI/CD) ──── fully independent, can parallel P1/P2 ───────────────┤
    P3.1–P3.7 are independent of each other                          │
                                                                      │
P4 (Algorithms) ──── after P1 (touches runtime files) ────────────────┤
    P4.1 independent (new module extraction)                          │
    P4.2 independent (ES5 fixes)                                      │
    P4.3 independent (threshold evaluator only)                       │
    P4.4 depends loosely on P4.1 (frustration pre-aggregation hook)  │
    P4.5 + P4.6 are test-only changes, independent                   │
                                                                      │
P5 (Structural) ──── after P4 (file moves after algorithm work) ──────┘
    P5.1 independent (route split)
    P5.2 depends on all other phases (clean up after renames)
    P5.7 independent (CI gate)
    P5.9 after P5.2 (lint after all file moves)
    P5.10 goes last (process gate for future sprints)
```

---

## Execution Order

```
Week 1:  P1.1–P1.4 (trust boundaries)     +  P3.1–P3.4 (CI/CD, parallel)
Week 2:  P1.5 (canonical JSON)             +  P2.1–P2.5 (concurrency)
         P3.5–P3.7 (remaining CI/CD)
Week 3:  P4.1–P4.3 (SM-2 extraction, ES5, threshold)
         P4.4–P4.6 (theta indexing, test depth)
Week 4:  P5.1–P5.6 (structural cleanup)
         P5.7–P5.10 (verification gates)
         P5.2 last (clean up dual filenames after all other changes)
```

P1 and P3 are independent — parallelizable by different contributors.
P2 items are independent of each other — parallelizable within the phase.
P5.2 (dual filename cleanup) MUST go last — after all other file-touching work is done.
P5.10 (PR template) goes last — it gates all future work.

---

## Decision Log

1. **innerHTML sanitization strategy (P1.2): compile-time sanitization preferred.**
   `rehype-sanitize` already exists in `package.json` dependencies. Running it during Markdown compilation (in `src/markdown-pipeline.js`) guarantees `step.htmlContent` is safe before it ever reaches the runtime. This is more robust than runtime DOM-based stripping (which must be ES5, can't use DOMParser on Chrome 44/49, and adds ~30 lines of fragile browser code). Runtime `setSafeHtml` is a defense-in-depth fallback.

2. **Custom Promise replacement (P2.4): callback pattern over polyfill.**
   The `loadRemote` function in `checkpoint.js` is called exactly once (player.js line ~1461). Restructuring to accept `onSuccess`/`onError` callbacks is simpler, smaller, and avoids adding a Promise polyfill to the runtime bundle. The hand-rolled thenable is deleted entirely.

3. **SM-2 extraction (P4.1): pure function in `src/engine/`.**
   The SM-2 algorithm belongs with the other learning algorithms (Rasch, Thompson, Markov) in `src/engine/`, not in a route handler. The extracted function is pure (no I/O, no state) — easy to test, easy to reuse if spaced repetition is needed in the client runtime.

4. **Dual filename cleanup (P5.2): single commit, last in sprint.**
   Git status shows ~25 file pairs from S4's incomplete renames. These are addressed in one pass after all other work is complete, to avoid merge conflicts with concurrent changes. Use `git rm` on old files + verify all `require()` paths reference new names.

5. **Cosign keyless signing (P3.1): GitHub OIDC, no manual key management.**
   Keyless signing with Fulcio/Rekor via `cosign sign --yes` uses GitHub Actions' OIDC identity provider. No secrets to manage. Verifiers check the certificate chain against GitHub's OIDC issuer.

---

## Corrections from Audit

The following items from the 2026-03-01 audit were found to be inaccurate during plan development:

1. **`</script>` XSS breakout — already fixed.** `src/services/lesson-assembly.js` line 21 performs `dataString.replace(/<\/script>/gi, '<\\/script>')`. Both `html.js` and `hub-transform.js` use `lessonAssembly.buildLessonScript()`, so both paths are protected. This was fixed in a prior sprint but not documented as a security fix.

2. **Portal lockfile missing — needs verification.** The audit claimed `portal/package-lock.json` was missing, but the git status shows it's tracked. The CI cache key references it (line 82 of `validate.yml`). Verify by running the portal CI job — if it passes, this is a non-issue.

3. **`shared.js` namespace collision — mitigated by design.** The flat spread in `shared.js` is intentional: the 6 context modules are designed with non-overlapping exports (each prefixed by domain: `DATA_DIR`, `MASTERY_SUMMARY`, `adminOnly`, `handleJsonBody`, etc.). The risk is theoretical, not practical, and is mitigated by the focused module design from S4.8.

---

## Verification

After all phases complete:

```bash
npm run lint                # zero warnings
npm run typecheck           # zero errors
npm run test:all            # all unit + integration + contract + graph pass
npm run test:coverage       # ≥85% line coverage via c8
npm run test:es5            # runtime ES5 compliance (Array.from, padStart, inset added)
git status                  # no untracked files duplicating tracked files
git diff --stat main        # all changes accounted for

# New gates added by this sprint:
# - CI data-dir checksum before/after tests (P5.7)
# - Cosign verification on pushed images (P3.1)
# - Playwright e2e in CI (P3.3)
# - Multi-arch manifest check (P3.2)
# - PR template checklist (P5.10)
```

---

## Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Exploitable trust boundary bypasses | 1 (integrity devMode) | 0 |
| innerHTML without sanitization | 31 | 0 (compile-time + runtime defense) |
| PostMessage without origin validation | 1 | 0 |
| Non-independent A/B flag rollout | Broken (same bucket) | Independent per flag |
| Mutating account ops without locks | 8 | 0 |
| Timing-vulnerable hash comparisons | 1 (legacy PIN) | 0 |
| Unbounded memory caches | 2 | 0 (bounded) |
| Broken Promise error handling | 1 (checkpoint.js) | 0 (callback pattern) |
| Unsigned Docker images | All | 0 (cosign) |
| Docker architectures | amd64 only | amd64 + arm64 + arm/v7 |
| E2e tests in CI | None | Playwright on every push |
| Lessons built in CI | 1 (gravity.yaml) | All |
| SM-2 algorithm test coverage | 0 tests | ≥8 tests |
| ES6 violations in ES5 runtime | 4+ | 0 |
| Route file max size | 376 lines | ≤120 lines |
| Untracked duplicate files | ~25 pairs | 0 |
| Machine-enforced verification gates | 0 | 5 new CI gates |

---

## References

- **2026-03-01 audit** — Comprehensive codebase evaluation (30 findings, P0–P3)
- **R9 sprint** — `docs/SPRINT-R9-FIXES.md` (S1–S5, all complete)
- **DRY sprints** — `docs/SPRINT-DRY-REFACTOR.md` (D7–D12, all complete)
- **Remediation sprints** — `docs/SPRINT-REMEDIATION.md` (R1–R8, R8 partial)
- **Conventions** — `docs/CONVENTIONS.md`
- **API contract** — `docs/api-contract.md`
