# How Sentry and graph_weights Feed Theta

This playbook describes the **Sentry → graph_weights → theta** flow: how telemetry becomes a cohort graph and how theta uses it for Marginal Learning Cost (MLC).

---

## 1. Overview

| Component | Role |
|-----------|------|
| **Sentry** (`packages/agni-hub/sentry.js`) | Receives anonymized lesson-completion events, updates contingency tables and mastery, discovers a cohort via clustering, and writes `graph_weights.json`. |
| **graph_weights.json** | File in `AGNI_DATA_DIR` (default `data/`) describing skill-to-skill transfer weights for a discovered cohort. Theta reads it to compute residual cost (transfer benefit). |
| **Theta** (`packages/agni-hub/theta.js`) | Reads `graph_weights.json` (local or regional), uses it in `getResidualCostFactor()` and `computeLessonTheta()` to order lessons by MLC. |

**Data flow:** Device/runtime → `POST /api/telemetry` (theta or Sentry) → events on disk → analysis run → `graph_weights.json` → theta reads it → lesson list sorted by θ.

**MLC bounds:** Theta clamps MLC to [0, ∞) (floor `MIN_MLC` = 0.001). Edge `weight` and `confidence` must be in [0, 1] so MLC cannot become negative or degenerate. Sentry clamps edges; sync sanitizes incoming regional graph_weights before writing.

### Invariant: graph_weights Affect Only MLC, Never Eligibility

**Skill Collapse updates affect only lesson sort order (MLC), never eligibility.** Eligibility is determined solely by the ontology (`ontology.requires` / `ontology.provides`) and mastery thresholds. Theta will never offer a lesson unless all required skills are mastered — graph weights cannot make a lesson eligible. See `docs/ARCHITECTURE.md` §7.1 and §7.3.

### Data Flow Options

| Mode | Path | When to use |
|------|------|-------------|
| **Default (integrated)** | Runtime → theta `POST /api/telemetry` → theta forwards to Sentry → `data/events/*.ndjson` | Standard deployment. Runtime POSTs to theta (port 8082). Theta processes events (mastery, LMS, review schedule) and forwards a copy to Sentry (port 8081). Sentry must be running. |
| **Standalone Sentry** | Runtime → Sentry `POST /api/telemetry` directly | When theta is not used, or when devices POST to Sentry's port directly. Set runtime `hubBase` to `http://hub:8081` or equivalent. |

**Configuration:** `AGNI_SENTRY_PORT` (default 8081), `AGNI_SENTRY_FORWARD` (default true; set to `false` to disable theta→Sentry forwarding, e.g. when Sentry is not deployed). When theta forwards, it POSTs to `http://127.0.0.1:AGNI_SENTRY_PORT/api/telemetry`. If Sentry is not running, the forward fails (logged) and theta continues; events are still stored in `telemetry-events.json` and mastery is updated.

---

## 2. Sentry: Event Ingestion and Analysis

### 2.1 HTTP API

- **Endpoints:**
  - `GET /health` — Returns `{ ok: true }`. Use for liveness probes.
  - `GET /api/sentry/status` — Returns `{ bufferSize, lastAnalysisAt, graphWeightsUpdatedAt, edgesCount, pendingReview, pendingPath }`. `edgesCount` is the number of edges in the current graph_weights.json (null if file missing). `pendingReview` is true when a large update was written to graph-weights-pending.json; `pendingPath` is the file path when applicable.
  - `POST /api/telemetry` — Submit events (see below).
- **Port:** `AGNI_SENTRY_PORT` (default `8081`)
- **Body:** JSON with `events` array (or single event). Each event:
  - `lessonId` (string), `completedAt` (string), `mastery` (number 0–1)
  - `skillsProvided`, `skillsRequired` (arrays; provided entries may have `{ skill, evidencedLevel }`)
  - `pseudoId` (optional), `eventId` (optional)

Events are validated, buffered in memory, and appended to **`data/events/YYYY-MM-DD.ndjson`** every 30 seconds. On flush failure (e.g. SD card full), Sentry retries up to 3 times with 1s delay; if all retries fail, events are written to **`data/events/failed-YYYYMMDD.ndjson`** as a last resort so data is not lost. Only if that fallback also fails are events discarded.

### 2.2 When Analysis Runs

- After **`ANALYSE_AFTER_N`** new events (default 50) since last run, or on a schedule (e.g. cron).
- At least **`MIN_MS_BETWEEN_ANALYSIS`** (4 hours) between runs to avoid thrashing.

### 2.3 What Analysis Does

1. **Incremental event processing**  
   Reads NDJSON from `data/events/`, updates:
   - **mastery_summary.json** — per-student skill levels (from `skillsProvided` / `evidencedLevel`).
   - **contingency_tables.json** — per-student counts (prior skill × target skill × pass/fail) for chi-square.

2. **Cohort discovery**  
   Builds mastery vectors (skill × 0/1 by `MASTERY_THRESHOLD` 0.6), clusters students by **Jaccard similarity** (≥ 0.5), and takes the largest cluster as the cohort (min 20 students).

3. **Graph weights**  
   Aggregates contingency tables over the cohort; for each (prior, target) pair with enough samples (≥ 20):
   - Chi-square test; if significant, computes **benefit** = P(pass | prior mastered) − P(pass | prior not mastered).
   - **Weight** = 1 − benefit (0 = full transfer, 1 = no benefit).
   - **Confidence** from chi-square and sample size.

4. **Write**  
   Writes **`data/graph_weights.json`** with:
   - `version`, `discovered_cohort`, `level: 'village'`, `sample_size`, `created_date`, `last_updated`
   - `weight_estimation_method: 'correlation_based'`, `clustering_method: 'jaccard_similarity'`
   - `default_weight: 1.0`, `edges: [{ from, to, weight, confidence, sample_size }]`
   - `metadata` (e.g. `software_version`, `computation_date`)

   Before writing, Sentry applies **rate limiting** and **human-review gating** (see §2.4 and §2.5).

Schema: **`schemas/graph_weights.schema.json`**. Sentry output conforms so that theta and CI validation can rely on it.

### 2.4 Weight Change Rate Limit

Per-edge weight changes are capped per analysis run to prevent sudden wholesale curriculum reordering. `AGNI_SENTRY_WEIGHT_MAX_DELTA` (default `0.2`) limits how much any single edge's `weight` may move toward the new value. If a previous graph exists, each edge is blended: `newWeight = oldWeight + clamp(computed - oldWeight, -delta, +delta)`.

### 2.5 Human Review for Large Updates

If any edge's weight would change by more than `AGNI_SENTRY_WEIGHT_REVIEW_THRESHOLD` (default `0.3`), Sentry writes to **`data/graph-weights-pending.json`** instead of overwriting `graph_weights.json`. The live graph is unchanged; an operator must review and manually promote the pending file to `graph_weights.json` when satisfied. Status reports `pendingReview: true` and `pendingPath` when applicable.

### 2.6 Rollback

If a bad update was committed:

1. **Restore from backup:** Sentry creates `data/graph-weights.backup.json` before each successful write. To rollback: copy `graph-weights.backup.json` over `graph-weights.json`, then restart theta (or wait for next cache invalidation).
2. **Revert pending:** If the bad update is still in `graph-weights-pending.json`, simply delete or rename it; the live graph is untouched.
3. **Restore from sync:** If regional graph exists, remove local `graph_weights.json` so theta falls back to regional; or import a known-good graph via sync.

---

## 3. Theta: Reading and Using graph_weights

### 3.1 Which File Theta Uses

- **Local:** `data/graph_weights.json`
- **Regional:** `data/graph_weights_regional.json` (e.g. from sync or manual drop-in)

**Selection** (`getEffectiveGraphWeights()`):

- If local has `sample_size >= MIN_LOCAL_SAMPLE_SIZE` (default 40) and `edges.length >= MIN_LOCAL_EDGE_COUNT` (default 5), use **local**.
- Else if regional exists and has edges, use **regional**.
- Else use local anyway (may be empty or default).

### 3.2 How Theta Uses the Graph

- **`getResidualCostFactor(targetSkill, pseudoId, masterySummary, graphWeights)`**  
  For the student, finds edges **into** `targetSkill` with `confidence >= MIN_CONFIDENCE` (0.5). For each such edge, if the student has mastered `edge.from`, adds `(1 − edge.weight)` scaled by prior strength. Returns a residual factor in [MIN_RESIDUAL, 1] (e.g. 0.15–1.0). Lower residual ⇒ more transfer benefit.

- **`computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights)`**  
  For each skill the lesson provides, gets base cost and residual factor (from graph). **θ = baseCost × residualFactor**. Lesson theta is the max over provided skills. Result is used to sort lessons by ascending θ (MLC).

So: **Sentry produces edges (prior → target, weight, confidence); theta uses them to discount difficulty when the student has already mastered the prior skill**, implementing “skill collapse” / transfer.

---

## 4. Optional: Regional Sync

- **packages/agni-hub/sync.js** (or `node hub-tools/sync.js`) can receive graph_weights from a regional tier and write `graph_weights_regional.json`.
- Theta prefers local village graph when it has enough data; otherwise falls back to regional. This supports “cultural adaptation” at village level with regional fallback.

---

## 5. Implemented vs Optional

| Piece | Status |
|-------|--------|
| Sentry HTTP receiver, event buffer, NDJSON write | Implemented |
| Contingency tables, mastery update, cohort clustering, edge computation, write to graph_weights.json | Implemented |
| Schema compliance (weight_estimation_method, clustering_method) | Implemented (Sentry outputs them) |
| Theta reads graph_weights, getEffectiveGraphWeights, residual in computeLessonTheta | Implemented |
| Sync of regional graph_weights (sync.js) | Implemented (write path); deployment/orchestration is environment-specific |
| Runtime → theta; theta forwards to Sentry | Implemented (packages/agni-hub/routes/telemetry.js) |

---

## 6. Where to Change What

| Goal | File(s) |
|------|--------|
| Change when analysis runs | `packages/agni-hub/sentry.js`: ANALYSE_AFTER_N, MIN_MS_BETWEEN_ANALYSIS, setInterval |
| Change cohort size or clustering | `env-config.js`: AGNI_SENTRY_JACCARD_THRESHOLD, AGNI_SENTRY_MIN_CLUSTER_SIZE |
| Change edge thresholds (chi2, sample size) | `env-config.js`: AGNI_SENTRY_CHI2_THRESHOLD, AGNI_SENTRY_MIN_SAMPLE |
| Weight change rate limit | `env-config.js`: AGNI_SENTRY_WEIGHT_MAX_DELTA (default 0.2) |
| Human-review threshold (large updates) | `env-config.js`: AGNI_SENTRY_WEIGHT_REVIEW_THRESHOLD (default 0.3) |
| Change theta’s graph selection | `packages/agni-hub/theta.js`: getEffectiveGraphWeights, MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT |
| Change residual formula | `packages/agni-hub/theta.js`: getResidualCostFactor, MIN_RESIDUAL, MIN_CONFIDENCE |
| Validate graph_weights shape | `schemas/graph-weights.schema.json`; CI in `.github/workflows/validate.yml` (fixtures and Sentry output). |
| Sync graph_weights validation | `packages/agni-hub/sync.js` — incoming regional graph_weights are sanitized: edge weight/confidence clamped to [0,1], self-loops rejected. Ensures MLC cannot become degenerate. |
