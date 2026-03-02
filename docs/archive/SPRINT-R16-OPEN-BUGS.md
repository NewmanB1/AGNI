# Sprint R16: Verified Open Bugs

Replaces `SPRINT-R11-REMEDIATION.md` (retired — ~80% of its items were already
fixed by R10/R15 but the document was never updated). This sprint contains
**only issues verified as still present** in the codebase as of 2026-03-01.

Every item includes the exact file path, line numbers, and code context at time
of writing. Follows `.cursor/rules/sprint-verification.md`.

**Scope:** 12 fixes across 3 phases — Concurrency, Correctness, Infrastructure.

---

## Implementation Status

| Phase | Status | Summary |
|-------|--------|---------|
| **C1** | **Done** | Concurrency: file locking gaps in 4 route/service files |
| **C2** | **Done** | Correctness: sentry buffer, streak bug, sentry body parsing |
| **C3** | **Done** | Infrastructure: SW version, sentry retention, PageRank cache |

---

## Phase C1: File Locking Gaps

**Priority:** P1 — data corruption under concurrent access on Pi.
**Duration:** 1 day.
**Context:** `withLock` from `src/utils/file-lock.js` is already used in
`routes/telemetry.js` and parts of `routes/student.js`. The pattern is proven;
these files were simply missed.

| # | Task | File | Details | Acceptance Criterion |
|---|------|------|---------|---------------------|
| **C1.1** | **Add locking to groups routes** | `hub-tools/routes/groups.js` | Three mutating endpoints do bare load→mutate→save without `withLock`: `POST /api/groups` (line 16–20), `PUT /api/groups` (line 29–35), `POST /api/groups/:id/assign` (line 44–61). Import `withLock` from `../../src/utils/file-lock` and wrap each read-modify-write cycle. The groups file path comes from `ctx` — use the same path as `loadGroupsAsync` targets. For the assign endpoint, both the groups file and overrides file are read/written — lock each independently. | Code review: every `saveGroupsAsync` and `saveOverridesAsync` call is inside a `withLock`. Regression test: 5 concurrent `POST /api/groups` produce 5 distinct groups. |
| **C1.2** | **Add locking to parent routes** | `hub-tools/routes/parent.js` | Two mutating endpoints lack locks: `POST /api/parent/invite` (line 22–29: load → push invite → save) and `POST /api/parent/link` (line 40–51: load → mutate invite + push link → save). Import `withLock` and wrap each. Use the parent-links file path from `ctx`. | Code review: every `saveParentLinksAsync` call is inside `withLock`. |
| **C1.3** | **Add locking to checkpoint save** | `hub-tools/routes/student.js:32–45` | `POST /api/checkpoint` does `loadJSONAsync(filePath)` → compare timestamps → `saveJSONAsync(filePath)` without a lock. Two concurrent checkpoint saves for the same student+lesson could lose data. Wrap in `withLock(filePath, ...)`. Note: other mutating endpoints in this file (`POST /api/diagnostic` line 238, `POST /api/learning-paths` line 329, `PUT /api/learning-paths` line 354) already use `withLock` — only checkpoints were missed. | `withLock` wraps the checkpoint load-compare-save cycle. |
| **C1.4** | **Add locking to session cleanup and destroy** | `src/services/accounts.js` | `cleanExpiredSessions` (lines 237–245) and `destroySession` (lines 248–258) both do `loadJson(SESSIONS_PATH)` → mutate → `saveJson(SESSIONS_PATH)` without locks. Meanwhile, `loginCreator` (line ~201) **does** lock `SESSIONS_PATH`. A concurrent login + cleanup could lose the new session. Wrap both functions in `withLock(SESSIONS_PATH, ...)`. | Code review: every `saveJson(SESSIONS_PATH, ...)` call is inside `withLock`. |

**Verification:** `npm test` passes. Stress test: 10 concurrent operations on each locked path produce no data loss.

---

## Phase C2: Correctness Bugs

**Priority:** P2 — silent data corruption and logic errors.
**Duration:** 1–2 days.

| # | Task | File | Details | Acceptance Criterion |
|---|------|------|---------|---------------------|
| **C2.1** | **Bound sentry event buffer** | `hub-tools/sentry.js:45–67` | `eventBuffer` grows without limit. If events arrive faster than the 30s flush interval, or if `fs.appendFile` fails repeatedly (line 63 `unshift`s the failed batch back), memory grows unbounded. Additionally, no guard prevents re-entrant flushes. **Fix:** (a) Cap `eventBuffer` at 50,000 entries — reject with `log.warn` beyond that. (b) Add a `_flushing` boolean; skip the flush interval if a previous flush is still in-flight. (c) On persistent write failure, log and **discard** rather than `unshift` (line 63) — re-queuing on failure creates an infinite growth loop. | `appendEvents` rejects when buffer exceeds cap. Concurrent flush attempts are serialized. `unshift` on error is removed. |
| **C2.2** | **Fix sentry UTF-8 body parsing** | `hub-tools/sentry.js:104–109` | The HTTP receiver uses `body += chunk` (string concatenation). Multi-byte UTF-8 characters split across chunk boundaries get corrupted. **Fix:** Use the same `Buffer.concat` pattern already proven in `src/utils/http-helpers.js:24–35`: collect chunks in an array, `Buffer.concat(chunks).toString('utf8')` in the `end` handler. | Telemetry event with emoji/CJK characters in `lessonId` round-trips correctly. |
| **C2.3** | **Fix `longestStreak` early exit** | `src/utils/streak.js:32` | `if (currentStreak > 0) break;` exits the 365-day scan as soon as the current streak ends (first gap after today). Any historical streak further back is never examined. A student with a 2-day current streak and a 30-day streak from 3 months ago reports `longestStreak: 2`. **Fix:** Remove the `break`. Let the loop continue scanning after the current streak ends. `currentStreak` tracking stops on first gap (don't update it after the gap), but `tempStreak`/`longestStreak` keep scanning the full 365-day window. | Test: `computeStreaks(['2026-03-01', '2026-02-28', '2025-12-01', ...<30 consecutive days>])` → `currentStreak: 2`, `longestStreak: 30`. |

**Verification:** `npm test` passes. New regression tests in `tests/unit/regressions.test.js`.

---

## Phase C3: Infrastructure & Cache Cleanup

**Priority:** P3 — operational hygiene.
**Duration:** 1–2 days.

| # | Task | File | Details | Acceptance Criterion |
|---|------|------|---------|---------------------|
| **C3.1** | **Fix hardcoded SW version** | `server/sw.js:28` | `var SW_VERSION = 'agni-v1.9.0';` is hardcoded while `package.json` is `0.1.0`. Unlike `hub-transform.js` (which reads `require('../package.json').version`), the service worker can't use `require()` — it runs in the browser. **Fix:** Add a build step or startup stamp. Options: (a) `hub-transform.js` already serves `/sw.js` — read the file, replace a `__SW_VERSION__` placeholder with the package version before serving. (b) A `scripts/stamp-sw.js` that reads `package.json` version and writes it into `sw.js`, run as a prepublish/prebuild step. Option (a) is simpler since hub-transform already processes this file. | `SW_VERSION` matches `package.json` version. CI gate: `scripts/check-version-sync.js` verifies no hardcoded version strings remain. |
| **C3.2** | **Add sentry data retention** | `hub-tools/sentry.js` | The `EVENTS_DIR` accumulates daily `.ndjson` files forever. On a Pi's SD card, this eventually fills the disk. **Fix:** Add a `pruneOldEvents(maxAgeDays)` function that deletes `.ndjson` files older than `maxAgeDays` (default 90, configurable via `AGNI_SENTRY_RETENTION_DAYS` in `env-config.js`). Call it (a) on sentry startup (line 323–326) and (b) after each successful `runAnalysis()` (line 319). Only delete files whose date prefix is older than the cutoff — the filename format `YYYY-MM-DD.ndjson` makes this a simple string comparison. | `pruneOldEvents(90)` deletes files older than 90 days. New files are untouched. Configurable via env var. |
| **C3.3** | **Fix PageRank cache leak** | `src/engine/pagerank.js:386,407` | `scoreCandidates()` writes `_cache._currGraph = currGraph` (line 386) and reads it back (line 407) for personalized PageRank. But `invalidateCache()` (lines 46–51) does **not** clear `_currGraph` — it only clears `curriculumRanks` and `transitionRanks`. After invalidation, a stale curriculum graph persists and feeds into personalized PageRank scoring. **Fix:** Add `_cache._currGraph = null;` to `invalidateCache()`. Also document the `_currGraph` field in the cache object (line 35–41) so it's no longer undocumented. | `invalidateCache()` clears all cached state including `_currGraph`. The field is documented in the cache object. |
| **C3.4** | **Add parent auth (design + short-term fix)** | `hub-tools/routes/parent.js:58,78` | `parentId` is a self-asserted query parameter. `GET /api/parent/children` (line 77–85) and `GET /api/parent/child/:pseudoId/progress` (line 56–75) accept any `parentId` from any caller with the hub key. Any student device that knows the hub key can enumerate all parent data. **Short-term fix:** Add rate limiting to both GET endpoints (5 req/min per IP, same pattern as login). **Medium-term:** Parent accounts with their own session tokens (separate from creator accounts). The short-term fix is in scope for this sprint; the medium-term is deferred. | Rate limiting applied to parent GET endpoints. Documented as a known limitation pending parent auth. |

**Verification:** `npm test` passes. `npm run verify:all` passes.

---

## Also Addressed (from R8 backlog)

Items C3.2 and C3.3 close the two remaining open items from `SPRINT-REMEDIATION.md` Phase R8:
- R8.3 (Sentry data retention) → C3.2
- R8.5 (PageRank cache testability) → C3.3

After this sprint, R8 can be marked fully complete.

---

## Out of Scope

The following R11 items were verified as **already fixed** and are excluded:

| R11 Item | Fixed In | Verification |
|----------|----------|-------------|
| P1.1 requireAdmin logic bug | R9/R10 | `auth.js:20` checks `role !== 'admin'` only |
| P2.1 SSRF in sync-test | R10 | `admin.js:63–84` has private IP blocklist |
| P2.3 Path traversal in checkpoints | R10 | `student.js:23–28` sanitizes + startsWith guard |
| P2.4 Password timing attack | R10 | `accounts.js:196` uses `timingSafeEqual` |
| P2.6 Missing csp.js | R10/R15 | `src/utils/csp.js` exists, 33 lines |
| P2.7 SVG template injection | R10 | `shared.js:7–9` has `escapeAttr()` |
| P4.1 Confidence scores always 0.5 | R10 | All three functions return `matchDensity` |
| P4.8 decodeURIComponent crash | R10 | `router.js:50–53` has try/catch |
| P4.9 hub-transform version drift | R10 | `hub-transform.js:242` reads `package.json` |
| P4.10 Dead shared.js | R9/R10 | File does not exist |
| P5.2 Unauthenticated API calls | R10 | `api.ts` uses `authGet()` |
| P5.3 PIN exposed in plaintext | R10 | `type="password"`, server returns `hasPin` only |
| Feature flag rollout independence | R10 P1.4 | Hashes `flagName + ':' + studentId` |
| Checkpoint.js broken Promise | R10 P2.4 | `_reject()` invokes `_ecbs` correctly |

---

## Dependency Graph

```
C1 (File locking) ─── independent items, can all be done in parallel ──┐
                                                                        │
C2 (Correctness) ──── independent of C1, can parallel ─────────────────┤
    C2.1 + C2.2 both touch sentry.js — do in one commit                │
    C2.3 independent (streak.js only)                                   │
                                                                        │
C3 (Infrastructure) ── independent of C1/C2, can parallel ─────────────┘
    C3.1 independent (sw.js + hub-transform.js)
    C3.2 touches sentry.js — coordinate with C2.1/C2.2
    C3.3 independent (pagerank.js only)
    C3.4 touches parent.js — coordinate with C1.2
```

C2.1 + C2.2 + C3.2 all touch `hub-tools/sentry.js` — do them in one pass.
C1.2 + C3.4 both touch `hub-tools/routes/parent.js` — do them in one pass.

---

## Execution Order

```
Pass 1:  C1.1 (groups locking)
         C1.3 (checkpoint locking)
         C1.4 (session locking)
         C2.3 (streak bug)
         C3.1 (SW version)
         C3.3 (PageRank cache)

Pass 2:  C1.2 + C3.4 (parent.js: locking + rate limit — one commit)
         C2.1 + C2.2 + C3.2 (sentry.js: buffer + UTF-8 + retention — one commit)
```

All items in Pass 1 are independent. Pass 2 groups co-located changes.

**Estimated duration:** 3–5 days total.

---

## Verification

```bash
npm run lint              # zero warnings
npm run typecheck         # zero errors
npm test                  # all unit + integration pass
npm run verify:all        # dead-files, dts, innerhtml, factory-order, es5
```

---

## References

- **Retired:** `docs/SPRINT-R11-REMEDIATION.md` (superseded by this document)
- **R8 closure:** `docs/SPRINT-REMEDIATION.md` Phase R8 — C3.2 and C3.3 close last two open items
- **Verification rule:** `.cursor/rules/sprint-verification.md`
- **File locking pattern:** `hub-tools/routes/telemetry.js:19–57` (reference implementation)
