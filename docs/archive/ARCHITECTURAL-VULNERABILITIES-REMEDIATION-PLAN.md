> **Issues moved to:** [UNRESOLVED-ISSUES-MASTER-LIST.md](../UNRESOLVED-ISSUES-MASTER-LIST.md)

# Architectural Vulnerabilities — Remediation Plan

This document describes a plan to address seven verified architectural vulnerabilities in AGNI. Each section includes the issue, proposed fix, implementation approach, and verification strategy.

---

## Overview

| # | Vulnerability | Severity | Effort | Dependencies |
|---|---------------|----------|--------|--------------|
| 1 | Cache poisoning / device binding race | Critical | Medium | None |
| 2 | False-atomic write (no fsync) | High | Low | None |
| 3 | Cycle-triggered global DoS | High | Medium | None |
| 4 | Chrome 51 sensor event-loop exhaustion | High | Medium | None |
| 5 | Ed25519 / TweetNaCl UI blocking | Medium–High | Medium | None |
| 6 | Time-skew telemetry corruption | Medium | High | 2, 3 |
| 7 | KaTeX/Markdown memory spikes | Medium | Low | None |

**Recommended implementation order:** 2, 1, 7, 3, 4, 5, 6 — prioritizing data integrity and security first, then availability and UX.

---

## 1. Cache Poisoning & Device Binding Race Condition

### Problem

The in-flight compile guard (`_compilingNow[slug]`) shares a single Promise per slug. When Alice and Bob request the same uncached lesson concurrently, Bob waits on Alice’s compilation and receives HTML signed for Alice. Bob’s device fails integrity verification (“Unauthorized Copy”).

**Affected code:** `packages/agni-hub/hub-transform.js` — `compileLesson()`, `_doCompile()`, in-flight guard.

### Proposed Fix

**Principle:** Cache only unsigned IR/template. Perform JIT signing per request at response time.

1. **Decouple compilation from signing**
   - `_doCompile()` returns `{ ir, sidecar }` only. Do not call `_assembleHtml(ir, options)` inside `_doCompile`.
   - Memory cache stores `{ ir, sidecar, mtime }`.
   - Disk cache stores unsigned HTML (already done via `_assembleHtml(ir, {})`).

2. **In-flight guard: return IR, not signed HTML**
   - When `_compilingNow[slug]` resolves, the shared result is `{ ir, sidecar }`.
   - Each waiting request then calls `_assembleHtml(ir, thatRequestOptions)` with its own `deviceId`/session.
   - The in-flight Promise no longer carries request-specific options.

3. **Implement request-specific assembly**
   - After awaiting `compileLesson(slug, opts)`, the caller always does `_assembleHtml(result.ir, opts)` before sending the response.
   - Ensure all call sites (lessons, sidecar, lesson-data.js) follow this pattern.

### Implementation Steps

1. Refactor `_doCompile()` to return `{ ir, sidecar }` instead of `{ html, sidecar }`.
2. Change `compileLesson()` to return `{ ir, sidecar, lessonIR }` (drop `html` from the shared result).
3. Update `_writeDiskCache` to write unsigned HTML (unchanged; already uses `{}`).
4. At each HTTP response site that serves lesson HTML:
   - Await `compileLesson(slug, opts)`.
   - Compute `html = _assembleHtml(result.ir, opts)`.
   - Stream/send `html`.
5. Remove any path where the in-flight result is used as final HTML.
6. Add an integration test: two concurrent requests with different `deviceId` must receive differently signed HTML (or correct unsigned HTML when auth disabled).

### Verification

- Unit test: mock two concurrent `compileLesson` calls with different `opts.deviceId`; assert each response’s `OLS_INTENDED_OWNER` matches the requester.
- E2E: two browser sessions request the same lesson; both pass integrity.

---

## 2. Raspberry Pi File System Corruption (No fsync)

### Problem

`saveState()` writes to `.tmp` and renames. On ext4/SD, buffered writes may not be flushed before power loss; the target file can be truncated or corrupted.

**Affected code:** `packages/agni-engine/index.js` — `saveState()`, `saveStateSync()`; possibly `packages/agni-hub/sync.js` and other JSON writers.

### Proposed Fix

Add a hardware-level flush before rename:

1. **Async save**
   - Open file with `fs.open(STATE_TMP_PATH, 'w')`.
   - `fs.write()` or `fs.writeFile()` (using fd if needed), then `fs.fsync(fd)`.
   - `fs.close(fd)`.
   - `fs.rename(STATE_TMP_PATH, STATE_PATH)`.

2. **Sync save**
   - Same sequence using `fs.openSync`, `fs.writeSync`, `fs.fsyncSync`, `fs.closeSync`, `fs.renameSync`.

3. **Scope**
   - Apply to LMS state (`lms_state.json`) as priority.
   - Audit and apply to other critical JSON writes: mastery_summary, graph_weights, lesson index, sync payloads.

### Implementation Steps

1. Add a helper `atomicWriteWithFsync(path, data)` in `@agni/utils` or `@agni/utils/io`.
2. Replace `saveState` / `saveStateSync` body with this helper.
3. Add unit test: write, simulate crash (delete .tmp before rename in a fork), verify original file intact.
4. Document the contract: “atomic write = write + fsync file + rename + fsync parent directory (directory fsync required on ext4/SD).”

### Verification

- Unit test: verify fsync is called (e.g. spy on fs).
- Manual: write state, kill -9 mid-save, reboot; state should be intact or previous good state.

---

## 3. Cycle-Triggered Global Denial of Service

### Problem

A skill-graph cycle causes theta to throw. The error propagates and kills the Node process. One bad synced lesson can brick the hub.

**Affected code:** `packages/agni-hub/theta.js` — `updateSharedCacheIfNeeded()`, `detectSkillGraphCycles()`.

### Proposed Fix

**Graceful degradation:** Isolate and prune the cyclic subgraph instead of throwing.

1. **Cycle handling**
   - When a cycle is found, log a severe warning with cycle details.
   - Prune all nodes in the cycle from the skill graph (treat as “no prerequisites” for those lessons, or exclude from eligibility until fixed).
   - Continue with the remaining DAG.
   - Optionally: write cycle details to a `skill_graph_cycles.json` file for governance/telemetry.

2. **Eligibility semantics**
   - Pruned lessons: either (a) ineligible until cycle is fixed, or (b) treated as root nodes (no prerequisites). Document the chosen behavior.
   - Recommend (a) to avoid offering lessons that depend on broken prerequisites.

3. **Startup**
   - On startup, if cycles exist, log and prune; do not throw.
   - Consider an admin API or CLI flag to force strict mode (throw on cycle) for deployment validation.

### Implementation Steps

1. Change `updateSharedCacheIfNeeded()` so that when `detectSkillGraphCycles()` returns a cycle:
   - Log: `log.error('Skill graph cycle detected; pruning affected lessons', { cycle })`.
   - Remove cycle nodes from the graph (or mark lessons that provide those skills as ineligible).
   - Build `skillGraph` from the pruned graph.
2. Add `AGNI_STRICT_SKILL_GRAPH` env flag: if set, preserve current behavior (throw).
3. Extend `verify:skill-dag` to report cycles without failing the main process; use for CI.
4. Add governance/telemetry event for cycle detection.

### Verification

- Unit test: inject a cyclic graph; assert no throw, pruned graph used, warning logged.
- Integration: sync cyclic content; hub stays up, affected lessons excluded.

---

## 4. Chrome 51 Sensor Event-Loop Exhaustion

### Problem

DeviceMotion fires at 60–120 Hz. Each event runs `_onMotion`, publishes readings, and the threshold evaluator evaluates synchronously. This can saturate the main thread and cause ANR/OOM on low-end Android 7 devices.

**Affected code:** `packages/agni-runtime/sensors/sensor-bridge.js`, `packages/agni-runtime/sensors/threshold-evaluator.js`.

### Proposed Fix

**Throttle evaluation to ~10–20 Hz.**

1. **Sensor-bridge throttle**
   - Add a fixed interval (e.g. 100 ms) or `requestAnimationFrame`-based tick.
   - Buffer raw readings in a small ring buffer or latest-value store.
   - On each tick, publish the latest (or averaged) reading for each sensor.
   - DeviceMotion handler only updates the buffer; it does not call `publishSensorReading` directly.

2. **Threshold-evaluator**
   - Subscribes to the throttled stream.
   - Evaluation runs at most 10–20 times per second.
   - Optionally: debounce `watch()` callbacks so `onMet` fires at most once per N ms.

3. **Compatibility**
   - Ensure throttle does not break “steady for 1.5s” style thresholds; may need to accumulate duration across ticks.
   - Consider `sensorSmoothing` or a `throttleMs` option in lesson data for tuning.

### Implementation Steps

1. Add `_throttleMs` (default 100) in sensor-bridge.
2. In DeviceMotion handler, update `_lastReading` (or ring buffer) instead of publishing.
3. Start `setInterval` or rAF loop; on tick, read `_lastReading` and call `_pub()` for each sensor.
4. Add tests for threshold `steady > 1.5s` with throttled input.
5. Document: `AGNI_SENSOR_THROTTLE_MS` env override for edge cases.

### Verification

- Profile on Android 7 device: main-thread CPU and frame rate with and without throttle.
- Unit test: simulate 120 events/sec; assert publish rate is capped.

---

## 5. Ed25519 / TweetNaCl UI Blocking

### Problem

Chrome 51 lacks Ed25519 in SubtleCrypto, so TweetNaCl is used. Verifying the full lesson script in JS on the main thread can freeze the UI for hundreds of ms.

**Affected code:** `packages/agni-runtime/integrity/integrity.js`.

### Proposed Fix

**Narrow scope and defer work.**

1. **Scope of signed content** (if compatible with current security model)
   - Current: full lesson script (nonce + factory-loader + LESSON_DATA + globals + player).
   - Option A: Hash only `LESSON_DATA` + `OLS_INTENDED_OWNER` for verification. Simpler, smaller payload. Requires agreement that this is sufficient for integrity and watermark.
   - Option B: Keep full-script scope but chunk the verification (e.g. `setTimeout` between chunks). More complex, preserves current semantics.

2. **Async verification**
   - Wrap verification in `Promise.resolve().then(() => verifySync())` and `await` before continuing lesson init.
   - Show a short “Verifying…” state so the UI doesn’t appear frozen.
   - Ensure loading spinner stays visible until verification completes.

3. **Web Worker** (optional, higher effort)
   - Move TweetNaCl verification to a Worker. Requires structured clone of inputs; hash input must be serializable.
   - Fallback: if Worker unavailable, use chunked main-thread verification.

### Implementation Steps

1. Confirm with product/security: is `LESSON_DATA` + `OLS_INTENDED_OWNER` an acceptable verification scope, or must full script remain?
2. If scope can be narrowed: update signer (hub/CLI) and runtime verifier to use the smaller payload.
3. Add async wrapper and “Verifying…” UI state.
4. If Worker path is chosen: create `integrity-worker.js`, post message with content + owner, verify in worker, post result back.

### Verification

- Measure verification time on Android 7 with large lessons; target &lt; 100 ms perceived block.
- Ensure signature verification still fails on tampered content.

---

## 6. Time-Skew Telemetry Corruption

### Problem

Without an RTC, a Pi may boot with epoch (1970). Sentry uses `Date` for filenames; Markov uses timestamps. Clock jump can corrupt event layout and cooldown logic.

**Affected code:** `packages/agni-hub/sentry.js`, `packages/agni-engine/markov.js`, sync/clock handling.

### Proposed Fix

**Monotonic and sequence-based logic where possible.**

1. **Sentry**
   - Option A: Use sequence-based filenames, e.g. `events_000001.ndjson`, `events_000002.ndjson`, instead of date.
   - Option B: Keep date-based filenames but validate: if `new Date()` is before a known “last good” time (e.g. build date), refuse to write and log.
   - Add `AGNI_SENTRY_MIN_VALID_YEAR` (default 2020); reject writes when system year &lt; this.

2. **Markov cooldowns**
   - Option A: Use observation index or sequence number instead of `Date.now()`.
   - Option B: Use relative deltas (e.g. “N observations ago”) and derive ordering from observation stream.
   - Requires schema change for cooldown entries.

3. **Sync / hub time**
   - USB sync payload includes `syncTimestamp` from authoring machine.
   - `sync.js` or a bootstrap script runs `date -s <syncTimestamp>` when applying sync (requires appropriate permissions).
   - Document: offline hubs should get time from sync or manual setup.

4. **Sessions / JWT**
   - If tokens use `exp`, document that clock must be correct for auth. Consider `nbf` and short TTL to reduce impact of skew.

### Implementation Steps

1. Add `AGNI_SENTRY_MIN_VALID_YEAR`; in Sentry, check `new Date().getFullYear()` before writing; if below threshold, log and skip or use fallback file.
2. Design Markov cooldown schema change (sequence-based).
3. Add `syncTimestamp` to sync payload format and document.
4. Implement optional `date -s` in sync apply path (with safeguards).
5. Document hub time management in `docs/RUN-ENVIRONMENTS.md`.

### Verification

- Unit test: set system clock to 1970 (or mock), assert Sentry does not write to `1970-01-01.ndjson` (or uses fallback).
- Test Markov with sequence-based cooldowns.

---

## 7. KaTeX & Markdown Memory Spikes

### Problem

Parsing 2MB YAML and running Markdown/KaTeX for several lessons in parallel can exceed the V8 heap on a 1GB Pi.

**Affected code:** hub-transform, Node startup, env config.

### Proposed Fix

**Cap concurrency and heap.**

1. **Heap limit**
   - Set `NODE_OPTIONS=--max-old-space-size=512` in the theta/hub start script (e.g. `hub-tools/theta.js`, systemd unit, or `package.json` script).
   - Document in `docs/RUN-ENVIRONMENTS.md` and `data/hub-config.pi.json`.

2. **Concurrency**
   - In hub-config or env: `AGNI_COMPILE_CONCURRENCY=1` for Pi 3 (1GB), `2` for Pi 4 (2GB).
   - `check-hub-config-pi.js` should validate and recommend these values based on `os.totalmem()`.

3. **YAML size**
   - Consider lowering `AGNI_YAML_MAX_BYTES` on Pi (e.g. 512KB) to reduce worst-case memory per lesson.
   - Document trade-off: smaller limit protects memory but rejects large lessons.

### Implementation Steps

1. Add `--max-old-space-size=512` to theta start command in `package.json` and/or hub run script.
2. Update `check-hub-config-pi.js` to suggest `AGNI_COMPILE_CONCURRENCY` from RAM.
3. Document in `docs/RUN-ENVIRONMENTS.md`.
4. Add optional `AGNI_YAML_MAX_BYTES` override in hub-config.pi template.

### Verification

- Run 3 concurrent compiles on a 1GB VM; confirm no OOM.
- Verify Pi config check recommends correct concurrency.

---

## Rollout and Testing

1. **Phase 1 (data integrity):** #2 fsync, #7 memory.
2. **Phase 2 (security):** #1 cache/device-binding race.
3. **Phase 3 (availability):** #3 cycle degradation.
4. **Phase 4 (runtime UX):** #4 sensor throttle, #5 integrity async.
5. **Phase 5 (telemetry):** #6 time-skew handling.

Each phase should include unit tests, integration tests where applicable, and manual checks on Pi and Android 7 hardware.

---

## References

- `docs/ARCHITECTURE.md` — system design
- `docs/ARCHITECTURE-DETAILED.md` — implementation details
- `docs/RUN-ENVIRONMENTS.md` — hardware and env constraints
- `docs/playbooks/village-security.md` — security hardening
