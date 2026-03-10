# AGNI / OLS — Detailed Architecture Analysis

**Deep-dive architecture documentation.** Prioritizes depth over brevity. The canonical high-level overview remains `docs/ARCHITECTURE.md`; this document extends it with implementation details, data flows, and cross-component contracts.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Monorepo Structure and Package Dependency Graph](#2-monorepo-structure-and-package-dependency-graph)
3. [Data Model and Schemas](#3-data-model-and-schemas)
4. [Compilation Pipeline](#4-compilation-pipeline)
5. [Village Hub Architecture](#5-village-hub-architecture)
6. [LMS Engine](#6-lms-engine)
7. [Browser Runtime](#7-browser-runtime)
8. [Security and Integrity](#8-security-and-integrity)
9. [Governance and Compliance](#9-governance-and-compliance)
10. [Knowledge Architecture (UTUs and Ontology)](#10-knowledge-architecture-utus-and-ontology)
11. [Configuration and Bootstrap](#11-configuration-and-bootstrap)
12. [Verification and CI](#12-verification-and-ci)

---

## 1. Executive Summary

**AGNI** (Adaptive Gateway for Network-Independent Learning) implements the **Open Lesson Standard (OLS)** — a decentralized, offline-first protocol for interactive education on resource-constrained hardware (Raspberry Pi hubs, Android 7.0+ edge devices).

### Design Philosophy

| Principle | Manifestation |
|-----------|---------------|
| **Source-to-Artifact** | Lessons are authored in human-readable YAML. HTML/native bundles are generated Just-in-Time (JIT) at the Village Hub — not distributed as heavy binaries. |
| **Smart Edge** | The Hub uses local CPU to "inflate" content for the village. YAML transmission (~50KB for 100 lessons) vs. pre-built HTML (~500KB with caching) yields ~90% bandwidth savings. |
| **Zero-Trust Prerequisites** | The `gate` block enforces prerequisite checks before any lesson is offered. The skill graph is a DAG; cycles make lessons permanently ineligible. |
| **Epistemic Pluralism** | Learning paths adapt to local "Generative Metaphors" (e.g., weaving logic before math for specific cohorts). Theta and Sentry tune MLC and graph weights from observed data. |
| **Device Binding** | Lessons can be signed per device for integrity, anti-copy watermarking, and ownership binding when auth is enabled. |
| **Hub-and-Spoke (data) / Mesh (signaling)** | Content flows Hub → device. Peer-to-peer signaling (Bluetooth LE, WebRTC) remains allowed for interaction (e.g., multiplayer quiz) without bypassing the Authority node. |

### Run Environments

| Environment | Hardware | Stack | Constraints |
|-------------|----------|-------|-------------|
| **Edge (student)** | Android 7.0+ (Nougat), <2GB RAM, intermittent power | Chrome 51 WebView, vanilla JS | **ES5 only** — no `let`/`const`, arrow functions, template literals, `class`, spread. No frameworks. |
| **Village Hub** | Raspberry Pi, Node 14+ | Node.js, CommonJS | Centralized config via `hub-config.json`; `loadHubConfig()` must run before any consumer. |
| **Portal** | Desktop browser | Vanilla HTML/CSS/JS | Teacher/admin UI; no build step. |
| **CLI / Scripts** | Dev machine or CI | Node.js | Not edge, not necessarily Pi. |

---

## 2. Monorepo Structure and Package Dependency Graph

### Package Layout

Canonical implementations live in `packages/`. The `src/` tree re-exports from packages for backward compatibility. **Edit packages, not re-exports.**

| Package | Path | Role | Dependencies |
|---------|------|------|--------------|
| **@agni/utils** | `packages/agni-utils/` | Pure utilities: logging, config, crypto, I/O, yaml-safe, feature-inference, runtimeManifest | Leaf (no monorepo deps) |
| **@agni/runtime** | `packages/agni-runtime/` | Browser runtime: player, sensors, SVG factories, integrity | Browser-only (no Node deps) |
| **@ols/schema** | `packages/ols-schema/` | OLS JSON schema, validators, threshold grammar | @agni/utils |
| **@agni/engine** | `packages/agni-engine/` | LMS: Rasch, Thompson, embeddings, PageRank, Markov, federation | @agni/utils |
| **@agni/governance** | `packages/agni-governance/` | Policy, compliance, catalog | @agni/utils, @ols/schema |
| **@ols/compiler** | `packages/ols-compiler/` | YAML → IR → HTML/native/YAML-packet | @ols/schema, @agni/utils |
| **@agni/services** | `packages/agni-services/` | Top-down API: accounts, author, governance, LMS, lesson-chain, lessonAssembly | @ols/compiler, @agni/engine, @agni/governance |
| **@agni/hub** | `packages/agni-hub/` | Hub server: theta, hub-transform, sentry, sync, routes | @agni/services, theta, hub-transform |
| **@agni/plugins** | `packages/agni-plugins/` | Factory/step/sensor registration | Leaf |
| **@agni/lesson-gen** | `packages/agni-lesson-gen/` | LLM lesson generator | Optional, tools |

### Dependency Flow (acyclic)

```
@agni/utils          (leaf)
@agni/runtime        (browser, leaf)
@agni/plugins        (leaf)
       ↑
@ols/schema          ← @agni/utils
@agni/engine         ← @agni/utils
@agni/governance     ← @agni/utils, @ols/schema
       ↑
@ols/compiler        ← @ols/schema, @agni/utils
       ↑
@agni/services       ← @ols/compiler, @agni/engine, @agni/governance
       ↑
@agni/hub            ← @agni/services
```

### Key Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| CLI | `packages/agni-cli/cli.js` | Compile lessons, hub setup, lms-repair |
| Theta (hub API) | `packages/agni-hub/theta.js` | HTTP server, lesson ordering, LMS, governance, accounts |
| Hub-transform | `packages/agni-hub/hub-transform.js` | On-demand YAML → HTML compilation |
| Sentry | `packages/agni-hub/sentry.js` | Telemetry analysis, graph_weights |
| Sync | `packages/agni-hub/sync.js` | USB/sneakernet sync |
| Player | `packages/agni-runtime/ui/player.js` | Browser lesson player (loaded inline in HTML) |

---

## 3. Data Model and Schemas

### OLS Lesson YAML Structure

An OLS file is a YAML document with strictly defined blocks:

| Block | Role |
|-------|------|
| **`meta`** | Dublin Core metadata (identifier, title, language, license, created). Optionally: `utu`, `teaching_mode`, `is_group`, `yamlSchemaVersion`. |
| **`ontology`** | Skill contract: `requires` (prerequisites) and `provides` (skills taught). Drives theta eligibility and graph traversal. |
| **`gate`** | Logic block for zero-trust prerequisite check. Can specify quiz, passing_score, retry_delay, on_fail. |
| **`steps`** | Content payload: text (Markdown), hardware_trigger (sensors), quiz, fill_blank, matching, ordering, svg, completion. |

### Intermediate Representation (IR)

`LessonIR` (`packages/types/index.d.ts`) is the canonical in-memory format produced by `buildLessonIR`:

```typescript
interface LessonIR {
  meta?: LessonMeta;
  ontology?: LessonOntology;
  gate?: LessonGate | null;
  steps: LessonStep[];
  inferredFeatures: InferredFeatures;
  requires?: LessonRequires;  // factories for factory-loader
  metadata_source: 'inferred' | 'declared' | 'mixed' | string;
  _devMode: boolean;
  _compiledAt: string;
  _schemaVersion: string;
}
```

**InferredFeatures** includes: `flags` (has_equations, has_sensors, has_visuals, etc.), `katexAssets`, `factoryManifest`, `vark`, `bloomsCeiling`, `difficulty`, `archetypeId`, `coherence`.

### Sidecar (lesson-ir.json)

`buildLessonSidecar(ir)` produces a JSON sidecar written alongside each compiled lesson. Theta reads sidecars at `serveDir/lessons/{slug}/index-ir.json`. Lessons without a valid IR sidecar are **not indexed**. Fields: identifier, slug, title, language, difficulty, ontology, gate, inferredFeatures, katexAssets, factoryManifest, compiledAt, schemaVersion.

### LMS State

`LMSState` (`packages/agni-engine/`, `packages/types/index.d.ts`):

| Sub-state | Role |
|-----------|------|
| `rasch` | Students (ability, variance), probes (difficulty, skill), globalAnchor |
| `embedding` | dim, lr, reg, forgetting; students, lessons (latent vectors) |
| `bandit` | A (precision matrix), b, featureDim, forgetting, observationCount, seenSyncIds |
| `markov` | transitions, bigrams, studentHistory, dropouts, cooldowns |

Persisted to `AGNI_DATA_DIR/lms_state.json`. Atomic write: `.tmp`, fsync file, rename, then fsync parent directory (ext4/SD durability).

---

## 4. Compilation Pipeline

### High-Level Flow

```
rawYaml
  → parseLessonFromString / parseLessonYaml  (@agni/utils/yaml-safe)
  → lessonSchema.validateLessonData()        (@ols/schema)
  → buildLessonIR()                          (packages/ols-compiler/compiler/build-lesson-ir.js)
  → buildLessonSidecar(ir)
  → buildHtml() | buildNative() | buildYamlPacket()
```

### Stage 1: Parse

- **Location:** `packages/ols-compiler/services/compiler.js`
- **YAML safety:** `safeYamlLoad()` enforces maxBytes (default 2MB), rejects anchors/aliases, no custom tags, maxAliasCount 50.
- **Output:** `{ lessonData }` from `<YAML_DIR>/<slug>.yaml` or `<YAML_DIR>/<slug>/index.yaml`.

### Stage 2: Validate

- **Location:** `@ols/schema/lesson-schema`
- **Result:** `{ valid, errors, warnings }`. Invalid lessons are rejected before IR.

### Stage 3: Build IR

- **Location:** `packages/ols-compiler/compiler/build-lesson-ir.js`

1. **inferFeatures(lessonData)** — `@agni/utils/feature-inference`:
   - Scans steps for equations, sensors, tables, visuals, geometry.
   - Builds `katexAssets`, `factoryManifest` from step specs.
   - Computes VARK profile, blooms ceiling, difficulty (1–5), dominant teaching style.

2. **archetypeMatch.validateCoherence()** — assigns `archetypeId` and `coherence` (0–~1.38).

3. **Markdown processing** — `processMarkdown(step.content)` per step. KaTeX, tables, code blocks. Output: `htmlContent`.

4. **Numeric param audit** — SVG spec `opts` keys (length, width, radius, etc.) validated as numeric; non-numeric logged (AUDIT-E1).

5. **IR assembly** — Merges lessonData + inferredFeatures + steps (with htmlContent) + stamps (_devMode, _compiledAt, _schemaVersion).

### Stage 4: Build Sidecar

- **Function:** `buildLessonSidecar(ir)`
- **Output:** JSON written to `{htmlBasename}-ir.json` or `index-ir.json` in serveDir layout.

### Stage 5: Build Artifact

| Format | Builder | Output |
|--------|---------|--------|
| **HTML** | `packages/ols-compiler/builders/html.js` | Single HTML + inline script (LESSON_DATA, factory-loader, player). Copies shared-runtime, integrity, sensor-bridge, etc. |
| **Native** | `packages/ols-compiler/builders/native.js` | lesson.json + content/*.md + shared libs |
| **YAML-packet** | `packages/ols-compiler/builders/yaml-packet.js` | Thin-client format |

### Lesson Assembly (HTML)

`packages/ols-compiler/services/lesson-assembly.js` builds the script block:

1. factory-loader.js (bootstrap)
2. `window.LESSON_DATA = <ir JSON>`
3. `OLS_SIGNATURE`, `OLS_PUBLIC_KEY`, `OLS_INTENDED_OWNER` (integrity globals)
4. player.js
5. Load handler (hide loading div)

**Signing:** When auth is enabled, Hub computes `Hash(Content + NUL + pseudoId)`, signs with Ed25519, injects into globals. Content = full lesson script (nonce + factory-loader + LESSON_DATA + player) with signature placeholder.

### Entry Points

| Caller | Path |
|--------|------|
| CLI | `packages/agni-cli/cli.js` → `@agni/services/compiler` → `compileLessonFromYamlFile()` |
| Hub on-demand | `hub-transform.compileLesson(slug)` → same pipeline |
| Author API | `POST /api/author/preview` → validate + build IR |

---

## 5. Village Hub Architecture

### Request Routing Order

1. **hub-transform** handles first: `/lessons/:slug`, `/factories/:file`, `/katex/:file`, `/shell/:slug`, `/library`, `/manifest.json`, `/sw.js`, `/lesson-data.js`.
2. Unhandled requests fall through to **theta** Router: `/api/*`, `/health`.

### Hub-Transform

**File:** `packages/agni-hub/hub-transform.js`

| Route | Handler | Notes |
|-------|---------|-------|
| `GET /lessons/:slug` | Compile YAML → HTML | Disk cache: serveDir/lessons/<slug>/index.html. Recompile only when yaml mtime > compiled mtime. |
| `GET /lessons/:slug/sidecar` | JSON sidecar only | |
| `GET /lesson-data.js?slug=` | JS payload for shell | window.LESSON_DATA |
| `GET /shell/:slug` | PWA shell + lesson-data.js | |
| `GET /library` | Library UI | |
| `GET /factories/:file` | Whitelist: shared-runtime.js, sensor-bridge.js, integrity.js, svg-stage.js, etc. | ALLOWED_FACTORY_FILES |
| `GET /katex/:file` | KaTeX CSS subset | ALLOWED_KATEX_FILES |

**Caching:**

- **Disk:** `serveDir/lessons/<slug>/index.html`, `index-ir.json`, `index-ir-full.json`
- **Memory:** LRU keyed by `slug + YAML mtime`. MAX_CACHE_ENTRIES (default 100), MAX_CONCURRENT_COMPILES (default 3)
- **Per-slug in-flight guard:** Concurrent requests for same slug await the same Promise (DoS mitigation).

**Device binding:** `_getRequestCompileOptions()` extracts session token → `validateStudentSession` → pseudoId. If valid, `_assembleHtml` uses pseudoId as deviceId for signing.

### Theta

**File:** `packages/agni-hub/theta.js`

**Responsibilities:**
- Lesson index: `rebuildLessonIndex()` from catalog + IR sidecars at `serveDir/lessons/{slug}/index-ir.json`
- Skill graph: BFS with cycle guard (DFS back-edge detection). Cycle → fatal error at startup.
- MLC ordering: `computeLessonOrder()` filters eligible lessons, sorts by θ = BaseCost × ResidualFactor − CoherenceBonus. MLC clamped to [0, ∞).
- Frustration penalty: Lessons with high historical frustration get θ penalty (feedback loop from telemetry).
- LMS integration: Passes theta-eligible candidates to `lmsEngine.selectBestLesson()` when engine is available.

**Shared cache:** `skillGraph`, `eligibleLessons` invalidated when curriculum, lesson index, or schedules change (mtime check).

**Theta → LMS flow:**
```
GET /api/theta?pseudoId=xxx
  → getLessonsSortedByTheta(pseudoId)
  → updateSharedCacheIfNeeded()
  → loadMasterySummaryAsync, loadBaseCostsAsync, getEffectiveGraphWeights
  → computeLessonOrder() — BFS, theta scores
  → applyRecommendationOverride()
  → (optional) frustration penalty
  → Response: { lessons, precacheSlugs, graphWeights }

GET /api/lms/select?pseudoId=&candidates=...
  → lmsEngine.selectBestLesson(pseudoId, candidates)
  → Thompson + Markov + PageRank
  → Response: { selected, ability }
```

### Sentry → Graph Weights → Theta

- **Sentry** (`packages/agni-hub/sentry.js`): Receives `POST /api/telemetry`, buffers events, appends to `data/events/YYYY-MM-DD.ndjson`
- **Analysis:** After N events or cron: update mastery_summary, contingency_tables; cluster cohort (Jaccard); compute benefit (P(pass|prior) − P(pass|¬prior)); write `graph_weights.json`
- **Theta:** `getEffectiveGraphWeights()` reads local first; if sample_size and edges meet thresholds, use local; else fall back to regional.
- **Invariant:** Graph weights affect only MLC sort order, **never** eligibility. Eligibility = ontology.requires + mastery.

---

## 6. LMS Engine

**Location:** `packages/agni-engine/`

### Architecture

Theta owns **prerequisite enforcement** (BFS skill graph). The engine owns **selection** among theta-eligible candidates. The engine never sees ineligible lessons.

### Components

| Module | Algorithm | Role |
|--------|-----------|------|
| **rasch.js** | 1PL IRT (Newton-Raphson MAP) | Estimates student ability on logit scale. Produces gain proxy for embeddings and bandit. |
| **embeddings.js** | Online matrix factorization | Student × lesson latent factors. Forgetting decay. |
| **thompson.js** | Linear Thompson Sampling (RLS) | Posterior over θ. Samples θ, scores candidates as dot(θ, x). x = [studentVec, lessonVec]. |
| **markov.js** | Transition tables, bigrams | Transition probability and quality; dropout and cooldown penalties. |
| **pagerank.js** | Curriculum flow | Gateway lessons (unlock many paths) get positive signal. Bottleneck detection. |
| **federation.js** | Precision-weighted Bayesian merge | Merge bandit posteriors across village hubs. contentHash for dedup. |

### Composite Score (selectBestLesson)

```
composite = thompsonScore
  + MARKOV_WEIGHT * (transitionProb + transitionQuality)
  + BIGRAM_WEIGHT * (bigramProb + bigramQuality)
  + PAGERANK_WEIGHT * combinedPageRankScore
  - DROPOUT_PENALTY_WEIGHT * dropoutPenalty
  - COOLDOWN_PENALTY_WEIGHT * cooldownPenalty
```

Thompson is primary; Markov and PageRank are tie-breakers. Cold start: Markov and PageRank contribute zero.

### Pure Core

`applyObservation(state, observation)` is pure: (state, observation) → newState. No I/O. Used for testing. `recordObservation()` does load → applyObservation → save.

### State Migration

`migrations.migrateLMSState()` runs on load. Handles schema changes (embeddingDim, bandit shape, etc.). Corrupted state → backup to `.bak`, start fresh.

---

## 7. Browser Runtime

**Location:** `packages/agni-runtime/`

### Load Order (in HTML)

1. **factory-loader.js** — Loads factories from `ir.requires.factories`
2. **shared-runtime.js** — `AGNI_SHARED`: pub/sub, device detection, `mountStepVisual`, `destroyStepVisual`
3. **threshold-evaluator.js** — `AGNI_SHARED.thresholdEvaluator`: compiles threshold strings (e.g. `accel.total > 2.5g AND steady > 1.5s`)
4. **sensor-bridge.js** — DeviceMotion, DeviceOrientation, Phyphox; `publishSensorReading`
5. **player.js** — Main state machine

### Player Flow

1. **Init:** `LESSON_DATA` → steps, stepIdMap, initSensors()
2. **Gate:** For gate steps, evaluate quiz or manual verification; on pass/fail, route to skip_to / on_fail
3. **Routing:** `routeStep(step)` → `renderStep()` or branch (skip_to, condition)
4. **Step types:** measure, quiz, fill_blank, matching, ordering → `AGNI_SHARED.mountStepVisual(spec, container)`; hardware_trigger → sensor-bridge + thresholdEvaluator.watch(); completion → completion screen

### Sensor Bridge → Threshold Evaluation

```
sensor-bridge → publishSensorReading({ sensorId, value, timestamp })
  → AGNI_SHARED.lastSensorValues
  → subscribers notified

Player (hardware_trigger):
  → thresholdEvaluator.watch(thresholdStr, primarySensor, onMet)
  → compile(thresholdStr)
  → subscribe to sensor
  → on each reading: evaluate(lastSensorValues) → when true, onMet(), unsubscribe
```

### SVG Factory Pattern

Lessons reference specs: `type: "pendulum"`, `params: { length: 120 }`. `svg-stage.js` uses `AGNI_SVG.fromSpec()` to generate and animate SVG locally. Shared factory code cached via Service Worker; only params change per lesson.

### Integrity Verification

`integrity.js` (loaded via factory-loader): `verifyIntegrity()` reads `OLS_SIGNATURE`, `OLS_PUBLIC_KEY`, `OLS_INTENDED_OWNER`. Rebuilds hash of full lesson script + NUL + deviceId. Verifies Ed25519. Uses SubtleCrypto when available, TweetNaCl fallback for legacy WebKit.

---

## 8. Security and Integrity

### YAML Security

| Risk | Mitigation |
|------|------------|
| Billion laughs (anchors/aliases) | Pre-parse rejection; maxAliasCount 50 |
| Custom tags / prototype pollution | js-yaml JSON_SCHEMA only |
| Large input | AGNI_YAML_MAX_BYTES (default 2MB) |

All parsing via `@agni/utils/yaml-safe` or `@ols/compiler` `safeYamlLoad`.

### Device Binding (Signed Lease)

1. **Request:** With auth, device sends session token (cookie or Bearer). Hub validates → pseudoId.
2. **Binding:** `Hash(Content + NUL + pseudoId)` where Content = full lesson script (signature placeholder replaced).
3. **Signing:** Ed25519 with hub private key.
4. **Injection:** OLS_SIGNATURE, OLS_PUBLIC_KEY, OLS_INTENDED_OWNER in globals.

**Runtime checks:** (1) OLS_INTENDED_OWNER matches device UUID? (2) Signature matches content? Mismatch → "Unauthorized Copy" or "Corrupted File".

**No auth:** Hub serves unsigned lessons (signature empty, OLS_INTENDED_OWNER empty).

### usbPath Contract

Sync writes to USB. `AGNI_USB_PATH` must be under `USB_SAFE_ROOT` (`/mnt/usb`). Validated at env-config load and sync startup. Wrong path → throws.

### Bundle Separation

- **Lesson bundle:** HTML + inline script. Signed. Integrity verified at runtime.
- **Resource bundle:** shared-runtime.js, integrity.js, etc. Served from hub. SRI (sha384) per factory in LESSON_DATA; factory-loader verifies each fetch before execution. MitM on factory fetch fails SRI. Integrity hashes are in the signed lesson script. Not part of lesson signature themselves.

---

## 9. Governance and Compliance

**Location:** `packages/agni-governance/`

| Function | Role |
|----------|------|
| `loadPolicy` / `savePolicy` | Policy JSON (utuTargets, allowedTeachingModes, min/max difficulty, etc.) |
| `loadCatalog` / `saveCatalog` | Approved lesson catalog |
| `evaluateLessonCompliance` | Check lesson against policy → status (ok/warning/fail), issues[] |
| `aggregateCohortCoverage` | Coverage by UTU and skill for governance reporting |

**APIs (theta):** `GET /api/governance/report`, `GET /api/governance/policy`, `PUT /api/governance/policy`, `GET /api/governance/catalog`, `POST /api/governance/compliance`, etc.

---

## 10. Knowledge Architecture (UTUs and Ontology)

### UTUs (Taxonomy)

- **Purpose:** Broad classification (e.g. MAC-2 Band 4). Used by governance, discovery, LMS features.
- **Do not** determine sequencing. Sequencing = ontology.

### Ontology (Sequencing)

- **ontology.requires:** Hard prerequisites. Theta BFS: lesson eligible only if all required skills mastered.
- **ontology.provides:** Skills taught. Used for stabilisation tracking, graph building.

**Relationship:** UTU is a label on a subgraph. Many skill nodes share one UTU. Governance asks "how many MAC-2 Band 4 nodes stabilised?" — theta counts stabilised nodes in that bucket.

---

## 11. Configuration and Bootstrap

### Startup Order (Safety-Critical)

Hub processes (theta, sentry, sync) must call `loadHubConfig()` **before** `require('@agni/utils/env-config')`. This populates `process.env` from `hub-config.json` first.

**Config flow:** `hub-config.json` (loadHubConfig) → `process.env` → env-config (canonical reader). Env vars override file values.

### Key Config Items

| Item | Consumer |
|------|----------|
| dataDir | ensure-paths, accounts, lesson-chain, sync, sentry |
| serveDir | data-paths |
| yamlDir | author, hub-transform, theta |
| thetaPort, servePort, sentryPort | theta, hub-transform, sentry |
| hubId, usbPath | sync |
| embeddingDim, forgetting | engine |
| masteryThreshold | theta, governance |
| AGNI_PRIVATE_KEY_PATH | signing (hub, CLI) |

**Pi template:** `data/hub-config.pi.json`. Use `scripts/check-hub-config-pi.js` to validate.

---

## 12. Verification and CI

### Verify Groups

| Group | Scope | Scripts |
|-------|-------|---------|
| verify:core | Cross-cutting | dead-files, schema-sync, skill-dag, run-environments, es5 |
| verify:runtime | agni-runtime | svg-tools, runtime-manifest, runtime-headers |
| verify:hub | Hub + auth | hub-config-pi, hub-config-bootstrap, theta-api |
| verify:services | agni-services | services-no-scripts |
| verify:governance | agni-governance | governance-canonical |

### Tests

| Category | Purpose |
|----------|---------|
| test:unit | Mocha in tests/unit/ |
| test:integration | Package smoke, compiler |
| test:contract | API contract (no live server) |
| test:graph | Graph verification |
| test:e2e | Playwright |

### CI Pipeline (validate.yml)

1. lint, format:check, typecheck
2. codegen:validate-schemas
3. test:coverage
4. test:integration
5. test:contract
6. test:graph
7. **verify:all**
8. Validate OLS lessons
9. Build all lessons
10. Data directory cleanliness

---

## Appendix: File Reference

| Concern | Primary Files |
|---------|---------------|
| IR / sidecar | `packages/ols-compiler/compiler/build-lesson-ir.js` |
| HTML builder | `packages/ols-compiler/builders/html.js` |
| Lesson assembly | `packages/ols-compiler/services/lesson-assembly.js` |
| Hub transform | `packages/agni-hub/hub-transform.js` |
| Theta | `packages/agni-hub/theta.js` |
| LMS engine | `packages/agni-engine/index.js`, rasch.js, thompson.js, embeddings.js |
| Player | `packages/agni-runtime/ui/player.js` |
| Sensor / threshold | `packages/agni-runtime/sensors/sensor-bridge.js`, threshold-evaluator.js |
| Types | `packages/types/index.d.ts` |
| Schemas | `schemas/ols.schema.json`, `schemas/graph_weights.schema.json` |
