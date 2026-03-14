# Sentry / Telemetry Engine — Architecture

**Version:** 1.0  
**Status:** Canonical  
**Related:** `docs/playbooks/sentry.md`, `docs/ARCHITECTURE.md` §7.3, `docs/CONFIGURATION.md`

---

## 1. Executive Summary

The **Sentry / Telemetry Engine** is the AGNI subsystem responsible for:

1. **Ingesting** anonymized lesson-completion events from edge devices (browsers) via the village hub
2. **Persisting** events as append-only NDJSON on disk for offline resilience
3. **Analyzing** event streams to discover skill-transfer patterns within local cohorts
4. **Producing** `graph_weights.json` — a skill-to-skill transfer graph used to tune **Marginal Learning Cost (MLC)** and lesson ordering

The Telemetry Engine implements what the playbooks call "Sentry" — the canonical implementation is `packages/agni-hub/telemetry-engine.js`. The terms **Sentry** and **Telemetry Engine** are used interchangeably; this document uses both.

---

## 2. Terminology and Naming

| Term | Definition |
|------|------------|
| **Sentry** | Historical / playbook name for the telemetry analysis service. |
| **Telemetry Engine** | Implementation name: `packages/agni-hub/telemetry-engine.js` and `telemetry-engine-analysis.js`. |
| **graph_weights** | Skill-to-skill transfer weights: `{ from, to, weight, confidence, sample_size }`. Lower `weight` = stronger transfer (skill collapse). |
| **MLC (Marginal Learning Cost)** | Theta’s θ — used to sort lessons. Lower θ = preferred order. Graph weights reduce θ when prior skills are mastered. |
| **Skill collapse** | Phenomenon where mastering Skill A makes Skill B easier (e.g., fractions → ratios). |
| **Cohort** | A cluster of students with similar mastery profiles, discovered via Jaccard similarity. |

**Note on env vars:** The codebase uses `AGNI_TELEMETRY_ENGINE_*` in `env-config.js`. Some docs/playbooks use `AGNI_SENTRY_*` — the canonical source of truth is `packages/agni-utils/env-config.js`.

---

## 3. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SENTRY / TELEMETRY ENGINE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌──────────────┐     POST /api/telemetry      ┌──────────────────────────────┐  │
│  │   Runtime    │ ────────────────────────────►│   Theta (Pathfinder)         │  │
│  │  (browser)   │     hubBase + /api/telemetry │   packages/agni-hub/routes/   │  │
│  │              │                              │   telemetry.js               │  │
│  └──────────────┘                              └──────────────┬───────────────┘  │
│         │                                                      │                  │
│         │ IndexedDB buffer                                     │ 1. Update        │
│         │ (survives reload)                                    │    mastery       │
│         │                                                     │ 2. LMS probe     │
│         │                                                     │ 3. SM-2 review   │
│         │                                                     │ 4. Store events  │
│         │                                                     │ 5. Forward ─────┼──┐
│         │                                                     └─────────────────┘  │
│         │                                                                          │
│         │  Standalone mode: POST directly to Telemetry Engine port                 │
│         │  (when hubBase points to :8081)                                          │
│         └─────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│                                         │                                         │
│                                         ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────┐│
│  │                    TELEMETRY ENGINE (packages/agni-hub/telemetry-engine.js)   ││
│  │                                                                               ││
│  │  HTTP Receiver ◄── POST /api/telemetry, POST /api/telemetry/ingest (B1.1)     ││
│  │       │                                                                       ││
│  │       ▼                                                                       ││
│  │  Event Buffer (in-memory, max 50k)                                            ││
│  │       │                                                                       ││
│  │       ▼ flush every 30s                                                       ││
│  │  data/events/YYYY-MM-DD.ndjson                                                ││
│  │       │                                                                       ││
│  │       ▼ runAnalysis()                                                         ││
│  │  telemetry-engine-analysis.js                                                 ││
│  │       │  • processOneEvent → mastery, contingencies                           ││
│  │       │  • discoverCohort → Jaccard clustering                                ││
│  │       │  • computeEdgesFromGlobalPairs → chi-square, benefit                  ││
│  │       │                                                                       ││
│  │       ▼                                                                       ││
│  │  data/graph-weights.json  (or graph-weights-pending.json if review gated)     ││
│  └──────────────────────────────────────────────────────────────────────────────┘│
│                                                                                   │
│                                         │                                         │
│                                         ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────┐│
│  │   PATHFINDER (theta) — getEffectiveGraphWeights(), getResidualCostFactor()    ││
│  │   computeLessonTheta() → lesson order by MLC                                  ││
│  └──────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Inventory

| Component | Path | Role |
|-----------|------|------|
| **Runtime telemetry** | `packages/agni-runtime/telemetry/telemetry.js` | Records lesson completions, computes mastery, buffers in IndexedDB, POSTs to hub |
| **Checkpoint** | `packages/agni-runtime/telemetry/checkpoint.js` | Saves/restores lesson progress; optional hub sync |
| **Completion** | `packages/agni-runtime/telemetry/completion.js` | Renders completion screen; calls AGNI_TELEMETRY.record |
| **Telemetry routes** | `packages/agni-hub/routes/telemetry.js` | Theta’s `POST /api/telemetry` handler; mastery, LMS, SM-2, forward to engine |
| **Telemetry Engine** | `packages/agni-hub/telemetry-engine.js` | HTTP receiver, buffer, flush, analysis orchestration |
| **Telemetry Engine Analysis** | `packages/agni-hub/telemetry-engine-analysis.js` | Pure analysis: validation, contingency tables, cohort discovery, edge computation |
| **Pathfinder** | `packages/agni-hub/pathfinder.js` | Consumes graph_weights; getEffectiveGraphWeights, getResidualCostFactor, computeLessonTheta |
| **Sync** | `packages/agni-hub/sync.js` | Imports regional graph_weights; sanitizes edges |
| **Hub tools** | `hub-tools/telemetry-engine.js` | Wrapper to run telemetry-engine as standalone process |

---

## 5. End-to-End Data Flow

### 5.1 Default (Integrated) Flow

1. **Student completes lesson** → `player.js` invokes `AGNI_TELEMETRY.record(lessonData, stepOutcomes, totalDurationMs, probeResults)`.
2. **Runtime** computes mastery (weighted step scores), writes event to IndexedDB, attempts `flush()` to `hubBase + /api/telemetry`.
3. **Theta** (`routes/telemetry.js`) receives POST:
   - Updates `mastery-summary.json` (skill levels per pseudoId)
   - Records LMS probe results (Rasch/bandit)
   - Updates SM-2 review schedule
   - Appends to `telemetry-events.json` (rolling window 10k)
   - If `AGNI_TELEMETRY_ENGINE_FORWARD !== 'false'`, forwards events to Telemetry Engine at `http://127.0.0.1:AGNI_TELEMETRY_ENGINE_PORT/api/telemetry`
4. **Telemetry Engine** receives events:
   - Validates via `telemetryEngineAnalysis.validateEvent()`
   - Buffers in memory (max 50k)
   - Every 30s, flushes to `data/events/YYYY-MM-DD.ndjson`
   - When `_eventsSinceLastAnalysis >= ANALYSE_AFTER_N` (default 50) and at least 4 hours since last run (`MIN_MS_BETWEEN_ANALYSIS`), triggers `runAnalysis()`
5. **runAnalysis()**:
   - Reads NDJSON with incremental cursors (`telemetry-engine-state.json`)
   - Updates `mastery-summary.json`, `contingency-tables.json`
   - Discovers cohort via Jaccard clustering
   - Computes edges (chi-square, benefit → weight)
   - Applies rate limit (max delta per edge)
   - Writes `graph-weights.json` or `graph-weights-pending.json` (if review gated)
6. **Pathfinder** on next request:
   - Loads graph via `getEffectiveGraphWeights(pseudoId)` (cohort-aware)
   - Uses `getResidualCostFactor()` and `computeLessonTheta()` to sort lessons by θ (MLC)

### 5.2 Standalone Telemetry Engine Flow

When theta is not used, or devices POST directly to the Telemetry Engine:

- Runtime `hubBase` is set to `http://hub:8081` (or equivalent)
- Events go straight to Telemetry Engine’s `POST /api/telemetry`
- No mastery/LMS/SM-2 update in theta; those are theta-specific
- Analysis and graph_weights production proceed as above

---

## 6. Runtime (Edge Device) Telemetry

### 6.1 What Is Recorded

| Field | Description |
|-------|-------------|
| `eventId` | Unique ID (`ev-{timestamp}-{random}`) |
| `pseudoId` | Hub-assigned pseudonymous student ID (opaque) |
| `lessonId` | Lesson identifier from `meta.identifier` |
| `completedAt` | ISO 8601 timestamp |
| `mastery` | Weighted score M ∈ [0, 1] |
| `durationMs` | Total time in lesson |
| `skillsProvided` | `[{ skill, evidencedLevel }]` — ontology.provides adjusted by mastery |
| `skillsRequired` | Array of skill IDs from ontology.requires |
| `steps` | Per-step outcomes (stepId, type, weight, score, passed, attempts, durationMs) |
| `probeResults` | `[{ probeId, correct }]` for LMS (Rasch, bandit) |
| `frustrationEvents` / `frustrationTotal` | Optional frustration telemetry |

### 6.2 Mastery Formula

Each step has a weight `w_i`. Step score `s_i`:

- **Instruction / completion steps:** 1.0
- **Passed (probe):** `sqrt((maxAttempts - (attempts - 1)) / maxAttempts)` — gentler decay than linear
- **Skipped:** 0.0 (half weight counted)
- **Failed (exhausted attempts):** 0.15 partial credit

`M = Σ(w_i × s_i) / Σ(w_i)`

### 6.3 Buffering and Flush

- Events are written to IndexedDB (`agni-telemetry`, store `events`) immediately.
- `flush()` sends all unflushed events to `hubBase + /api/telemetry`.
- Flush triggers: on `record()`, on `DOMContentLoaded` (2s delay), on service worker message `HUB_REACHABLE`.
- Failures are silent; events remain buffered for next flush.

### 6.4 Pseudonymous ID

- Generated once (or from URL param `pseudoId` if set by portal launcher).
- Stored in IndexedDB; never contains real identity.
- Hub may optionally map it to a student account.

---

## 7. Theta Telemetry Routes

**File:** `packages/agni-hub/routes/telemetry.js`

### 7.1 POST /api/telemetry

**Auth:** Hub key required.

**Body:** `{ events: [ { pseudoId, lessonId, mastery, ... } ] }`

**Processing:**

1. **Mastery:** For each event, update `mastery.students[pseudoId]` with `skillsProvided` and `evidencedLevel`.
2. **LMS:** If LMS engine available, call `recordObservation(pseudoId, lessonId, probeResults)`.
3. **SM-2:** Update `review-schedule.json` with quality (0–5 derived from mastery) and SM-2 intervals.
4. **Events:** Append to `telemetry-events.json` (capped at 10k).
5. **Forward:** If `telemetryEngineForward` is true, POST a copy to `http://127.0.0.1:{telemetryEnginePort}/api/telemetry` (fire-and-forget).

**Response:** `{ accepted: [...], processed: N }`

---

## 8. Telemetry Engine — HTTP Receiver

**File:** `packages/agni-hub/telemetry-engine.js`

### 8.1 Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns `{ ok: true }` — liveness probe |
| GET | `/api/sentry/status` | No | `{ bufferSize, lastAnalysisAt, graphWeightsUpdatedAt, edgesCount, pendingReview, pendingPath }` |
| POST | `/api/telemetry` | No | Ingest events (body: `{ events: [...] }` or single event) |
| POST | `/api/telemetry/ingest` | `X-Aggregator-Secret` | B1.1 log aggregator: cross-village ingestion with anonymization |

### 8.2 POST /api/telemetry

- **Body:** JSON with `events` array (or single event object).
- **Validation:** `telemetryEngineAnalysis.validateEvent()` — requires `lessonId`, `completedAt`, `mastery` ∈ [0,1]; normalizes `skillsProvided`.
- **Time-skew protection:** If `new Date().getFullYear() < AGNI_TELEMETRY_ENGINE_MIN_VALID_YEAR` (default 2020), returns 503. Avoids writing to `1970-01-01.ndjson` when Pi boots without RTC.
- **Buffer cap:** 50,000 events; excess dropped with log.
- **Body size limit:** 1 MB; 413 if exceeded.
- **Response:** `{ accepted: [ eventIds ] }`

### 8.3 POST /api/telemetry/ingest (B1.1)

- **Enabled:** `AGNI_AGGREGATOR_INGEST_ENABLED=1` and `AGNI_AGGREGATOR_INGEST_SECRET` set.
- **Auth:** Header `X-Aggregator-Secret` must match.
- **Source:** `sourceHubId` from body or `X-Source-Hub` header.
- **Anonymization:** `pseudoId` is hashed: `anon-{sanitizedSourceHubId}-{sha256(sourceHubId:pseudoId).slice(0,12)}` so same (sourceHubId, pseudoId) maps to same anonymous ID across villages.

---

## 9. Event Buffering and Flush

### 9.1 In-Memory Buffer

- **Max size:** 50,000 events (`EVENT_BUFFER_MAX`).
- **On overflow:** New events dropped; warning logged.
- **Format:** Array of JSON strings (one per event).

### 9.2 Flush

- **Interval:** 30 seconds (`FLUSH_INTERVAL_MS`).
- **Target file:** `data/events/YYYY-MM-DD.ndjson` (one NDJSON line per event).
- **Retries:** Up to 3 attempts with 1s delay.
- **Fallback:** On final failure, append to `data/events/failed-YYYYMMDD.ndjson`.
- **Time-skew:** Skip flush if system year &lt; MIN_VALID_YEAR.

### 9.3 Analysis Triggers

- **Event threshold:** When `_eventsSinceLastAnalysis >= ANALYSE_AFTER_N` (50) and at least `MIN_MS_BETWEEN_ANALYSIS` (4 hours) since last attempt.
- **Periodic:** `setInterval(runAnalysis, MIN_MS_BETWEEN_ANALYSIS)` — fallback if threshold not hit.
- **Cron:** `parseCronTime(ANALYSE_CRON)` — default `02:00`; runs at most once per day.
- **Startup:** One analysis run on process start.

### 9.4 Event Retention

- **Pruning:** After each analysis, delete NDJSON files older than `AGNI_TELEMETRY_ENGINE_RETENTION_DAYS` (default 90).
- **Cursor state:** `telemetry-engine-state.json` stores per-file read cursors for incremental processing.

---

## 10. Telemetry Engine Analysis

**File:** `packages/agni-hub/telemetry-engine-analysis.js`

Pure functions; no I/O. Used by telemetry-engine for validation and analysis.

### 10.1 validateEvent(raw, opts)

- Requires: `lessonId`, `completedAt`, `mastery` ∈ [0,1].
- Normalizes `skillsProvided` to `[{ skill, evidencedLevel }]` (accepts string or object).
- Rejects path traversal in `lessonId` (`/`, `\`, `..`).
- Returns normalized event or `null`.

### 10.2 processOneEvent(ev, mastery, contingencies, opts)

- **Mastery:** Updates `mastery.students[pid]` with `skillsProvided` / `evidencedLevel`.
- **Contingencies:** For each (prior, target) skill pair, updates 2×2 contingency table:
  - `a`: had prior, passed target
  - `b`: had prior, failed target
  - `c`: no prior, passed target
  - `d`: no prior, failed target
- Pass threshold default 0.6; mastery threshold from opts (default 0.6).

### 10.3 discoverCohort(mastery, opts)

- Builds mastery vectors (skill × 0/1 by mastery threshold).
- Clusters by **Jaccard similarity** (threshold default 0.5).
- Returns `{ clusters, largest }` or `null` if &lt; minVectors (20) or largest &lt; minClusterSize (20).

### 10.4 computeEdgesFromGlobalPairs(globalPairs, opts)

- For each (prior, target) pair with `n >= minSample` (20):
  - Chi-square test (2×2 contingency).
  - `benefit = P(pass | prior) - P(pass | no prior)`.
  - `weight = 1 - benefit` (0 = full transfer, 1 = no benefit).
  - `confidence` from chi-square and sample size.
- Returns `[{ from, to, weight, confidence, sample_size }]`.

### 10.5 cohortIdFromCentroid(centroid)

- Deterministic ID: `c_` + first 8 chars of SHA-256 of centroid string.
- Used for per-cohort graph file names.

### 10.6 buildCohortAssignments(clustersWithIds)

- Maps `pseudoId` → `cohortId` for each cluster member.

---

## 11. Graph Weights Output

### 11.1 Schema

**File:** `schemas/graph-weights.schema.json`

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semver (e.g. 1.7.0) |
| `discovered_cohort` | string | `c_[0-9a-f]{6,}` |
| `level` | string | `village`, `regional`, or `global` |
| `sample_size` | int | Number of learners in cohort |
| `created_date`, `last_updated` | string | ISO 8601 |
| `default_weight` | number | 1.0 (no discount when no edge) |
| `weight_estimation_method` | string | `correlation_based` |
| `clustering_method` | string | `jaccard_similarity` |
| `edges` | array | `{ from, to, weight, confidence, sample_size }` |
| `metadata` | object | `computation_date`, `software_version` |

### 11.2 Weight Semantics

- **weight = 0:** Complete transfer — mastering prior makes target trivial.
- **weight = 1:** No transfer benefit — full difficulty remains.
- **confidence:** Reliability of the edge; theta uses edges with `confidence >= 0.5`.

### 11.3 Rate Limiting

- `AGNI_TELEMETRY_ENGINE_WEIGHT_MAX_DELTA` (default 0.2): Per-edge change capped:  
  `newWeight = oldWeight + clamp(computed - oldWeight, -delta, +delta)`.

### 11.4 Human-Review Gating

- If any edge change exceeds `AGNI_TELEMETRY_ENGINE_WEIGHT_REVIEW_THRESHOLD` (default 0.3):
  - Write to `graph-weights-pending.json` instead of overwriting `graph-weights.json`.
  - Live graph unchanged until operator promotes pending file.
  - Status reports `pendingReview: true`, `pendingPath`.

### 11.5 Backup

- Before overwriting `graph-weights.json`, copy current to `graph-weights.backup.json`.

### 11.6 Multi-Cohort (B1.1)

- Main cohort → `graph-weights.json`.
- Other qualifying clusters → `graph-weights-{cohortId}.json`.
- `cohort-assignments.json` maps pseudoId → cohortId for theta selection.

---

## 12. Pathfinder (Theta) — Graph Consumption

### 12.1 getEffectiveGraphWeights(pseudoId)

**Selection order:**

1. If `pseudoId` and `cohort-assignments.json` maps it to a cohort:
   - Use `graph-weights-{cohortId}.json` if it exists and has ≥ MIN_LOCAL_EDGE_COUNT (default 5) edges.
2. Else if local `graph-weights.json` has `sample_size >= MIN_LOCAL_SAMPLE_SIZE` (default 40) and `edges.length >= MIN_LOCAL_EDGE_COUNT` (default 5):
   - Use local.
3. Else if `graph-weights-regional.json` exists with edges:
   - Use regional.
4. Else if `graph-weights-mesh.json` exists with edges:
   - Use mesh.
5. Else use local (may be empty or default).

### 12.2 getResidualCostFactor(targetSkill, pseudoId, masterySummary, graphWeights)

- Find inbound edges: `e.to === targetSkill` and `e.confidence >= 0.5`.
- For each edge where student has mastered `e.from`:
  - `priorStrength = min(1, evidenced / MASTERY_THRESHOLD)`.
  - `totalBenefit += (1 - edge.weight) * priorStrength`.
- Return `max(0.15, 1 - totalBenefit)` (MIN_RESIDUAL = 0.15).

### 12.3 computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights)

- For each skill the lesson provides:
  - `repBaseCost` = max base cost.
  - `repResidual` = getResidualCostFactor for that skill.
- `rawTheta = repBaseCost * repResidual - coherenceBonus`.
- `theta = max(0.001, rawTheta)` (MIN_MLC floor).

### 12.4 Invariant: graph_weights Affect Only MLC, Never Eligibility

- **Eligibility** is determined solely by ontology (`requires`/`provides`) and mastery thresholds.
- Graph weights **only** influence sort order (θ) among already-eligible lessons.
- Pathfinder will never offer a lesson unless required skills are mastered — graph weights cannot make a lesson eligible.

---

## 13. Sync and Regional Graph Weights

**File:** `packages/agni-hub/sync.js`

### 13.1 Import

- Incoming `graph_weights` with `level !== 'village'` and valid edges:
  - Sanitize: clamp `weight`, `confidence` to [0, 1]; reject self-loops (`from === to`).
  - Write to `graph-weights-{level}.json` (e.g. `graph-weights-regional.json`).

### 13.2 Export

- Sync packages events and cohort metadata for outbound shipment.
- Regional tier may aggregate and return graph_weights for import.

---

## 14. Configuration Reference

**Source:** `packages/agni-utils/env-config.js`

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_TELEMETRY_ENGINE_PORT` | 8081 | HTTP listen port |
| `AGNI_TELEMETRY_ENGINE_FORWARD` | true | Theta forwards to engine when false disabled |
| `AGNI_ANALYSE_AFTER` | 50 | Events before triggering analysis |
| `AGNI_ANALYSE_CRON` | 02:00 | Scheduled analysis time (HH:MM) |
| `AGNI_TELEMETRY_ENGINE_RETENTION_DAYS` | 90 | NDJSON prune age |
| `AGNI_TELEMETRY_ENGINE_MIN_VALID_YEAR` | 2020 | Reject writes when year &lt; this |
| `AGNI_TELEMETRY_ENGINE_CHI2_THRESHOLD` | 3.841 | Chi-squared significance |
| `AGNI_TELEMETRY_ENGINE_MIN_SAMPLE` | 20 | Min sample per edge |
| `AGNI_TELEMETRY_ENGINE_JACCARD_THRESHOLD` | 0.5 | Clustering similarity |
| `AGNI_TELEMETRY_ENGINE_MIN_CLUSTER_SIZE` | 20 | Min cohort size |
| `AGNI_TELEMETRY_ENGINE_WEIGHT_MAX_DELTA` | 0.2 | Per-edge change cap |
| `AGNI_TELEMETRY_ENGINE_WEIGHT_REVIEW_THRESHOLD` | 0.3 | Human-review gate |
| `AGNI_AGGREGATOR_INGEST_ENABLED` | 0 | Set 1 for B1.1 ingest |
| `AGNI_AGGREGATOR_INGEST_SECRET` | *(empty)* | Required when ingest enabled |

---

## 15. Data Files

| File | Location | Description |
|------|----------|-------------|
| `events/YYYY-MM-DD.ndjson` | data/events/ | Daily event log |
| `events/failed-YYYYMMDD.ndjson` | data/events/ | Fallback when flush fails |
| `graph-weights.json` | data/ | Main cohort graph |
| `graph-weights-pending.json` | data/ | Pending (review gated) |
| `graph-weights.backup.json` | data/ | Pre-write backup |
| `graph-weights-{cohortId}.json` | data/ | Per-cohort graphs |
| `graph-weights-regional.json` | data/ | From sync import |
| `graph-weights-mesh.json` | data/ | From mesh sync |
| `cohort-assignments.json` | data/ | pseudoId → cohortId |
| `mastery-summary.json` | data/ | Shared with theta (skill levels) |
| `contingency-tables.json` | data/ | Per-student 2×2 counts |
| `telemetry-engine-state.json` | data/ | Incremental cursors |
| `telemetry-engine.log` | data/ | Engine log file |

---

## 16. Failure Modes and Recovery

### 16.1 Pi Without RTC (Clock at 1970)

- **Symptom:** POST returns 503; flush skipped.
- **Fix:** Set clock via `AGNI_SYNC_SET_CLOCK=1` and sync, or manually: `sudo date -s "2024-01-15 12:00:00"`.

### 16.2 Disk Full

- **Symptom:** Flush fails; events go to `failed-*.ndjson`.
- **Mitigation:** Reduce `AGNI_TELEMETRY_ENGINE_RETENTION_DAYS`; free space.

### 16.3 Bad graph_weights Update

- **Restore from backup:** Copy `graph-weights.backup.json` over `graph-weights.json`.
- **Revert pending:** Delete `graph-weights-pending.json` if not yet promoted.
- **Use regional:** Remove local graph so theta falls back to regional.

### 16.4 Telemetry Engine Unreachable

- Theta continues; events stored in `telemetry-events.json`, mastery/LMS/SM-2 updated.
- Forward fails (logged); no graph_weights update until engine is running and receives events.

### 16.5 Graceful Shutdown

- On SIGTERM/SIGINT: set `_shuttingDown`, drain buffer (flush), then exit.
- Timeout 10s; then force exit(1).

---

## 17. Operational Runbook

### 17.1 Start Telemetry Engine Standalone

```bash
node hub-tools/telemetry-engine.js
# or
node packages/agni-hub/telemetry-engine.js
```

### 17.2 Check Status

```http
GET http://localhost:8081/api/sentry/status
```

Returns buffer size, last analysis time, graph update time, edges count, pending review status.

### 17.3 Promote Pending Graph

```bash
cp data/graph-weights-pending.json data/graph-weights.json
# Restart theta or wait for cache invalidation
```

### 17.4 Disable Forwarding

Set `AGNI_TELEMETRY_ENGINE_FORWARD=false` if Telemetry Engine is not deployed.

---

## 18. Extension Points

| Goal | Location |
|------|----------|
| Change validation rules | `telemetry-engine-analysis.js`: validateEvent |
| Change clustering | `telemetry-engine-analysis.js`: discoverCohort, jaccardSimilarity |
| Change edge computation | `telemetry-engine-analysis.js`: computeEdgesFromGlobalPairs, computeConfidence |
| Change graph selection | `pathfinder.js`: getEffectiveGraphWeights |
| Change residual formula | `pathfinder.js`: getResidualCostFactor |
| Add new event fields | Runtime telemetry.js, validateEvent, processOneEvent |
| Cross-village aggregation | `POST /api/telemetry/ingest`, anonymizeForAggregator |

---

## 19. Related Documents

- **Playbook:** `docs/playbooks/sentry.md` — How to change analysis, configuration, theta integration.
- **Architecture:** `docs/ARCHITECTURE.md` §7.3 — Skill collapse concept.
- **Configuration:** `docs/CONFIGURATION.md` — Env vars (note: some use legacy SENTRY names).
- **Federation:** `docs/playbooks/federation.md` — Sync contracts, graph_weights deployment.
- **Mesh/LoRa:** `docs/playbooks/mesh-lora.md` — graph_weights sync via LoRa.
