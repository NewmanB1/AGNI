# Sprint: Sentry Improvements — Implementation Plan

Implementation plan for Sentry enhancements with **regression guards** and **proof of completion** for each task.

**Status:** Completed (implemented 2026-03-05).

**Reference:** `docs/playbooks/sentry.md`, `hub-tools/sentry.js`, `docs/ROADMAP.md`

---

## Overview

| Phase | Focus | Duration | Depends On |
|-------|-------|----------|------------|
| **S1** | Foundation: tests, validation, config | 2–3 days | — |
| **S2** | Integration: unified telemetry feed | 1–2 days | S1 |
| **S3** | Resilience: flush, shutdown, health | 1–2 days | S1 |
| **S4** | Polish: cron scheduling, output validation | 1 day | S1 |

---

## Phase S1: Foundation (Tests, Validation, Config)

**Goal:** Add regression guards and fix validation/config gaps before changing data flow.

### S1.1 — Sentry pipeline unit tests

| Item | Details |
|------|---------|
| **File** | `tests/unit/sentry.test.js` (new) |
| **Scope** | Unit-test Sentry logic in isolation. Extract or expose testable functions where needed. |
| **Tests** | (a) `validateEvent()` — accepts valid event, rejects invalid (missing lessonId, bad mastery, path traversal in lessonId, bad completedAt). (b) Contingency update — given NDJSON events, assert correct 2×2 counts. (c) Chi-squared / benefit / weight — given counts, assert edge weight and confidence. (d) Cohort discovery — given mastery vectors, assert Jaccard clustering produces expected largest cluster. (e) Graph output shape — assert output has `version`, `edges`, `metadata`, conforms to schema. |

**Regression guard:** `npm test` includes `tests/unit/sentry.test.js`. CI must pass.

**Proof of completion:**
- [ ] `node --test tests/unit/sentry.test.js` passes
- [ ] At least 12 test cases covering validation, contingency, chi2, clustering, output
- [ ] `npm run test:coverage` shows sentry.js or its extracted helpers exercised

---

### S1.2 — Event validation consistency (steps / skillsProvided)

| Item | Details |
|------|---------|
| **File** | `hub-tools/sentry.js` |
| **Scope** | Align validation input/output. Support both `{ skill, evidencedLevel }` and string `skillsProvided`. |
| **Changes** | (a) Either include `steps` in validated output or remove `steps` requirement and document. (b) Normalize `skillsProvided`: accept `"skillId"` string → treat as `{ skill: "skillId", evidencedLevel: event.mastery }`. Accept `{ skill, evidencedLevel }` or `{ skill, declaredLevel }`. |

**Regression guard:**
- Existing regressions (R16 C2.1, C2.2, C3.2) still pass
- New test: `validateEvent` with string `skillsProvided: ["ols:math:add"]` and object `skillsProvided: [{ skill: "ols:math:add", evidencedLevel: 0.8 }]` both produce valid output
- Telemetry route (`routes/telemetry.js`) and runtime (`telemetry.js`) payloads still validate

**Proof of completion:**
- [ ] `validateEvent` handles string and object `skillsProvided`
- [ ] `steps` requirement and output documented (or removed)
- [ ] S1.1 tests include validation edge cases

---

### S1.3 — Configurable analysis thresholds

| Item | Details |
|------|---------|
| **File** | `packages/agni-utils/env-config.js`, `hub-tools/sentry.js` |
| **Scope** | Move hardcoded thresholds into envConfig. |
| **Changes** | Add to `env-config.js`: `sentryChi2Threshold` (default 3.841), `sentryMinSample` (20), `sentryJaccardThreshold` (0.5), `sentryMinClusterSize` (20). Wire in sentry.js. Env vars: `AGNI_SENTRY_CHI2_THRESHOLD`, `AGNI_SENTRY_MIN_SAMPLE`, `AGNI_SENTRY_JACCARD_THRESHOLD`, `AGNI_SENTRY_MIN_CLUSTER_SIZE`. |

**Regression guard:**
- With defaults, behaviour matches current (no change in output for same input)
- S1.1 tests pass with default config
- New test: override one threshold via env, assert analysis respects it

**Proof of completion:**
- [ ] `env-config.js` exports new keys
- [ ] Sentry uses `envConfig.sentryChi2Threshold` etc.
- [ ] CI does not need new env vars (defaults work)

---

### S1.4 — Output validation against graph_weights schema

| Item | Details |
|------|---------|
| **File** | `hub-tools/sentry.js`, `schemas/graph-weights.schema.json` |
| **Scope** | Validate `graph_weights` object before writing. Fail fast on schema violation. |
| **Changes** | Load schema (e.g. via Ajv or existing validator). Before `saveJSONAsync(GRAPH_WEIGHTS, gw)`, run `validate(gw)`. On failure: log error, do not overwrite file, throw or return so caller knows. |

**Regression guard:**
- Current Sentry output already conforms; validation should pass
- If schema is missing, add schema or skip validation with a TODO; do not block S1 on schema discovery

**Proof of completion:**
- [ ] `runAnalysis` validates before write
- [ ] Invalid output (e.g. missing `edges`) causes no file overwrite and logged error
- [ ] S1.1 test for output shape uses same schema/validator

---

## Phase S2: Integration (Unified Telemetry Feed)

**Goal:** Ensure Sentry receives events from the hub telemetry path so the adaptation loop works.

### S2.1 — Forward hub telemetry to Sentry

| Item | Details |
|------|---------|
| **File** | `hub-tools/routes/telemetry.js`, `hub-tools/context/services.js` (or equivalent) |
| **Scope** | After theta processes events, forward a copy to Sentry (or feed Sentry from the same source). |
| **Options** | **(A)** Theta POSTs to `http://127.0.0.1:AGNI_SENTRY_PORT/api/telemetry` with same payload after processing. **(B)** Theta appends to `data/events/YYYY-MM-DD.ndjson` in Sentry format, Sentry reads it. **(C)** Sentry reads from `telemetry-events.json` and converts to NDJSON format. Recommend **(A)** — minimal change, Sentry stays the sink. |
| **Changes** | Add optional forward: if `AGNI_SENTRY_PORT` is set and Sentry is reachable, `http.post('http://127.0.0.1:' + port + '/api/telemetry', { events })` after theta processing. Fire-and-forget (do not block response). Log on failure. |

**Regression guard:**
- Telemetry route behaviour unchanged when Sentry is disabled (port unset or connection fails)
- Existing telemetry tests pass
- New integration test: with Sentry running, POST to theta `/api/telemetry` → Sentry `data/events/` receives NDJSON

**Proof of completion:**
- [ ] Theta forwards to Sentry when configured
- [ ] No regression when Sentry unavailable
- [ ] `docs/playbooks/sentry.md` updated with data flow (runtime → theta → Sentry)

---

### S2.2 — Document telemetry data flow

| Item | Details |
|------|---------|
| **File** | `docs/playbooks/sentry.md` |
| **Scope** | Document canonical path and deployment options. |
| **Changes** | Add section: "Data flow options" — (1) Runtime POSTs to theta; theta forwards to Sentry. (2) Runtime POSTs directly to Sentry (standalone). Clarify which is default and how to configure. |

**Proof of completion:**
- [ ] Playbook describes both paths
- [ ] Default path and env vars documented

---

## Phase S3: Resilience (Flush, Shutdown, Health)

**Goal:** Hardening for SD card and process lifecycle.

### S3.1 — Flush retry on failure

| Item | Details |
|------|---------|
| **File** | `hub-tools/sentry.js` |
| **Scope** | Retry append on transient failure instead of discarding. |
| **Changes** | On `fs.appendFile` error: retry up to 3 times with 1s delay. If all fail, log and discard (current behaviour). Optional: write to `data/events/failed-YYYYMMDD.ndjson` as last resort before discard. |

**Regression guard:**
- R16 C2.1 (no unshift on error) remains — we never re-queue to `eventBuffer`
- S1.1 tests pass
- New test: mock `fs.appendFile` to fail twice then succeed; assert events eventually written

**Proof of completion:**
- [ ] Retry logic implemented
- [ ] No re-queue to buffer on failure
- [ ] Test for retry behaviour

---

### S3.2 — Graceful shutdown

| Item | Details |
|------|---------|
| **File** | `hub-tools/sentry.js` |
| **Scope** | On SIGTERM/SIGINT, drain buffer before exit. |
| **Changes** | `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)`: stop accepting new requests (optional: respond 503), wait for in-flight request to complete, flush buffer once synchronously, then `process.exit(0)`. Set a timeout (e.g. 10s) — if flush doesn't complete, exit anyway and log. |

**Regression guard:**
- Normal operation unchanged
- Manual test: start Sentry, send events, SIGTERM → verify NDJSON contains events
- No new unit test required if complex; document manual verification

**Proof of completion:**
- [ ] Shutdown handlers registered
- [ ] Buffer flushed before exit (or timeout)
- [ ] Documented in `docs/playbooks/sentry.md` or `DEPLOYMENT.md`

---

### S3.3 — Health / status endpoint

| Item | Details |
|------|---------|
| **File** | `hub-tools/sentry.js` |
| **Scope** | Add `GET /health` and optionally `GET /api/sentry/status`. |
| **Changes** | `GET /health`: return 200 + `{ ok: true }`. `GET /api/sentry/status` (optional): `{ bufferSize, lastAnalysisAt, graphWeightsUpdatedAt, edgesCount }` from in-memory state + stat of `graph_weights.json`. |

**Regression guard:**
- `curl http://localhost:8081/health` returns 200
- Existing POST behaviour unchanged

**Proof of completion:**
- [ ] `GET /health` returns 200
- [ ] Status endpoint returns buffer/analysis info (if implemented)
- [ ] Documented in `docs/api-contract.md` or playbook

---

## Phase S4: Polish (Scheduling, Output Validation)

**Goal:** Use existing config and validate output.

### S4.1 — Honor analyseCron for scheduled analysis

| Item | Details |
|------|---------|
| **File** | `hub-tools/sentry.js` |
| **Scope** | Use `envConfig.analyseCron` (e.g. `'02:00'`) in addition to event-driven and interval-driven runs. |
| **Changes** | Parse cron expression (e.g. "HH:MM"). Use `setInterval` (e.g. every 60s) to check if current time matches; if so, run analysis. Keep `ANALYSE_AFTER_N` and `MIN_MS_BETWEEN_ANALYSIS` for event-driven and throttle. |

**Regression guard:**
- With default cron `02:00`, analysis still runs on event threshold and interval
- New behaviour: analysis also runs at 02:00 local time
- Test: mock time to 02:00, assert analysis triggered (or document as manual verification)

**Proof of completion:**
- [ ] `analyseCron` triggers analysis at specified time
- [ ] Event-driven and interval-driven analysis unchanged
- [ ] Config documented in env-config or DEPLOYMENT

---

## Verification Checklist (Overall)

After all phases:

| Check | Command / Action |
|-------|------------------|
| Unit tests | `npm test` — all pass |
| Coverage | `npm run test:coverage` — no drop in coverage |
| Verify scripts | `npm run verify:all` — pass |
| Regressions | R16 C2.1, C2.2, C3.2 tests in `regressions.test.js` — pass |
| Integration | `tests/integration/` — pass |
| Manual | Start Sentry, POST events, verify graph_weights.json updated |
| Docs | Playbook and DEPLOYMENT updated |

---

## Dependency Graph

```
S1.1 (tests) ──┬──► S1.2 (validation) ──► S1.3 (config) ──► S1.4 (schema)
               │
               └──► S2.1 (forward) ──► S2.2 (docs)
               │
               └──► S3.1 (retry) ──► S3.2 (shutdown) ──► S3.3 (health)
               │
               └──► S4.1 (cron)
```

**Suggested order:** S1.1 → S1.2 → S1.3 → S1.4 → S2.1 → S2.2 → S3.1 → S3.2 → S3.3 → S4.1.

---

## Summary Table

| Task | Regression Guard | Proof of Completion |
|------|------------------|---------------------|
| S1.1 | New test file in CI | `node --test tests/unit/sentry.test.js` passes |
| S1.2 | Validation tests, telemetry compat | Both payload shapes accepted |
| S1.3 | Defaults preserve behaviour | Env override test |
| S1.4 | Schema validation before write | Invalid output not written |
| S2.1 | Theta tests, integration test | Events reach Sentry when configured |
| S2.2 | — | Playbook updated |
| S3.1 | No re-queue, retry test | Retry test passes |
| S3.2 | Manual shutdown test | Documented |
| S3.3 | Health returns 200 | curl /health |
| S4.1 | Event/interval unchanged | Cron triggers at configured time |
