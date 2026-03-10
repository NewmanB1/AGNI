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
| 5 | Ed25519 / TweetNaCl UI blocking | **Done** | integrity.js (defer, narrow scope), player.js, crypto.js |
| 6 | Time-skew telemetry corruption | **Done** | sentry.js, sync.js, markov.js, RUN-ENVIRONMENTS.md |
| 7 | KaTeX / Markdown memory spikes | **Done** | package.json, hub-config, RUN-ENVIRONMENTS.md |

---

## Completed Items (No Further Work)

### 1. Cache Poisoning & Device Binding Race — DONE
- **What was done:** IR-only cache; JIT signing per request; in-flight guard returns IR; all callers use `_assembleHtml(result.ir, opts)`.
- **Verification:** Unit and E2E tests per plan (if not yet written, add as follow-up).

### 2. False-Atomic Write — DONE
- **What was done:** `saveState` / `saveStateSync` use `fsync` / `fsyncSync` before `rename` in `packages/agni-engine/index.js`. Directory fsync added after rename in json-store, atomic-write, engine, and hub-transform (Phase 2 #8).

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

## Completed Items (continued)

### 5. Ed25519 / TweetNaCl UI Blocking — DONE

**Done:**
- Async wrapper: `verify()` defers work with `setTimeout(0)` so main thread can paint before verification.
- **5a** — "Verifying…" spinner in player. **5e** — `AGNI_INTEGRITY.lastVerifyMs` for QA measurement.

- **5b** — Decision: narrow scope (LESSON_DATA + OLS_INTENDED_OWNER) accepted.
- **5c** — Implemented narrow scope in crypto.js, html.js, hub-transform.js, integrity.js.

**BREAKING:** Signatures from v2.1 (full-script scope) will fail. Re-sign lessons after upgrade.


---

### 6. Time-Skew Telemetry Corruption — DONE

**Done:**
- `AGNI_SENTRY_MIN_VALID_YEAR` (default 2020) in sentry.js; reject POST when system year &lt; threshold.
- **6a** — `syncTimestamp` in sync payload; documented in federation playbook and API.
- **6b** — Optional `date -s` in sync apply path when `AGNI_SYNC_SET_CLOCK=1`.
- **6c, 6d** — Markov uses sequence-based cooldowns (`observationIndex`); no `Date.now()` for cooldown eviction.
- **6e** — Hub time management in `RUN-ENVIRONMENTS.md`.
- **6f** — Session/JWT clock dependency documented in village-security, DEPLOYMENT, runtime playbook.

---

## Phased Execution Plan

### Phase A — Quick Wins — DONE
1. **5a** — “Verifying…” spinner in player.
2. **6a** — Add `syncTimestamp` to sync payload; document.
3. **6e** — Document hub time management.
4. **6f** — Document JWT/session clock dependency.
5. **2 (follow-up)** — Done: directory fsync in json-store, atomic-write, engine, hub-transform.

### Phase B — Product Decisions — DONE
1. **5b** — Done: Narrow scope (LESSON_DATA + OLS_INTENDED_OWNER) accepted.
2. **5c** — Done: Implemented narrow scope in crypto.js, html.js, hub-transform.js, integrity.js.

### Phase D — Time Sync — DONE
**6b** implemented; `AGNI_SYNC_SET_CLOCK=1` enables optional `date -s` in sync apply path.

### Phase E — Markov Redesign — DONE
**6c, 6d** implemented; markov.js uses `observationIndex` for sequence-based cooldowns.

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

## Additional Hardening (Post-Original Plan)

The following remediations address edge-case vulnerabilities identified during deployment hardening:

| # | Vulnerability | Status | Location |
|---|---------------|--------|----------|
| **H1** | Thundering herd (compile queue timeout) | **Done** | hub-transform.js |
| **H2** | SD card directory fsync | **Done** (was already implemented) | json-store.js, hub-transform.js |
| **H3** | Sensor hardware failure blocking | **Done** | threshold-evaluator.js, player.js |
| **H4** | Sneakernet Bayesian double-count | **Done** | federation.js, engine/index.js |
| **H5** | Student-to-student token theft | **Done** | accounts.js, http-helpers.js, hub-transform.js |

### H1. Thundering Herd
- **Problem:** 30 students open devices at once; 15 unique lessons requested; concurrency cap 3. Queued requests hold HTTP connections. Nougat WebView times out (30–60s); students refresh; Pi spirals into OOM.
- **Fix:** When compile slot unavailable, return **202 Accepted** with `Retry-After` header and lightweight HTML that auto-refreshes. Client releases connection; no manual refresh spam.
- **Config:** `AGNI_COMPILE_RETRY_AFTER` (default 3 seconds).

### H2. SD Card Directory Fsync
- Already implemented: `json-store.js` and `hub-transform.js` fsync the parent directory after `rename()` to ensure rename durability on ext4/SD cards.

### H3. Sensor Hardware Failure
- **Problem:** Broken accelerometer; DeviceMotion never fires; student blocked on hardware_trigger step forever.
- **Fix:** `threshold-evaluator.watch()` accepts `{ timeoutMs: 5000, onTimeout }`. If no sensor data within 5s, player shows emulator "Shake" button; student can simulate action. Hardware failures never cause academic blocking.

### H4. Sneakernet Bayesian Double-Count
- **Problem:** A→B→C→A loop; same observations merged multiple times; precision explodes; bandit becomes overconfident.
- **Fix:** Bandit summaries include `hubId` and `exportSequence`. Engine tracks `hubHighWater[hubId]`. Skip merge if `remote.exportSequence <= hubHighWater[remote.hubId]`. Requires unique `AGNI_HUB_ID` per hub.

### H5. Session Token Theft
- **Problem:** Student A copies Student B's `agni_student_session` cookie to own device; requests lessons as B.
- **Fix:** Sessions store `clientIp` at creation. `validateStudentSession(token, { clientIp })` rejects if IP mismatch. `verify-pin` and `claim` bind; hub-transform validates on lesson delivery.

---

## References

- `docs/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md` — Full specification
- `docs/ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN.md` — Phase 2 (28 items) and implementation status
- `docs/ARCHITECTURAL-AUDIT-FINDINGS.md` — Audit findings (spec.type, graph clamp, PWA handshake, supply chain)
- `docs/ARCHITECTURE-DETAILED.md` — Implementation details
- `docs/RUN-ENVIRONMENTS.md` — Hardware and environment constraints
