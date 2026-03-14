# @agni/engine — Architecture Document

**Canonical architecture for the AGNI LMS Engine.** This document describes the design, modules, data flow, invariants, and integration points in depth.

> **Package:** `packages/agni-engine/`  
> **Import:** `require('@agni/engine')`  
> **Role:** Pure algorithmic core for student modelling, adaptive lesson selection, and cross-hub federation.

---

## 1. Overview

The engine is a **Learning Management System (LMS)** engine that:

1. **Estimates student ability** (Rasch IRT)
2. **Learns student–lesson affinity** (embeddings, bandit)
3. **Selects the next lesson** for a student among a theta-filtered candidate set
4. **Records observations** and updates all model parameters
5. **Supports federated learning** across village hubs without sharing raw data

It is consumed by the **Pathfinder** (via `@agni/services/lms`) and HTTP routes. Pathfinder owns prerequisite enforcement; the engine owns selection among eligible lessons.

---

## 2. Design Principles

### 2.1 Pure Core, Persistence at the Edges

The engine follows a **reference implementation** pattern:

```
(state, observation) → newState     // applyObservation — pure, no I/O
load → applyObservation → save      // recordObservation — persistence at the edge
(state, studentId, candidates)      // selectBestLesson — pure scoring, no I/O
```

- **Pure functions:** `applyObservation`, `selectBestLesson` logic, `mergeBanditSummaries` do not touch the filesystem or network.
- **Persistence:** `loadState()`, `saveState()`, `recordObservation()` live in `index.js` and perform I/O. Tests can exercise core logic by calling `applyObservation` on in-memory state.

### 2.2 Responsibility Split: Pathfinder vs Engine

| Responsibility | Owner | Implementation |
|----------------|-------|----------------|
| Prerequisite enforcement | Pathfinder | BFS skill graph, `ontology.requires` |
| Eligible candidate set | Pathfinder | `computeLessonOrder`, MLC, graph weights |
| Lesson selection among candidates | Engine | Thompson Sampling, Markov, PageRank |
| Observation recording | Engine | Rasch, embeddings, bandit, Markov |
| Federation | Engine | `exportBanditSummary`, `mergeRemoteSummary` |

The engine **never sees ineligible lessons**. Pathfinder (theta) builds the candidate set; the engine picks one.

### 2.3 Target Runtime

- **Node.js 14+** (Village Hub, Raspberry Pi)
- **CommonJS** (no ESM)
- **ES2017+** syntax (async/await, Object.assign) — not ES5; engine runs server-side only
- **No external math libs** — pure JS (Cholesky, dot product, etc. in `math.js`)

---

## 3. Module Layout

```
packages/agni-engine/
├── index.js        # Orchestrator: state, API surface, persistence
├── rasch.js        # 1PL IRT ability estimation
├── thompson.js     # Linear Thompson Sampling bandit
├── embeddings.js   # Online matrix factorization (student/lesson vectors)
├── markov.js       # First- and second-order transition tracking
├── pagerank.js     # Curriculum and transition graph PageRank
├── federation.js   # Bandit summary export/merge (precision-weighted Bayesian)
├── math.js         # Linear algebra (Cholesky, dot, outer, randn)
├── migrations.js   # LMSState schema repair and migration
├── sm2.js          # SM-2 spaced repetition (standalone; used by telemetry)
├── *.d.ts          # TypeScript declarations (JSDoc-driven)
└── ARCHITECTURE.md # This document
```

---

## 4. State Model: LMSState

All engine state lives in a single JSON file: `{dataDir}/lms_state.json`.

### 4.1 Top-Level Structure

```typescript
interface LMSState {
  rasch:     RaschState;
  embedding: EmbeddingState;
  bandit:    BanditState;
  markov?:   MarkovState;
}
```

### 4.2 Rasch State

| Field | Type | Purpose |
|-------|------|---------|
| `students` | `Record<string, { ability, variance }>` | Per-student ability (logit scale) and posterior variance |
| `probes` | `Record<string, { difficulty, skill }>` | Lesson-as-probe: difficulty (logit), primary skill |
| `globalAnchor` | `{ meanAbility, stdAbility }` | Prior center (default 0, 1) |

- Ability is on the **logit scale** (unbounded; typically clamped to ±10).
- Probe difficulty: 1–5 from inferredFeatures → `(d - 3) * 1` logits (e.g. 3 → 0, 1 → −2, 5 → +2).

### 4.3 Embedding State

| Field | Type | Purpose |
|-------|------|---------|
| `dim` | number | Embedding dimension (default 16, configurable via `AGNI_EMBEDDING_DIM`) |
| `lr` | number | Learning rate (default 0.01) |
| `reg` | number | L2 regularization (default 0.001) |
| `forgetting` | number | γ ∈ [0.9, 1]; discounts older updates |
| `students` | `Record<string, { vector }>` | Per-student latent vector |
| `lessons` | `Record<string, { vector }>` | Per-lesson latent vector |

**Invariant:** `state.bandit.featureDim === state.embedding.dim * 2`. The bandit feature vector is `x = [...studentVec, ...lessonVec]`.

### 4.4 Bandit State

| Field | Type | Purpose |
|-------|------|---------|
| `A` | `number[][]` | Precision matrix (≈ Σ⁻¹) for RLS posterior; `(featureDim × featureDim)` |
| `b` | `number[]` | RLS RHS; `b = A · θ_map` |
| `featureDim` | number | Must equal `embedding.dim * 2` |
| `forgetting` | number | γ for RLS update: `A ← γA + xx'`, `b ← γb + x·gain` |
| `observationCount` | number | Total observations used to build posterior |
| `seenSyncIds` | string[] | Content hashes of merged summaries (dedup; cap 500) |
| `hubHighWater` | `Record<string, number>` | Per-hub export sequence (sneakernet loop prevention) |
| `exportSequence` | number | Local export counter |
| `mergeVersion` | number | Incremented on each federation merge |

### 4.5 Markov State

| Field | Type | Purpose |
|-------|------|---------|
| `transitions` | `Record<from, Record<to, { count, totalGain, avgGain }>>` | First-order (prev → next) |
| `bigrams` | `Record<"[from1,from2]", Record<to, ...>>` | Second-order (prev2, prev1 → next) |
| `studentHistory` | `Record<studentId, lessonId[]>` | Recent lessons per student (cap 10) |
| `dropouts` | `Record<lessonId, { count, totalContinuations }>` | Lessons where students stop |
| `cooldowns` | `Record<studentId, Record<lessonId, { observationIndex, gain }>>` | Recent completions/failures |

Eviction: `MAX_TRANSITION_SOURCES=300`, `MAX_BIGRAM_SOURCES=200`, `MAX_HISTORY=10`.

---

## 5. Data Flow

### 5.1 Observation Flow

```
Telemetry / LMS route
    ↓
recordObservation(studentId, lessonId, probeResults)
    ↓
applyObservation(state, { studentId, lessonId, probeResults })
    ├── rasch.updateAbility()        → gain (ability delta)
    ├── embeddings.updateEmbedding() (studentVec, lessonVec, gain)
    ├── thompson.updateBandit()      (x, gain)
    └── markov.recordTransition()    (prev→next, gain)
    ↓
saveState(state)
```

**Gain** is the Rasch ability delta; it serves as the reward signal for embeddings and bandit.

### 5.2 Selection Flow

```
Pathfinder: getLessonsSortedByPathfinder(pseudoId)
    → eligible lessons (theta/MLC ordered, topK capped)
    ↓
LMS route / client: candidates = [...lessonIds]
    ↓
selectBestLesson(studentId, candidates, ontologyMap)
    ├── Cap candidates to topKCandidates (default 500)
    ├── Ensure lesson vectors (seed if missing)
    ├── Thompson: sample θ, score each candidate as dot(θ, [studentVec, lessonVec])
    ├── Markov: scoreCandidate (transitionProb, transitionQuality, bigram, dropout, cooldown)
    ├── PageRank: scoreCandidates (curriculum, transition, personalized)
    └── Composite: ts + w1*markov + w2*bigram + w3*pagerank - w4*dropout - w5*cooldown
    ↓
Return lessonId with highest composite score
```

### 5.3 Lesson Seeding

On Pathfinder `rebuildLessonIndex()`:

1. Index built from catalog + IR sidecars.
2. For each lesson: `{ lessonId, difficulty, skill }` from `inferredFeatures` and `ontology.provides[0]`.
3. `seedLessons(entries)` → `seedLesson(lessonId, difficulty, skill)` per entry:
   - Ensures lesson embedding vector (small random init if new).
   - Registers Rasch probe: difficulty 1–5 → logit, skill stored.
4. Saves state once after all seeds.

---

## 6. Algorithm Details

### 6.1 Rasch (1PL IRT)

- **Model:** P(correct) = logistic(ability − difficulty).
- **Update:** Approximate Newton-Raphson MAP: gradient and Hessian from probe results, single Newton step (capped ±1).
- **Output:** Ability delta (gain) used as reward for bandit and embeddings.
- **Edge cases:** Zero valid probes → return 0 (no update). Invalid variance → reset to 1.

### 6.2 Embeddings (Online Matrix Factorization)

- **Objective:** `z·w ≈ gain` for student vector `z`, lesson vector `w`.
- **Update:** `err = gain − z·w`; gradient step with forgetting and L2:
  - `z_new = γ·z + lr·(err·w − reg·z)`
  - `w_new = γ·w + lr·(err·z − reg·w)`
- **Clamping:** Components clamped to ±2; per-step delta clamped to ±0.5 (avoids oscillation).
- **Initialization:** Small random noise (0.05 * randn) to break symmetry.

### 6.3 Thompson Sampling (Linear Bandit)

- **Model:** Reward ≈ `θ·x` where `x = [studentVec, lessonVec]`, `θ` from posterior N(μ, A⁻¹).
- **RLS:** `A ← γA + xx'`, `b ← γb + x·gain`; `μ = A⁻¹b` (Cholesky solve, O(n²)).
- **Sampling:** `θ = μ + L⁻¹z` where `z ~ N(0,I)`, `L` Cholesky of `A`.
- **Cold start:** Prior `A = 0.01 * I`, `b = 0`. Near-singular A → diagonal jitter (1e-9, then 1e-5) before Cholesky.
- **Forgetting:** Lower γ = faster adaptation; higher γ = more stable. Pi: typically 0.98.

### 6.4 Markov Transitions

- **First-order:** (prev → next) with count and avgGain; exponential forgetting (0.995).
- **Bigrams:** (prev2, prev1 → next) for richer sequences.
- **Dropout:** Track when students stop after a lesson; penalize high-dropout lessons.
- **Cooldown:** Penalize repeating recently completed/failed lessons (sequence-based, COOLDOWN_WINDOW=5).

### 6.5 PageRank

- **Curriculum graph:** From ontology (provides → requires). Gateway lessons (many successors) get high rank.
- **Transition graph:** From Markov transitions; quality-weighted (count × max(avgGain, 0.01)).
- **Personalized PageRank:** Teleport biased toward skill-gap lessons (ability < difficulty − 0.5).
- **Composite:** 0.3·curriculum + 0.3·transition + 0.4·personalized (normalized).
- **Caching:** Invalidated when observation count changes by ≥10 or probe count changes.

### 6.6 Federation

- **Export:** `getBanditSummary()` → `{ embeddingDim, mean, precision, sampleSize }`; `addSyncId()` adds content hash, hubId, exportSequence.
- **Merge:** Precision-weighted Bayesian: `P_merged = P_local + P_remote`, `μ_merged = P_merged⁻¹(P_local·μ_local + P_remote·μ_remote)`.
- **Dedup:** syncId (content hash) in `seenSyncIds`; hubHighWater prevents re-merge of same hub’s older exports.
- **Safety:** Remote mean clipped to ±10; embeddingDim must match; federating hubs must use identical `AGNI_EMBEDDING_DIM`.

---

## 7. Composite Scoring Weights

Default weights (from `env-config`):

| Signal | Config | Default | Role |
|--------|--------|---------|------|
| Markov (first-order) | `AGNI_MARKOV_WEIGHT` | 0.15 | Transition prob + quality |
| Markov (bigram) | (hardcoded) | 0.10 | Second-order sequence |
| PageRank | `AGNI_PAGERANK_WEIGHT` | 0.10 | Curriculum/transition/personalized |
| Dropout penalty | (hardcoded) | 0.20 | Penalize high-dropout lessons |
| Cooldown penalty | (hardcoded) | 0.30 | Penalize recent repeat |

Thompson score is the **primary** signal; Markov and PageRank act as tie-breakers and bonuses.

---

## 8. Configuration (env-config)

| Key | Default | Bounds | Purpose |
|-----|---------|--------|---------|
| `AGNI_EMBEDDING_DIM` | 16 | 4–1024 | Vector dimension |
| `AGNI_FORGETTING` | 0.98 | 0.9–1 | Bandit/embedding decay |
| `AGNI_EMBEDDING_LR` | 0.01 | 1e-6–0.1 | Embedding learning rate |
| `AGNI_EMBEDDING_REG` | 0.001 | 0–1 | L2 regularization |
| `AGNI_MARKOV_WEIGHT` | 0.15 | — | Markov signal weight |
| `AGNI_PAGERANK_WEIGHT` | 0.10 | — | PageRank signal weight |
| `AGNI_TOP_K_CANDIDATES` | 500 | 1–2000 | Max candidates for selection |
| `AGNI_MAX_STUDENTS` | 0 | — | 0 = unlimited |
| `AGNI_MAX_LESSONS` | 0 | — | 0 = unlimited |
| `AGNI_HUB_ID` | hub-local | — | For federation export/merge |
| `AGNI_DATA_DIR` | … | — | State file directory |

---

## 9. Persistence and Integrity

### 9.1 Atomic Writes

1. Write to `lms_state.json.tmp`
2. `fsync` file
3. `rename` to `lms_state.json`
4. `fsync` parent directory (ext4/SD durability)

### 9.2 Checksum

- SHA-256 of state payload (excluding `_checksum`) stored in `_checksum`.
- On load: if checksum mismatch → treat as corrupt, backup, start fresh.
- Migration tool: `npm run lms-repair` (CLI).

### 9.3 Migrations

`migrations.migrateLMSState(raw, opts)` runs on load:

- Ensures all required keys and types.
- Repairs bandit A/b dimensions (featureDim, symmetrize).
- Normalizes embedding vectors (length, finite check).
- Evicts excess Markov sources.
- Returns `{ state, migrated }`; if migrated, state is saved synchronously.

---

## 10. API Surface

### 10.1 Core

| Function | Signature | Description |
|----------|-----------|-------------|
| `seedLessons` | `(lessons) => Promise<void>` | Seed lesson embeddings and Rasch probes |
| `selectBestLesson` | `(studentId, candidates, ontologyMap?) => string\|null` | Select next lesson |
| `explainSelection` | `(studentId, candidates, ontologyMap?) => LMSSelectResult` | Full breakdown for teachers |
| `recordObservation` | `(studentId, lessonId, probeResults) => Promise<void>` | Record completion, update models |
| `applyObservation` | `(state, observation) => LMSState` | Pure core (no I/O) |
| `getStudentAbility` | `(studentId) => { ability, variance }\|null` | Rasch ability |

### 10.2 Federation

| Function | Signature | Description |
|----------|-----------|-------------|
| `exportBanditSummary` | `() => BanditSummary` | Export for sync |
| `mergeRemoteSummary` | `(remote) => Promise<{ merged, ... }>` | Merge remote summary |

### 10.3 Diagnostics

| Function | Signature | Description |
|----------|-----------|-------------|
| `getStatus` | `() => object` | Students, lessons, observations, etc. |
| `reloadState` | `() => void` | Reload from disk |
| `exportTransitionTable` | `() => object` | Markov edges for client |
| `getStudentLessonHistory` | `(studentId) => string[]` | Recent lessons |
| `getFlowBottlenecks` | `(topK?) => Array` | High stationary prob, low gain |
| `getDropoutBottlenecks` | `(minSample?) => Array` | High dropout rate |

---

## 11. Integration

### 11.1 Service Layer

`@agni/services/lms` exposes the engine via a Proxy. All engine methods are forwarded; `persistState` maps to `reloadState` when `persistState` is absent.

### 11.2 Pathfinder

- **Seeding:** `rebuildLessonIndex()` → `lmsEngine.seedLessons(seedEntries)` after index build.
- **Selection:** Routes call `getLessonsSortedByPathfinder(pseudoId)` for candidates, then optionally `selectBestLesson(pseudoId, candidates)` for the chosen lesson.

### 11.3 HTTP Routes (`packages/agni-hub/routes/lms.js`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/lms/select` | GET | Select lesson (pseudoId, candidates) |
| `POST /api/lms/observation` | POST | Record observation |
| `/api/lms/status` | GET | Engine status |
| `/api/lms/explain` | GET | Selection breakdown |
| `POST /api/lms/federation/merge` | POST | Merge remote bandit summary |
| `/api/lms/transitions` | GET | Markov transition table |
| `/api/lms/bottlenecks` | GET | Flow and dropout bottlenecks |

### 11.4 Telemetry

`recordObservation` is also called from the telemetry route when processing completion events.

### 11.5 SM-2 (Standalone)

`@agni/engine/sm2` exports `updateSchedule` for spaced repetition. Used by telemetry routes; not part of the core LMS state.

---

## 12. Invariants and Contracts

### 12.1 Hard Invariants

1. **featureDim = embedding.dim * 2** — Bandit and embeddings share this. Violation → throw.
2. **embedding.dim ∈ [1, 1024]** — Positive integer.
3. **forgetting ∈ [0.9, 1]** — Both bandit and embedding.
4. **Rasch gain** — Finite number; propagated to embeddings and bandit.
5. **Bandit A** — Must be symmetric positive-definite (or recoverable via jitter).

### 12.2 Federation Contract

- All federating hubs must use **identical** `AGNI_EMBEDDING_DIM`.
- `embeddingDim` in BanditSummary must match local; otherwise merge throws.
- Each hub must have unique `AGNI_HUB_ID` for sneakernet loop prevention.

### 12.3 Observation Contract

- `probeResults`: `Array<{ probeId, correct }>`; probeId typically = lessonId.
- Probes must be seeded before observation (via `seedLesson` or `seedLessons`).
- Duplicate probeId in one observation: skipped (seenProbeIds dedup).

---

## 13. Error Handling and Recovery

### 13.1 State Corruption

- Checksum mismatch → backup to `.bak`, `buildDefaultState()`.
- Parse error → backup, fresh state.
- Non-finite bandit A → `assertBanditAFinite` throws before `applyObservation`.

### 13.2 Near-Singular Bandit A

- Cholesky fails → try jitter 1e-9, then 1e-5.
- If still fails → return zero vector for θ (selection falls back to Markov/PageRank).

### 13.3 Capacity Limits

- `maxStudents` / `maxLessons` > 0 → reject new students/lessons when at cap.
- `recordObservation` throws; `seedLessons` warns and skips.

---

## 14. Dependencies

| Package | Use |
|---------|-----|
| `@agni/types` | LMSState, BanditSummary, LMSObservation, etc. |
| `@agni/utils` | env-config, logger |

No runtime dependency on compiler, governance, or hub. Engine is a leaf for LMS logic (hub/telemetry may call it).

---

## 15. Testing

- **Unit:** `tests/unit/engine-*.test.js`, `math.test.js`, `pagerank.test.js`, `markov.test.js`, `sm2.test.js`
- **Regression:** `tests/unit/regressions.test.js` (many engine scenarios)
- **Integration:** `tests/integration/select-best-lesson.test.js`, `sneakernet.test.js`
- **Pure core:** Use `applyObservation` on cloned state; no filesystem.
- **randn:** Call `math._randnClearCache()` before mocking `Math.random` to avoid test pollution.

---

## 16. References

- **Main ARCHITECTURE:** `docs/ARCHITECTURE.md` §7 (Adaptive Graph Engine)
- **Math playbook:** `docs/playbooks/math.md`
- **Types:** `packages/types/index.d.ts`
- **Verification:** `docs/VERIFICATION-GUARDS.md`, `.cursor/rules/sprint-verification.md`
