# Sprint R11: Authentication Layer, Security Remediation & Verification

Addresses findings from the 2026-03-01 comprehensive codebase re-audit.
Previous sprints (R9, R10) claimed fixes that were not applied or were incomplete.
This sprint treats every prior "Done" claim as **unverified** and re-evaluates from source.

**Scope:** 7 phases across 4 weeks. Authentication infrastructure, critical security
fixes, data integrity, code correctness, portal hardening, test gaps, and verification.

**Core rule:** No item is marked Done until (a) a regression test in
`tests/unit/regressions.test.js` proves the fix, AND (b) a CI gate prevents
regression. See `.cursor/rules/sprint-verification.md`.

---

## Implementation Status

| Phase | Status | Summary |
|-------|--------|---------|
| **P1** | Pending | Hub authentication middleware — the single biggest gap |
| **P2** | Pending | Critical security fixes (7 exploitable vulnerabilities) |
| **P3** | Pending | Data integrity (race conditions, memory bounds, injection) |
| **P4** | Pending | Code correctness (bugs shipping as features) |
| **P5** | Pending | Portal hardening |
| **P6** | Pending | Test coverage for untested security-critical code |
| **P7** | Pending | CI gates and verification infrastructure |

---

## Phase P1: Hub Authentication Middleware

**Priority:** P0 — the entire hub API is unauthenticated.
**Duration:** 3–4 days.
**Rationale:** ~25 state-mutating endpoints have zero auth. Any device on the LAN
can corrupt mastery data, poison the LMS model, write files, and dump student records.
This phase creates the auth infrastructure that all other phases depend on.

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P1.1** | **Fix `requireAdmin` logic bug** | `hub-tools/context/auth.js:14` — condition `!creator.approved && creator.role !== 'admin'` lets any approved creator pass. **Fix:** change to `creator.role !== 'admin'`. Only `role === 'admin'` grants admin access. | Test: approved creator with `role: 'creator'` gets 403 on admin endpoint. |
| **P1.2** | **Create `requireAuth` middleware** | New function in `context/auth.js` that validates the session token and returns the creator object, but does NOT check role/approval. Used for endpoints that need "any logged-in user" (author save, governance read). | Test: request with valid token passes. Request without token gets 401. Expired token gets 401. |
| **P1.3** | **Create `requireRole(roles)` middleware** | Higher-order function: `requireRole(['admin', 'creator'])` returns middleware that checks the creator's role against the allowed list. Composes with `requireAuth`. | Test: creator with role 'creator' passes `requireRole(['creator','admin'])`. Role 'viewer' gets 403. |
| **P1.4** | **Add auth to author routes** | Wrap all of: `POST /api/author/save`, `POST /api/author/validate`, `POST /api/author/preview`, `GET /api/author/list`, `GET /api/author/:slug` with `requireAuth`. Keep `DELETE /api/author/delete/:slug` as `adminOnly`. | Test: unauthenticated POST to `/api/author/save` gets 401. Authenticated creator succeeds. |
| **P1.5** | **Add auth to telemetry routes** | `POST /api/telemetry` must require at minimum a shared device token or student PIN. **Design decision needed:** telemetry comes from student devices that don't have creator accounts. Options: (a) shared hub API key set during hub-setup, passed as `X-Hub-Key` header; (b) student pseudoId + PIN combo; (c) device attestation token. **Recommendation:** option (a) — simplest, one key per hub, set in `.env` as `AGNI_HUB_API_KEY`, checked by a `requireHubKey` middleware. Reverts to open access if key is not configured (backward-compat for existing deployments). | Test: with key configured, request without key gets 401. With correct key, succeeds. With no key configured, all requests pass (backward compat). |
| **P1.6** | **Add auth to student/group/override routes** | Wrap `POST/PUT /api/groups`, `POST /api/groups/:id/assign`, `POST /api/theta/override`, `POST /api/diagnostic`, `POST /api/student/checkpoint`, learning-path CRUD with `requireAuth` or `requireRole(['admin','creator'])` as appropriate. | Test: unauthenticated POST to each endpoint gets 401. |
| **P1.7** | **Add auth to LMS federation** | `POST /api/lms/federation/merge` must require admin auth. An unauthenticated merge endpoint allows model poisoning from any network device. | Test: unauthenticated merge gets 401. Admin-authed merge succeeds. |
| **P1.8** | **Add auth to data exposure endpoints** | `GET /api/theta/all`, `GET /api/step-analytics`, `GET /api/mastery-history`, `GET /api/collab/stats`, `GET /api/skill-graph` — wrap with `requireAuth`. These expose student learning data. | Test: unauthenticated GET to `/api/theta/all` gets 401. |
| **P1.9** | **Add auth to admin sync-test** | `POST /api/admin/sync-test` is missing `adminOnly`. Add it. This endpoint has SSRF and arbitrary file write — auth is the first defense layer. | Test: unauthenticated POST to `/api/admin/sync-test` gets 401. |

**Proof:** `tests/unit/regressions.test.js` → "R11-P1: requireAdmin rejects approved non-admin creators"
**CI gate:** `scripts/check-unauthed-routes.js` — grep hub-tools/routes/ for `router.post` and `router.put` without preceding auth middleware call. Fail if any found.

---

## Phase P2: Critical Security Fixes

**Priority:** P0 — exploitable without auth (until P1 lands), exploitable with auth after.
**Duration:** 3 days. Can partially parallel with P1.
**Dependency:** P2.1 (SSRF) and P2.3 (path traversal) are urgent even before P1 lands.

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P2.1** | **Fix SSRF in sync-test** | `routes/admin.js:50-85` — user-controlled `homeUrl` fetched by server. **Fix:** (a) validate URL against an allowlist of schemes (`http:`, `https:` only), (b) resolve hostname and reject private/loopback IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1, fc00::/7), (c) reject non-standard ports. | Test: `homeUrl: "http://169.254.169.254/"` gets rejected. `homeUrl: "http://public-server.example.com/"` passes. |
| **P2.2** | **Fix arbitrary file write in sync-test** | Same endpoint — user-controlled `usbPath`. **Fix:** validate `usbPath` starts with a configured safe prefix (default `/mnt/usb/`). Reject any path not under the prefix. Use `path.resolve()` + `startsWith()` check to prevent `../../` traversal. | Test: `usbPath: "/etc/cron.d"` gets rejected. `usbPath: "/mnt/usb/sync"` passes. |
| **P2.3** | **Fix path traversal in checkpoints** | `routes/student.js:20` — `pseudoId` not sanitized before `path.join(CHECKPOINTS_DIR, pseudoId)`. **Fix:** sanitize `pseudoId` with the same regex used for `lessonId`: `pseudoId.replace(/[^a-zA-Z0-9_-]/g, '_')`. Also add a `resolved.startsWith(CHECKPOINTS_DIR)` guard after `path.resolve()`. | Test: `pseudoId: "../../etc"` gets sanitized to `______etc` and stays inside checkpoints dir. |
| **P2.4** | **Fix password timing attack** | `accounts.js:194` — `hash !== creator.passwordHash` uses `!==`. **Fix:** `crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(creator.passwordHash, 'hex'))`. | Test: password verification still works. Code review: no `===`/`!==` on hash values in accounts.js. Proof: `regressions.test.js` → "R11-P2.4" |
| **P2.5** | **Fix integrity devMode bypass** | `runtime/integrity/integrity.js:112-115` — `?dev=1` URL param skips verification. **Fix:** Remove URL-based devMode from `verify()`. Dev mode must be baked in at build time via a `<meta name="agni-dev">` tag that the compiler controls, not a runtime URL parameter. In production builds, `isDevMode()` always returns false in the verify path. | Test: lesson loaded with `?dev=1` still verifies signature. Unsigned lesson with `?dev=1` fails verification. |
| **P2.6** | **Create missing `src/utils/csp.js`** | `server/hub-transform.js:54-55` requires `src/utils/csp.js` which doesn't exist, crashing the hub transform server. **Fix:** create the module with `generateNonce()` (returns a cryptographic random base64 string) and `buildCspMeta(nonce)` (returns a `<meta>` CSP tag with `script-src 'nonce-...'` instead of `unsafe-inline`). | Test: `require('src/utils/csp')` succeeds. `hub-transform.js` starts without `MODULE_NOT_FOUND`. `generateNonce()` returns 22+ character base64 string. `buildCspMeta(nonce)` returns valid CSP meta tag. |
| **P2.7** | **Fix SVG template injection** | `server/pwa/shared.js:3-6` — SVG factories interpolate props directly into attribute strings with template literals. **Fix:** add an `escapeAttr()` function that replaces `"`, `'`, `<`, `>`, `&` with XML entities. Apply to all interpolated prop values in all SVG generators. | Test: `props.fill = 'red" onload="alert(1)'` produces escaped attribute, not XSS. |

**Proof for each:** Named test in `regressions.test.js`.
**CI gate:** `scripts/check-innerhtml.js` (already created), new `scripts/check-unauthed-routes.js`.

---

## Phase P3: Data Integrity

**Priority:** P1 — data corruption under concurrent access or malicious input.
**Duration:** 2–3 days. After P1 (auth reduces attack surface).

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P3.1** | **Add file locking to all mutating route handlers** | `groups.js`, `parent.js`, `theta.js` (overrides), `student.js` (learning paths, diagnostics, checkpoints), `telemetry.js` — all perform load→mutate→save without locking. **Fix:** wrap each read-modify-write cycle in `withLock(filePath, async () => { ... })`. | Code review: every `saveJSONAsync` call in routes/ is inside a `withLock` callback. |
| **P3.2** | **Add file locking to `migrateLegacyPins`** | `accounts.js:484-502` — reads and writes students without lock. **Fix:** wrap in `withLock(STUDENTS_PATH, ...)`. | Test: concurrent `migrateLegacyPins` calls don't lose data. |
| **P3.3** | **Bound sentry event buffer** | `sentry.js:45-67` — unbounded `eventBuffer` array, no size cap, flush races. **Fix:** (a) cap at 50,000 events (reject with warning beyond), (b) add a `_flushing` boolean guard to prevent re-entrant flushes, (c) on error, log and discard rather than unshift (prevents infinite growth on persistent disk failure). | Test: buffer rejects events beyond cap. Concurrent flush attempts are serialized. |
| **P3.4** | **Add `pseudoId` validation to telemetry** | Even after P1.5 adds hub-key auth, validate that `pseudoId` and `lessonId` are non-empty strings matching `[a-zA-Z0-9_-]`. Reject events with invalid IDs before they reach mastery storage. | Test: telemetry event with `pseudoId: "../../etc"` is rejected. |
| **P3.5** | **Fix session cleanup race** | `accounts.js` `cleanExpiredSessions` reads sessions without lock, computes diff, saves. New sessions written between read and save are silently dropped. **Fix:** wrap in `withLock(SESSIONS_PATH, ...)`. | Test: session created during cleanup is preserved. |
| **P3.6** | **Fix parent IDOR** | `routes/parent.js` — `parentId` is a self-asserted query parameter with zero auth. **Fix:** parent endpoints must require either (a) a parent session token (add parent login flow), or (b) at minimum, rate limit + `parentId` must be a signed token issued during linking. Short-term: add rate limiting. Medium-term: add parent auth. | Short-term: rate limit on parent endpoints. Medium-term: parent auth flow. |

---

## Phase P4: Code Correctness

**Priority:** P2 — bugs shipping as features, data corruption vectors.
**Duration:** 2–3 days. Independent of P1-P3.

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P4.1** | **Fix confidence score bug** | `feature-inference.js:277-279` — `blooms.matchDensity`, `vark.matchDensity`, `dominantStyle.matchDensity` are all `undefined`. **Fix:** (a) `_detectBloomsCeiling` returns `{ bloomsCeiling, bloomsLabel, matchDensity }` where `matchDensity = matchCount / totalWords`; (b) `_profileVARK` returns `{ visual, auditory, readWrite, kinesthetic, matchDensity }` where `matchDensity = totalMatches / totalWords`; (c) `_detectTeachingStyle` returns `{ style, matchDensity }` where `matchDensity = maxScore / totalWords`. Update callers to destructure correctly. | Regression test `AUDIT-1` passes (confidence !== 0.5 for keyword-rich lessons). |
| **P4.2** | **Fix .d.ts declarations** | (a) `thompson.d.ts:6-10` — remove phantom `lessonIds` param from `selectLesson`; (b) `rasch.d.ts:5-9` — change return type from `void` to `number`; (c) `embeddings.d.ts:5-6` — change `ensureStudentVector`/`ensureLessonVector` return from `void` to `number[]`. | `npm run verify:dts` passes (exit code 0). Regression test `AUDIT-2` passes. |
| **P4.3** | **Add NaN/Infinity guards to engine** | (a) `embeddings.js:updateEmbedding` — if `!isFinite(gain)` throw; (b) `thompson.js:updateBandit` — same guard; (c) `rasch.js:updateAbility` — validate each `probeResults[i].correct` is boolean. Use `var isFinite = ...; if (!isFinite(gain)) throw new Error(...)` (ES5 note: global `isFinite` exists in ES5). | Regression test `AUDIT-3` passes (NaN gain throws or doesn't corrupt). |
| **P4.4** | **Fix Object.assign on string** | `feature-inference.js:306` — `Object.assign({}, dominantStyle, ...)` where `dominantStyle` is a string produces character-indexed keys. **Fix:** after P4.1, `dominantStyle` becomes an object `{ style, matchDensity }`, so the Object.assign works correctly. Verify the fix chains from P4.1. | Regression test `AUDIT-5` passes. |
| **P4.5** | **Fix UTF-8 body parsing** | `http-helpers.js:26-34` — `body += chunk` corrupts multi-byte characters at chunk boundaries. **Fix:** collect chunks in `const chunks = []`, then `Buffer.concat(chunks).toString('utf8')` in the `end` handler. | Test: POST body with emoji/CJK characters round-trips correctly. |
| **P4.6** | **Fix binary file copy** | `io.js:51` — `copyIfNewer` reads as UTF-8. **Fix:** use `fs.copyFileSync(sourcePath, destPath)`. | Test: binary file round-trips without corruption. |
| **P4.7** | **Fix `longestStreak` bug** | `streak.js:31` — `break` exits loop after first gap, missing historical maximums. **Fix:** remove the early `break`. Let the loop scan all 365 days. Update `currentStreak` tracking to stop after first gap but `longestStreak` continues scanning. | Test: student with 30-day historical streak + 3-day current streak → `longestStreak === 30`. |
| **P4.8** | **Fix `decodeURIComponent` crash** | `router.js:50` — throws `URIError` on malformed percent-encoding. **Fix:** wrap in try/catch, return 400 on `URIError`. | Test: request to `/api/users/%ZZ` gets 400, not 500. |
| **P4.9** | **Fix version drift** | Hardcoded versions in `hub-transform.js:234` (`'1.9.0'`), `sw.js:28` (`'agni-v1.9.0'`). **Fix:** both should read from `package.json` (hub-transform) or be stamped at build time (sw.js). For sw.js, add a build step that replaces a `__VERSION__` placeholder. | Test: `package.json` version bump is reflected in all version strings. CI gate: `scripts/check-version-sync.js`. |
| **P4.10** | **Delete dead `shared.js`** | `src/runtime/shared.js` — ESM duplicate of `shared-runtime.js`, never imported. **Fix:** `git rm src/runtime/shared.js`. | `npm run verify:dead-files` passes. |
| **P4.11** | **Fix `evaluateLessonCompliance` purity** | Documented as "Pure: no I/O" but lazily loads `utu-constants.json`. **Fix:** accept `utuConstants` as an optional third parameter. Caller (`governance/index.js`) loads and passes the constants. Remove the `fs`/`path` requires. | Function has no `require('fs')`. Test: same inputs always produce same outputs regardless of filesystem. |
| **P4.12** | **Fix theta BFS depth counter** | `theta.js:109-127` — `depth` increments per node, not per BFS level. **Fix:** use a level-based BFS: process all nodes at current depth before incrementing. Or simply remove the depth counter (the `visited` set already prevents cycles). | Test: wide graph with 100 nodes at depth 1 is fully explored. |
| **P4.13** | **Fix env-config/env-validate range discrepancy** | `env-config.js` allows `AGNI_EMBEDDING_DIM` 1-1024; `env-validate.js` allows 4-256. Port 0 accepted in one but not the other. **Fix:** single source of truth — remove validation from `env-config.js`, consolidate into `env-validate.js`. Or make `env-config.js` import ranges from `env-validate.js`. | One module defines valid ranges. No contradictions. |

---

## Phase P5: Portal Hardening

**Priority:** P2 — privacy issues, missing auth guards.
**Duration:** 2 days. After P1 (depends on hub auth endpoints existing).

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P5.1** | **Add auth guard to admin pages** | `routes/admin/accounts/+page.svelte` loads creator and student data with no auth check. **Fix:** check `creatorProfile` on mount (same pattern as author/edit page). Redirect to login if not authenticated. Apply to all `/admin/*` and `/governance/*` routes. | Test: unauthenticated navigation to `/admin/accounts` redirects to login. |
| **P5.2** | **Fix unauthenticated API calls** | `api.ts` — `getCreators()` and `getStudentAccounts()` use `get()` instead of `authGet()`. **Fix:** change to `authGet()`. | Code review: no `get()` calls for sensitive data endpoints. |
| **P5.3** | **Stop exposing PINs to portal** | `routes/admin/accounts/+page.svelte:100` — student PIN populated into plaintext input. **Fix:** hub API should never return raw PINs. Return `hasPIN: true/false` instead. PIN reset creates a new PIN and returns it once. Edit mode shows "PIN set" / "No PIN" instead of the actual value. | Test: GET student accounts response has no `pin` field. |
| **P5.4** | **Add request timeouts** | `api.ts` — all `fetch()` calls lack `AbortController`/timeout. **Fix:** create a `fetchWithTimeout(url, opts, timeoutMs = 10000)` wrapper that aborts on timeout. Use throughout. | Test: fetch to unreachable host rejects within timeout. |
| **P5.5** | **Hide admin navigation by role** | `+layout.svelte:66-78` — all navigation links visible regardless of auth. **Fix:** conditionally render admin/governance links only when `creatorProfile?.role === 'admin'`. | Test: non-admin user doesn't see admin links. |
| **P5.6** | **Validate hub URL** | `api.ts:829-836` — `setHubUrl` accepts any string. **Fix:** validate scheme is `http:` or `https:`, hostname is non-empty, no embedded credentials. | Test: `javascript:alert(1)` is rejected. `http://192.168.1.10:8082` passes. |
| **P5.7** | **Fix notification permission timing** | `+layout.svelte:47-49` — requests notification permission on first load. **Fix:** only request after user interaction (e.g., "Enable notifications" button in settings). | Notification permission not requested until user action. |

---

## Phase P6: Test Coverage for Security-Critical Code

**Priority:** P2 — untested code in the authentication and file-handling paths.
**Duration:** 3 days. After P1-P4 (tests validate the fixed code).

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P6.1** | **Test rate limiting** | `accounts.js` login rate limiter (5 per 60s) is untested. Write tests: 5 attempts succeed, 6th gets 429, wait for window expiry, next attempt succeeds. | ≥3 tests for rate limiting behavior. |
| **P6.2** | **Test session TTL expiry** | No test that expired sessions are rejected. Write test: create session, advance time past 24h, validate session → rejected. | ≥2 tests for session expiry. |
| **P6.3** | **Test `crypto.js`** | `signContent` and `canonicalJSON` have zero tests. Write tests: (a) sign and verify round-trip, (b) canonicalJSON produces deterministic output with reordered keys, (c) NaN in object produces consistent output, (d) signContent throws on non-string input. | ≥6 tests for crypto module. |
| **P6.4** | **Test `http-helpers.js`** | `readBody`, `safeErrorMessage`, `extractBearerToken` untested. Write tests: (a) body size limit enforced, (b) multi-byte UTF-8 preserved (after P4.5 fix), (c) filesystem error messages sanitized, (d) bearer token extracted from header, (e) token extracted from query string. | ≥5 tests for http-helpers. |
| **P6.5** | **Test `file-lock.js`** | Zero tests. Write tests: (a) lock acquire/release cycle, (b) second acquire blocks until first releases, (c) stale lock is cleaned up, (d) `withLock` releases on exception. | ≥4 tests for file-lock. |
| **P6.6** | **Test `json-store.js`** | Zero tests. Write tests: (a) save then load round-trip, (b) atomic write — crash during write doesn't corrupt existing file, (c) load non-existent file returns default. | ≥3 tests for json-store. |
| **P6.7** | **Test `router.js`** | Zero tests. Write tests: (a) parameterized route extraction, (b) 404 for unmatched routes, (c) malformed percent-encoding returns 400 (after P4.8). | ≥3 tests for router. |
| **P6.8** | **Test hub route auth** | After P1, write contract tests that verify every state-mutating endpoint returns 401 without auth. Use the existing `tests/contract-hub-api.js` pattern. | ≥15 auth contract tests (one per protected endpoint). |
| **P6.9** | **Fix streak test** | `shared-utils.test.js` streak test doesn't exercise the `longestStreak` bug (no historical streak longer than current). After P4.7 fix, add test: 30-day historical + 3-day current → `longestStreak === 30`. | Test exercises the exact case where the bug manifested. |
| **P6.10** | **Fix logger test** | `shared-utils.test.js` logger test only checks `typeof === 'function'`. Write real tests: (a) `log.info` writes to file, (b) log level filtering, (c) extra fields don't overwrite `ts`/`level` (after fixing the log injection in `logger.js`). | Logger tests verify actual output, not just method existence. |

---

## Phase P7: CI Gates and Verification Infrastructure

**Priority:** P3 — prevent regression of all fixes above.
**Duration:** 2 days. After all other phases.

| # | Task | Details | Acceptance Criterion |
|---|------|---------|---------------------|
| **P7.1** | **Create `scripts/check-unauthed-routes.js`** | Grep `hub-tools/routes/` for `router.post` and `router.put` lines. For each, verify the route handler or its wrapping function includes an auth call (`requireAuth`, `requireAdmin`, `adminOnly`, `requireHubKey`, `requireRole`). Exit non-zero if any unprotected mutating route is found. | Script passes after P1. Script would have caught the current state. |
| **P7.2** | **Create `scripts/check-version-sync.js`** | Read version from `package.json`. Grep `hub-transform.js`, `sw.js`, and any other files for hardcoded version strings. Exit non-zero if they don't match. | Script catches version drift introduced by P4.9 fix. |
| **P7.3** | **Wire all new gates into CI** | Add to `validate.yml`: `check-unauthed-routes`, `check-version-sync`. Existing gates from prior work: `verify:dead-files`, `verify:dts`, `verify:innerhtml`. | All 5 verification scripts run in CI on every push. |
| **P7.4** | **Update sprint doc with Proof lines** | After all fixes land, go back through this document and add `Proof: tests/unit/regressions.test.js → "R11-Px.y"` lines to every completed item. Also add proof lines for CI gate scripts. | Every `[x]` item has a `Proof:` line. |
| **P7.5** | **Verify R10 claims** | Go through `SPRINT-R10-HARDENING.md` line by line. For each "Done" item, check if the fix actually exists in source. Mark any that were never applied as `[ ] NOT DONE — addressed in R11 Px.y`. | R10 doc accurately reflects reality. |

---

## Dependency Graph

```
P1 (Auth middleware) ─── do first, everything depends on this ──────────┐
    P1.1 (requireAdmin fix) — immediate, no deps                        │
    P1.2-P1.3 (requireAuth, requireRole) — new middleware                │
    P1.4-P1.9 (wire auth to routes) — depends on P1.2-P1.3              │
                                                                         │
P2 (Critical security) ─── parallel with P1 where possible ─────────────┤
    P2.1-P2.3 (SSRF, file write, path traversal) — no P1 dep, do NOW   │
    P2.4 (timing attack) — no P1 dep                                    │
    P2.5 (integrity bypass) — no P1 dep                                 │
    P2.6 (missing csp.js) — no P1 dep                                   │
    P2.7 (SVG injection) — no P1 dep                                    │
                                                                         │
P3 (Data integrity) ─── after P1 (auth reduces attack surface) ─────────┤
    P3.1-P3.5 are independent of each other                             │
    P3.6 (parent IDOR) — depends on auth design from P1                 │
                                                                         │
P4 (Code correctness) ─── fully independent of P1-P3 ───────────────────┤
    P4.1 → P4.4 (confidence fix chains to Object.assign fix)            │
    P4.2, P4.3, P4.5-P4.13 are independent of each other               │
                                                                         │
P5 (Portal) ─── after P1 (needs hub auth endpoints) ────────────────────┤
    P5.1-P5.7 are independent of each other                             │
                                                                         │
P6 (Tests) ─── after P1-P4 (tests validate the fixed code) ─────────────┤
    P6.1-P6.10 are independent of each other                            │
                                                                         │
P7 (CI gates) ─── after all other phases ────────────────────────────────┘
    P7.4 (proof lines) and P7.5 (R10 verification) go last
```

---

## Execution Order

```
Week 1 (security-critical, parallel tracks):
  Track A: P1.1-P1.3 (auth middleware infra)
  Track B: P2.1-P2.7 (critical security — no auth dep)
  Track A cont: P1.4-P1.9 (wire auth to routes, after P1.2-P1.3)

Week 2 (data + correctness):
  P3.1-P3.6 (data integrity)
  P4.1-P4.6 (highest-impact code fixes: confidence, types, NaN, UTF-8)

Week 3 (remaining correctness + portal):
  P4.7-P4.13 (remaining code fixes)
  P5.1-P5.7 (portal hardening)

Week 4 (tests + gates):
  P6.1-P6.10 (test coverage)
  P7.1-P7.5 (CI gates + verification)
```

P2.1-P2.3 (SSRF, file write, path traversal) should be **done on day 1** — they're
exploitable right now with zero authentication.

---

## Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Unauthenticated state-mutating endpoints | ~25 | 0 (or hub-key gated) |
| Exploitable SSRF | 1 | 0 |
| Exploitable path traversal | 1 | 0 |
| Arbitrary file write | 1 | 0 |
| Timing-attack-vulnerable password check | 1 | 0 |
| Client-bypassed integrity verification | 1 | 0 |
| Missing modules that crash server | 1 (`csp.js`) | 0 |
| SVG injection vectors | 6+ factories | 0 |
| Race conditions on file ops | ~8 route handlers | 0 |
| Unbounded memory buffers | 1 (sentry) | 0 (capped) |
| Confidence scores hardcoded to 0.5 | 3 | 0 (dynamic) |
| .d.ts lies | 5 mismatches | 0 |
| NaN corruption vectors in engine | 3 | 0 |
| Dead source files | 1 | 0 |
| Untested security-critical modules | ~10 | 0 |
| CI verification gates | 3 (from prior work) | 8 |
| Portal pages without auth guard | ~8 admin/gov pages | 0 |
| Student PINs exposed in plaintext | Yes | No |

---

## References

- **2026-03-01 first audit** — Engine, compiler, feature inference (13 findings)
- **2026-03-01 second audit** — Hub server, portal, security layer (30+ findings)
- **R10 sprint** — `docs/SPRINT-R10-HARDENING.md` (claimed done; verification pending in P7.5)
- **Verification rule** — `.cursor/rules/sprint-verification.md`
- **Existing CI gates** — `scripts/check-dead-files.js`, `scripts/check-dts-arity.js`, `scripts/check-innerhtml.js`
- **Regression tests** — `tests/unit/regressions.test.js` (7 failing = 7 known bugs)
