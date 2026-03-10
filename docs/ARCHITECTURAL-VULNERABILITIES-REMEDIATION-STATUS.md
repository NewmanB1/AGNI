# Architectural Vulnerabilities — Remediation Status & Remaining Plan

This document tracks implementation status of the seven architectural vulnerabilities and outlines remaining work. The full specification is in `ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md`.

---

## Status Overview

| # | Vulnerability | Status | Location |
|---|---------------|--------|----------|
| 1 | Cache poisoning / device binding race | **Done** | hub-transform.js |
| 2 | False-atomic write (no fsync) | **Done** | packages/agni-engine, packages/agni-utils/json-store.js |
| 3 | Cycle-triggered global DoS | **Done** | packages/agni-hub/theta.js |
| 4 | Chrome 51 sensor event-loop exhaustion | **Done** | packages/agni-runtime/sensors/sensor-bridge.js |
| 5 | Ed25519 / TweetNaCl UI blocking | **Done** | integrity.js (defer), player.js (Verifying spinner), i18n |
| 6 | Time-skew telemetry corruption | **Done** | sentry.js, sync.js, markov.js, RUN-ENVIRONMENTS.md |
| 7 | KaTeX / Markdown memory spikes | **Done** | package.json, hub-config, RUN-ENVIRONMENTS.md |

---

## Completed Items (No Further Work)

### 1. Cache Poisoning & Device Binding Race — DONE
- **What was done:** IR-only cache; JIT signing per request; in-flight guard returns IR; all callers use `_assembleHtml(result.ir, opts)`.
- **Verification:** Unit and E2E tests per plan (if not yet written, add as follow-up).

### 2. False-Atomic Write — DONE
- **What was done:** `saveState` / `saveStateSync` use `fsync` / `fsyncSync` before `rename` in `packages/agni-engine/index.js`.
- **Follow-up:** Audit other critical JSON writers (mastery_summary, graph_weights, sync) and apply same pattern.

### 3. Cycle-Triggered Global DoS — DONE
- **What was done:** Graceful degradation; prune cycle nodes; exclude affected lessons; `AGNI_STRICT_SKILL_GRAPH=1` for strict mode.
- **Verification:** Unit test for cyclic graph; integration with cyclic content.

### 4. Chrome 51 Sensor Event-Loop Exhaustion — DONE
- **What was done:** 100 ms throttle in sensor-bridge; buffer readings; publish on interval.
- **Follow-up:** Optional `AGNI_SENSOR_THROTTLE_MS` env override; unit test for publish rate cap.

### 7. KaTeX & Markdown Memory Spikes — DONE
- **What was done:** `NODE_OPTIONS=--max-old-space-size=512`; `compileConcurrency` in hub-config; `hub-config.pi.json` sets `compileConcurrency: 1`.
- **Verification:** Run concurrent compiles on 1GB VM; confirm no OOM.

---

## Partial Items — Remaining Plan

### 5. Ed25519 / TweetNaCl UI Blocking — PARTIAL

**Done:**
- Async wrapper: `verify()` defers work with `setTimeout(0)` so main thread can paint before verification.

**Remaining work:**

| Step | Task | Effort | Owner |
|------|------|--------|-------|
| 5a | Add “Verifying…” spinner state in player before `verify()` | Low | Runtime |
| 5b | Product/security decision: is `LESSON_DATA + OLS_INTENDED_OWNER` acceptable hash scope? | Decision | Product |
| 5c | If yes: narrow signer (hub/CLI) and verifier to smaller payload | Medium | Compiler, hub, integrity |
| 5d | If no: evaluate Web Worker path — create `integrity-worker.js`, post message, verify off main thread | High | Runtime |
| 5e | Measure verification time on Android 7; target &lt; 100 ms perceived block | Low | QA |

**Recommended order:** 5a → 5b → 5c or 5d → 5e.

---

### 6. Time-Skew Telemetry Corruption — PARTIAL

**Done:**
- `AGNI_SENTRY_MIN_VALID_YEAR` (default 2020) in sentry.js.
- Reject POST `/api/telemetry` when system year &lt; threshold (503).
- Skip flush when clock invalid.

**Remaining work:**

| Step | Task | Effort | Owner |
|------|------|--------|-------|
| 6a | Add `syncTimestamp` to sync payload format; document in API | Low | Services |
| 6b | In sync apply path: optionally run `date -s <syncTimestamp>` (with safeguards, permissions) | Medium | Hub / sync |
| 6c | Markov cooldowns: design sequence-based schema (replace `Date.now()` with `observationCount`) | High | Engine |
| 6d | Implement sequence-based cooldowns in markov.js | High | Engine |
| 6e | Document hub time management in `docs/RUN-ENVIRONMENTS.md` | Low | Docs |
| 6f | Session/JWT: document clock dependency; consider short TTL | Low | Docs |

**Recommended order:** 6a, 6e, 6f (quick wins) → 6b (USB time sync) → 6c, 6d (Markov redesign).

---

## Phased Execution Plan

### Phase A — Quick Wins (1–2 days)
1. **5a** — “Verifying…” spinner in player.
2. **6a** — Add `syncTimestamp` to sync payload; document.
3. **6e** — Document hub time management.
4. **6f** — Document JWT/session clock dependency.
5. **2 (follow-up)** — Audit and apply fsync to mastery_summary, graph_weights, sync if not yet done.

### Phase B — Product Decisions (Blocking)
1. **5b** — Decide on integrity hash scope (full script vs LESSON_DATA + owner).
2. Plan 5c (narrow scope) or 5d (Worker) based on outcome.

### Phase C — Integrity Completion
1. **5c** or **5d** — Implement chosen integrity path.
2. **5e** — Measure and verify &lt; 100 ms perceived block on Android 7.

### Phase D — Time Sync
1. **6b** — Implement optional `date -s` in sync apply path.

### Phase E — Markov Redesign (Higher Effort)
1. **6c** — Design sequence-based cooldown schema.
2. **6d** — Implement in markov.js.
3. Migration path for existing cooldown data.

---

## Verification Checklist (All Items)

- [ ] #1: Two concurrent requests with different `deviceId` receive different `OLS_INTENDED_OWNER`.
- [ ] #2: `saveState` calls fsync before rename; manual power-loss test on Pi.
- [ ] #3: Cyclic curriculum sync; hub stays up; affected lessons excluded.
- [ ] #4: Simulate 120 events/sec; assert publish rate ≤ 10 Hz.
- [ ] #5: Verification time &lt; 100 ms perceived on Android 7; tampered content fails.
- [ ] #6: System year 1970; Sentry rejects writes; Markov with sequence-based cooldowns tested.
- [ ] #7: 3 concurrent compiles on 1GB VM; no OOM; Pi config recommends correct concurrency.

---

## References

- `docs/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md` — Full specification
- `docs/ARCHITECTURE-DETAILED.md` — Implementation details
- `docs/RUN-ENVIRONMENTS.md` — Hardware and environment constraints
