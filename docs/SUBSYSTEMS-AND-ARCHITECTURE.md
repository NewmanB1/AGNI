# AGNI System Architecture: Deep Subsystem Description

This document provides a thorough, detailed description of all subsystems and sub-subsystems of the AGNI (Open Lesson Standard) system. It is intended for developers, architects, and contributors who need to understand the full structural and functional layout.

---

## 1. Executive Overview

AGNI is a **decentralized, offline-first protocol** for interactive education on resource-constrained hardware. It compiles human-readable YAML lessons into single-file HTML bundles that run in browsers (Chrome 51+, Android 7.0 Nougat WebView) without requiring an internet connection after initial delivery.

**Core flow:** YAML source → Compiler → IR → HTML/native artifact → Player (browser) → Telemetry → LMS/Sentry → Adaptive ordering.

---

## 2. Top-Level Subsystems

The system is organized into these major subsystems:

| # | Subsystem | Package(s) | Role |
|---|-----------|------------|------|
| 1 | **Standards & Schema** | `@ols/schema`, `schemas/` | Lesson format, validation, grammar |
| 2 | **Compiler Pipeline** | `@ols/compiler` | YAML → IR → HTML/native/YAML-packet |
| 3 | **Utilities Foundation** | `@agni/utils` | Logging, config, crypto, I/O (leaf, no monorepo deps) |
| 4 | **Browser Runtime** | `@agni/runtime` | Player, sensors, SVG factories (ES5) |
| 5 | **LMS Engine** | `@agni/engine` | Rasch, Thompson, embeddings, PageRank, federation |
| 6 | **Governance** | `@agni/governance` | Policy, compliance, catalog |
| 7 | **Services Layer** | `@agni/services` | Accounts, author, LMS, governance, lesson-chain |
| 8 | **Village Hub** | `@agni/hub` | Theta, Sentry, Sync, hub-transform, routes |
| 9 | **CLI & Tooling** | `@agni/cli` | Compile, validate, hub wizards |
| 10 | **Portal** | `portal/` | Teacher and admin UI (vanilla HTML/CSS/JS) |
| 11 | **Supporting Infrastructure** | scripts, tests, hub-tools, tools | CI, verification, deployment |

---

## 3. Subsystem 1: Standards & Schema

**Location:** `packages/ols-schema/`, `schemas/`

### 3.1 Purpose

This subsystem *is* the Open Lesson Standard: it defines what constitutes a valid OLS lesson and provides validation, threshold grammar, and schema-driven contracts for the entire pipeline.

### 3.2 Sub-subsystems

#### 3.2.1 Lesson Schema (`lesson-schema.js`)

- **Role:** Loads and exposes the canonical OLS JSON schema from `schemas/ols.schema.json`.
- **Consumers:** Compiler, validators, author service.
- **Schema blocks:** `meta`, `ontology`, `gate`, `steps` — Dublin Core metadata, skill contract, prerequisite logic, content payload.

#### 3.2.2 Lesson Validator (`lesson-validator.js`)

- **Role:** Validates parsed lesson data against the OLS schema.
- **Output:** Pass/fail with structured error messages.
- **Used by:** Compiler pipeline, author preview, governance compliance.

#### 3.2.3 Threshold Grammar (`threshold-syntax.js`)

- **Role:** Parses and validates sensor threshold expressions used in lesson steps.
- **Format:** Expressions like `accel.total > 0.8` or compound logic for hardware triggers.
- **Consumers:** Runtime threshold-evaluator, compiler validation.

#### 3.2.4 Schema Store (Governance)

- Schema definitions for governance policy, graph weights, catalogs, etc., live in `schemas/` and are consumed by validators across the system.

### 3.3 Schema Files (Reference)

| Schema | Purpose |
|--------|---------|
| `ols.schema.json` | OLS lesson structure |
| `lesson-sidecar.schema.json` | IR sidecar (lesson-ir.json) |
| `inferred-features.schema.json` | Feature inference output |
| `graph-weights.schema.json` | Skill graph edge weights (Sentry) |
| `governance-policy.schema.json` | Policy contract |
| `approved-catalog.schema.json` | Lesson catalog |
| `hub-config.schema.json` | Hub configuration |
| `mastery-summary.schema.json` | Mastery tracking |
| `telemetry-events.schema.json` | Learning events |
| `groups.schema.json` | Student groups |
| `feature-flags.schema.json` | Feature toggles |
| `archetypes.schema.json` | Pedagogical archetypes |
| `learning-paths.schema.json` | Learning path definitions |
| `review-schedule.schema.json` | Spaced repetition |
| `recommendation-overrides.schema.json` | Teacher overrides |
| `parent-links.schema.json` | Parent–child links |

---

## 4. Subsystem 2: Compiler Pipeline

**Location:** `packages/ols-compiler/`

### 4.1 Purpose

Transforms YAML lesson source into executable artifacts (HTML, native bundle, YAML packet) via a well-defined IR (Intermediate Representation) layer.

### 4.2 Sub-subsystems

#### 4.2.1 Compiler Service (`services/compiler.js`)

- **Role:** Orchestrates the full pipeline: parse → validate → buildIR → buildArtifact.
- **Input:** Raw YAML string or file path.
- **Output:** HTML files, sidecars, or native artifacts depending on builder selection.
- **Integrations:** CLI, hub-transform.

#### 4.2.2 IR Builder (`compiler/build-lesson-ir.js`)

- **Role:** Builds the canonical IR from parsed lesson data.
- **Process:**
  - Feature inference (difficulty, VARK, Bloom, sensors, etc.)
  - Archetype coherence validation
  - Markdown processing for step content
  - Ontology normalization (requires/provides)
  - Compiler stamps (`_compiledAt`, `_schemaVersion`, `_devMode`)
- **Output:** IR object with `steps`, `inferredFeatures`, `ontology`, `metadata_source`.

#### 4.2.3 Markdown Pipeline (`markdown-pipeline.js`)

- **Role:** Processes step content from Markdown to HTML.
- **Includes:** KaTeX math rendering, sanitization.
- **Runs at build time** — no parsing cost at runtime.

#### 4.2.4 Lesson Assembly (`services/lesson-assembly.js`)

- **Role:** Assembles the final lesson script block for HTML output.
- **Responsibilities:** Device binding, signature injection, LESSON_DATA, globals, nonce, SRI for factories.
- **Shared by:** CLI and hub-transform for consistency.

#### 4.2.5 Builders

| Builder | Path | Output | Use Case |
|---------|------|--------|----------|
| **HTML** | `builders/html.js` | Single HTML file + `lesson-ir.json` sidecar | Browsers, PWA, sneakernet |
| **Native** | `builders/native.js` | `lesson.json` + `content/*.md` + shared libs | OLS Android Player (Kotlin/Flutter) |
| **YAML Packet** | `builders/yaml-packet.js` | Minimal YAML packet for thin clients | Lightweight distribution |

#### 4.2.6 Feature Inference (from `@agni/utils`)

- **Role:** Infers lesson features from content and metadata.
- **Output:** `inferredFeatures` — difficulty (1–5), VARK profile, Bloom ceiling, sensor flags, factory manifest, KaTeX asset list.
- **Consumers:** IR, LMS engine (feature vectors), theta indexing.

### 4.3 Pipeline Flow (Pure Core)

```
rawYaml → parse (yaml-safe) → validate (schema) → buildLessonIR → buildArtifact
```

I/O (file read/write) is at the edges; the pipeline itself is pure (input → output).

---

## 5. Subsystem 3: Utilities Foundation

**Location:** `packages/agni-utils/`

### 5.1 Purpose

Shared utilities with **no monorepo dependencies**. Leaf package used by all other packages.

### 5.2 Sub-subsystems

#### 5.2.1 Configuration

| Module | Role |
|--------|------|
| `env-config.js` | Canonical reader for env vars (dataDir, ports, limits, etc.) |
| `env-ranges.js` | Valid ranges for numeric config |
| `env-validate.js` | Startup validation of required config |
| `hub-config.js` | Loads `hub-config.json` into `process.env` (bootstrap order critical) |

#### 5.2.2 I/O & Persistence

| Module | Role |
|--------|------|
| `io.js` | File read/write helpers |
| `json-store.js` | JSON load/save with atomic write patterns |
| `atomic-write.js` | Temp + rename for safe writes |
| `file-lock.js` | Advisory file locking for concurrent access |

#### 5.2.3 Security & Crypto

| Module | Role |
|--------|------|
| `crypto.js` | Ed25519 signing, canonical JSON hashing for lesson binding |
| `yaml-safe.js` | Safe YAML parsing (no anchors/aliases, no custom tags, size limit) |
| `csp.js` | Content Security Policy generation |

#### 5.2.4 HTTP & Routing

| Module | Role |
|--------|------|
| `http-helpers.js` | Session extraction, CORS, response helpers |
| `router.js` | Lightweight HTTP router for theta routes |
| `rate-limiter.js` | Request rate limiting |

#### 5.2.5 Feature & Inference

| Module | Role |
|--------|------|
| `feature-inference.js` | Infer lesson features from content/metadata |
| `runtimeManifest.js` | Factory manifest, feature inference decoupled from filenames |
| `archetype-match.js` | Pedagogical archetype coherence validation |

#### 5.2.6 Validation & Schema

| Module | Role |
|--------|------|
| `schema-validator.js` | Generic schema validation (Ajv) |
| `skill-dag-validate.js` | DAG validation for skill graph (cycle detection) |
| `threshold-syntax.js` | Re-export/validation for sensor expressions |
| `lesson-validator.js` | Lesson validation wrapper |

#### 5.2.7 Other Utilities

| Module | Role |
|--------|------|
| `logger.js` | Structured logging |
| `binary.js` | Base64, hex, binary utilities |
| `ensure-paths.js` | Data dir creation |
| `katex-css-builder.js` | KaTeX CSS splitting for per-lesson bundles |
| `feature-flags.js` | Feature flag evaluation |
| `streak.js` | Learning streak computation |

---

## 6. Subsystem 4: Browser Runtime

**Location:** `packages/agni-runtime/`

### 6.1 Purpose

Runs on edge devices (Android 7.0 Nougat, Chrome 51 WebView). **ES5 only** — no `let`/`const`, arrow functions, template literals, or `class`. Provides the lesson player, sensor bridge, SVG rendering, and telemetry.

### 6.2 Sub-subsystems

#### 6.2.1 Shared Runtime (`shared-runtime.js`)

- **Role:** Foundational module loaded first by every lesson.
- **Provides:**
  - Sensor pub/sub (`subscribeToSensor`, `unsubscribeFromSensor`, `clearSensorSubscriptions`)
  - Vibration patterns
  - Device capability detection
  - Visual spec renderer (delegates to SVG factory registry)
  - Lesson step visual mounting/teardown lifecycle
  - `base64ToBytes()` for integrity verification
- **Global:** `window.AGNI_SHARED`

#### 6.2.2 Player (`ui/player.js`)

- **Role:** Core state machine — step routing, sensor init, rendering.
- **Flow:** Load LESSON_DATA → verify integrity → init sensors → render steps → handle gate/quiz → send telemetry.
- **Delegations:**
  - `AGNI_INTEGRITY` — Ed25519 verification (integrity.js)
  - `AGNI_CHECKPOINT` — localStorage save/resume (checkpoint.js)
  - `AGNI_FRUSTRATION` — frustration detection + nudges (frustration.js)
  - `AGNI_COMPLETION` — completion screen (completion.js)
  - `AGNI_GATES` — gate quiz, manual verification (gate-renderer.js)
  - `AGNI_A11Y` — accessibility prefs (a11y.js)

#### 6.2.3 Sensors

| Module | Role |
|--------|------|
| `sensors/sensor-bridge.js` | Abstracts device sensors (accelerometer, etc.), permission handling |
| `sensors/threshold-evaluator.js` | Evaluates threshold expressions against sensor values |
| `sensors/sensorTypes.ts` | Type definitions for sensor IDs (TypeScript) |

#### 6.2.4 Rendering

| Module | Role |
|--------|------|
| `rendering/svg-stage.js` | Spec-driven SVG stage, RAF loop, sensor bindings |
| `rendering/svg-factories.js` | SVG factory registry and spec-to-SVG translation |
| `rendering/svg-factories-geometry.js` | Geometry factories (pendulum, etc.) |
| `rendering/svg-factories-dynamic.js` | Dynamic/interactive SVG factories |
| `rendering/svg-registry.js` | Factory registration |
| `rendering/svg-helpers.js` | Shared SVG utilities |
| `rendering/gate-renderer.js` | Gate quiz, manual verification UI |
| `rendering/math-renderer.js` | KaTeX math rendering |
| `rendering/table-renderer.js` | Table rendering |
| `ui/step-renderers.js` | Step-type-specific renderers |

#### 6.2.5 Integrity

| Module | Role |
|--------|------|
| `integrity/integrity.js` | Verifies Ed25519 signature, device binding (OLS_INTENDED_OWNER) |
| `integrity/binary-utils.js` | Binary decoding for verification |

#### 6.2.6 Telemetry

| Module | Role |
|--------|------|
| `telemetry/telemetry.js` | Event submission to hub |
| `telemetry/checkpoint.js` | Progress checkpointing |
| `telemetry/completion.js` | Completion event handling |

#### 6.2.7 Other UI

| Module | Role |
|--------|------|
| `ui/factory-loader.js` | Loads shared factories via fetch, verifies SRI |
| `ui/narration.js` | Screen reader / narration for accessibility |
| `ui/i18n.js` | Internationalization |
| `ui/a11y.js` | Accessibility preferences |
| `ui/export.js` | Export utilities |

#### 6.2.8 Engine (Client-Side)

| Module | Role |
|--------|------|
| `engine/edge-theta.js` | Client-side theta ordering (when hub unavailable) |
| `engine/navigator.js` | Lesson navigation, next-lesson selection |

#### 6.2.9 Shell & Polyfills

| Module | Role |
|--------|------|
| `shell/index.html` | Minimal shell for standalone player |
| `shell/library.js` | Library shell |
| `polyfills.js` | ES5 polyfills for older browsers |

---

## 7. Subsystem 5: LMS Engine

**Location:** `packages/agni-engine/`

### 7.1 Purpose

Adaptive learning engine that selects the best next lesson for a student from a theta-eligible candidate set. Uses Rasch IRT, embeddings, Thompson Sampling, Markov transitions, and PageRank.

### 7.2 Sub-subsystems

#### 7.2.1 Rasch (`rasch.js`)

- **Role:** 1PL IRT (Item Response Theory) via Newton-Raphson MAP.
- **Purpose:** Estimates student ability on logit scale from quiz (probe) outcomes.
- **Output:** Ability estimate and variance; used as gain proxy for embeddings and bandit.

#### 7.2.2 Embeddings (`embeddings.js`)

- **Role:** Online matrix factorization — student × lesson latent factors.
- **Features:** Forgetting decay, cold-start handling.
- **Output:** Student and lesson vectors for bandit feature input.

#### 7.2.3 Thompson Sampling (`thompson.js`)

- **Role:** Linear Thompson Sampling — samples from posterior over gain-given-features.
- **Purpose:** Balances exploration and exploitation when selecting next lesson.
- **Pure core:** `selectLesson(state, studentId)`; persistence at edge.

#### 7.2.4 Federation (`federation.js`)

- **Role:** Precision-weighted Bayesian merge of bandit posteriors across hubs.
- **Purpose:** Village hubs improve from collective data without sharing raw student data.
- **Mechanisms:** contentHash for dedup, hubId + exportSequence for sneakernet loop prevention.

#### 7.2.5 Markov (`markov.js`)

- **Role:** Tracks lesson-to-lesson transitions and quality (gain).
- **Purpose:** "Do students who take A then B tend to learn well?" — transition quality scoring.
- **Output:** Transition table for client-side navigator; dropout bottleneck detection.

#### 7.2.6 PageRank (`pagerank.js`)

- **Role:** Lesson importance in skill graph — "gateway" lessons that unlock many paths.
- **Purpose:** Quality-weighted PageRank for tie-breaking.
- **Output:** Flow bottleneck identification.

#### 7.2.7 Math (`math.js`)

- **Role:** Linear algebra (Cholesky, forward/back substitution, dot products, matrix-vector).
- **Purpose:** Bandit posterior sampling, numerical stability (Kahan summation, jitter for near-singular).

#### 7.2.8 Migrations (`migrations.js`)

- **Role:** Schema migrations for LMS state (embedding dim, bandit structure, etc.).
- **Purpose:** Repair corrupted or outdated state on load.

#### 7.2.9 SM2 (`sm2.js`)

- **Role:** Spaced repetition algorithm (optional).
- **Purpose:** Review scheduling.

#### 7.2.10 Engine Index (State Management)

- **State:** `lms_state.json` — rasch, embedding, bandit, markov.
- **Persistence:** Atomic write (`.tmp` → fsync → rename).
- **API:** `seedLessons`, `selectBestLesson`, `recordObservation`, `applyObservation`, `getStudentAbility`, `exportBanditSummary`, `mergeRemoteSummary`, `getStatus`, `exportTransitionTable`, `getStudentLessonHistory`, `getFlowBottlenecks`, `getDropoutBottlenecks`, `explainSelection`.

---

## 8. Subsystem 6: Governance

**Location:** `packages/agni-governance/`

### 8.1 Purpose

Policy-driven lesson compliance and cohort coverage reporting. Used by hub APIs and portal.

### 8.2 Sub-subsystems

#### 8.2.1 Policy (`policy.js`)

- **Role:** Load, save, validate governance policy.
- **Policy schema:** `schemas/governance-policy.schema.json`.
- **Content:** UTU targets, band requirements, approval rules.

#### 8.2.2 Catalog (`catalog.js`)

- **Role:** Load, save, update, import, validate approved lesson catalog.
- **Schema:** `schemas/approved-catalog.schema.json`.

#### 8.2.3 Evaluate Lesson Compliance (`evaluateLessonCompliance.js`)

- **Role:** Pure function — (sidecar, policy) → ComplianceResult.
- **Checks:** UTU targets, band alignment, skill coverage.
- **Exports:** `evaluateLessonCompliance`, `lessonPassesUtuTargets`.

#### 8.2.4 Aggregate Cohort Coverage (`aggregateCohortCoverage.js`)

- **Role:** Aggregates mastery across cohort for governance reporting.
- **Output:** Coverage percentages, stabilisation rates by UTU/band.

#### 8.2.5 Schema Store (`schema-store.js`)

- **Role:** Resolves paths to policy/catalog schemas.
- **Used by:** Validators.

---

## 9. Subsystem 7: Services Layer

**Location:** `packages/agni-services/`

### 9.1 Purpose

Top-down API that hub routes call. Abstracts accounts, authoring, governance, LMS, lesson-chain, and lesson assembly.

### 9.2 Sub-subsystems

#### 9.2.1 Accounts (`accounts.js`)

- **Role:** Creator and student account management.
- **Features:**
  - Creator: register, login, session, approval workflow
  - Student: create, PIN, transfer token, claim, verify-pin
  - Student sessions (agni_student_session cookie, 24h TTL)
  - Session IP binding (anti-theft)
- **Storage:** Flat JSON under DATA_DIR.
- **Config injection:** `createAccounts({ dataDir })`.

#### 9.2.2 Author (`author.js`)

- **Role:** Lesson authoring — list, load, save, delete, validate, preview.
- **Storage:** YAML files in yamlDir.
- **Integrations:** Compiler for preview, schema for validation.

#### 9.2.3 Governance (`governance.js`)

- **Role:** Wraps `@agni/governance` for hub routes.
- **API:** Policy, catalog, compliance, cohort coverage.

#### 9.2.4 LMS (`lms.js`)

- **Role:** Wraps `@agni/engine` for hub routes.
- **API:** select, observation, status, explain, federation merge, transitions, bottlenecks.

#### 9.2.5 Lesson Chain (`lesson-chain.js`)

- **Role:** Content hash chain for lessons — integrity verification, fork/license checks.
- **Endpoints:** GET chain, POST verify, GET fork-check.

#### 9.2.6 Lesson Assembly (`lesson-assembly.js`)

- **Role:** Assembles lesson script block (shared with compiler).
- **Responsibilities:** Device binding, signature injection, nonce, SRI.
- **Used by:** hub-transform, CLI builders.

#### 9.2.7 Compiler (`compiler.js`)

- **Role:** Wraps `@ols/compiler` for hub routes.
- **Used by:** Author preview, hub-transform.

#### 9.2.8 Lesson Schema (`lesson-schema.js`)

- **Role:** Schema loading for validation.
- **Used by:** Author, governance.

---

## 10. Subsystem 8: Village Hub

**Location:** `packages/agni-hub/`

### 10.1 Purpose

The edge server that runs on a Raspberry Pi. Compiles lessons on demand, serves theta/LMS/governance APIs, collects telemetry, and syncs with regional/home server.

### 10.2 Sub-subsystems

#### 10.2.1 Theta (`theta.js`)

- **Role:** Lesson ordering engine — prerequisite enforcement and MLC (Marginal Learning Cost) sorting.
- **Responsibilities:**
  - Skill graph (BFS with cycle guard)
  - Eligible lesson filtering (all requires mastered)
  - MLC heuristic: θ = BaseCost − CohortDiscount
  - Lesson index from IR sidecars (`rebuildLessonIndex`)
  - Graph weights (local, regional, cohort-specific)
- **API:** GET `/api/pathfinder`, `/api/pathfinder/all`, `/api/pathfinder/graph`, POST `/api/pathfinder/override`.
- **Pure core:** `computeLessonOrder`, `applyRecommendationOverride`.

#### 10.2.2 Hub-Transform (`hub-transform.js` + `hub-transform/`)

- **Role:** On-demand lesson delivery — YAML → IR → HTML at request time.
- **Sub-modules:**
  - `compile.js` — YAML load, IR compilation, in-flight guard
  - `cache.js` — Disk + memory cache, compile slot management, LRU
  - `assemble.js` — HTML assembly, PWA shell, device binding
  - `serve-assets.js` — Factory/KaTeX serving, whitelists
  - `route-handlers.js` — HTTP route matching
  - `factory-manifest.js` — Factory manifest for SRI
- **Features:** Compiled cache (disk + memory), concurrency cap, retry-after on overload.
- **API:** Serves `/lessons/:slug`, `/factories/`, `/katex/`.

#### 10.2.3 Sentry (`sentry.js`)

- **Role:** Telemetry ingestion and skill-graph weight analysis.
- **Flow:** Receives events → buffers → flushes to NDJSON → analyses → updates graph-weights.
- **Analysis:** Chi² for skill facilitation, Jaccard for clusters, contingency tables.
- **Output:** `graph-weights.json`, `graph-weights-pending.json` (human review), mastery-summary.
- **Config:** analyseAfter, analyseCron, retention, thresholds.
- **API:** POST `/api/telemetry`.

#### 10.2.4 Sync (`sync.js`)

- **Role:** Sync with home/regional server over Starlink, USB, or mesh.
- **Upload:** Anonymized learning events (re-pseudonymization with batch tokens).
- **Download:** Base costs, regional graph weights, curriculum, schedules.
- **Transports:** starlink (HTTPS), usb (file copy), mesh (future).
- **Safety:** usbPath restricted to `/mnt/usb` prefix.

#### 10.2.5 Mesh (`mesh/`)

- **Role:** P2P signaling for multiplayer (e.g., quiz sessions).
- **Sub-modules:**
  - `transports.js` — Transport abstraction
  - `chunked.js` — Chunked message handling
  - `merge.js` — Graph merge logic
  - `protocol.js` — Protocol definition
  - `peer-table.js` — Peer tracking
  - `lora-hal.js` — LoRa HAL (optional)
- **Constraint:** Mesh is for control plane (signaling), not data plane (lessons).

#### 10.2.6 Context (`context/`)

| Module | Role |
|--------|------|
| `config.js` | Hub-specific config |
| `data-paths.js` | Path resolution (dataDir, serveDir, etc.) |
| `data-access.js` | Async JSON load/save helpers |
| `auth.js` | Auth middleware, session validation |
| `http.js` | HTTP helpers |
| `services.js` | Service wiring (lms, governance, accounts, author) |

#### 10.2.7 Routes

| Route Module | Endpoints |
|--------------|-----------|
| `routes/theta.js` | Theta API |
| `routes/lms.js` | LMS API |
| `routes/telemetry.js` | Telemetry ingestion |
| `routes/accounts.js` | Accounts, auth |
| `routes/governance.js` | Governance API |
| `routes/author.js` | Author API |
| `routes/student.js` | Student-specific |
| `routes/parent.js` | Parent portal |
| `routes/groups.js` | Groups API |
| `routes/admin.js` | Admin config, sync-test |
| `routes/chain.js` | Lesson chain |
| `routes/lti.js` | LTI 1.1 (Moodle, Canvas) |

#### 10.2.8 PWA (`pwa/`)

- **Role:** Progressive Web App shell for lesson delivery.
- **Files:** `shell.html`, `library.html`, `shell-boot.js`, `precache.js`, `shared.js`.
- **Used by:** hub-transform when serving lessons.

#### 10.2.9 Service Worker (`sw.js`)

- **Role:** Caches shared assets (factories, KaTeX) on edge device.
- **Purpose:** Bandwidth savings — only lesson-specific HTML changes between lessons.

#### 10.2.10 GC & Shared

| Module | Role |
|--------|------|
| `gc-disk-lessons.js` | Prune orphan compiled lessons |
| `shared.js` | Shared context, cache, service refs |

---

## 11. Subsystem 9: CLI & Tooling

**Location:** `packages/agni-cli/`

### 11.1 Purpose

Command-line entry point for compile, validate, and hub operations.

### 11.2 Sub-subsystems

- **cli.js** — Single entry, delegates to:
  - Compile (input YAML → output HTML/native)
  - Validate (schema check)
  - Hub wizards (init, theta, sentry, sync)

**Hub-tools** (`hub-tools/`) — Wrappers that spawn package scripts:
- `theta.js` → `packages/agni-hub/theta.js`
- `sentry.js` → `packages/agni-hub/sentry.js`
- `sync.js` → `packages/agni-hub/sync.js`

---

## 12. Subsystem 10: Portal

**Location:** `portal/`

### 12.1 Purpose

Vanilla HTML/CSS/JS teacher and admin UI. No build step.

### 12.2 Sub-subsystems

- **Pages:** home, author, groups, settings, stub
- **Auth:** `js/auth.js` — session handling
- **API:** `js/api.js` — Hub API client
- **Router:** `js/router.js` — Client-side routing

---

## 13. Subsystem 11: Supporting Infrastructure

### 13.1 Scripts (`scripts/`)

- **Verification:** `check-*.js` for verify:core, verify:runtime, verify:hub, verify:services, verify:governance
- **CI:** `verify:all` runs full guard suite
- **Deployment:** `check-hub-config-bootstrap`, `check-hub-config-pi`, `check-skill-dag`
- **Sneakernet:** `sneakernet.js` — export/import LMS state, signed packets

### 13.2 Tests (`tests/`)

- **Unit:** `tests/unit/*.test.js`
- **Integration:** `tests/integration/*.test.js`
- **Contract:** API contract tests (no live server)
- **Graph:** Skill graph verification
- **E2E:** Playwright browser tests

### 13.3 Types (`packages/types/`)

- Shared TypeScript/JSDoc types (`index.d.ts`).
- Used by services, engine, hub for type safety.

---

## 14. Data Flow Summary

```
YAML (source)
    ↓
@ols/compiler (parse, validate, buildIR, buildArtifact)
    ↓
HTML + lesson-ir.json (or native / yaml-packet)
    ↓
hub-transform (on-demand) or CLI (static)
    ↓
Edge device (browser)
    ↓
@agni/runtime (player, sensors, rendering)
    ↓
Telemetry → Sentry
    ↓
Sentry → graph-weights
    ↓
Theta (skill graph + MLC) + LMS (bandit selection)
    ↓
Ordered lessons for student
```

---

## 15. Pure Core vs Edges (Reference Boundaries)

**Pure core (no I/O, testable in isolation):**

- Compiler: `parseLessonFromString`, `validateLessonData`, `buildLessonIR`, `runCompilePipeline(rawYaml)`
- Governance: `validatePolicy`, `evaluateLessonCompliance`
- Theta: `computeLessonOrder`, `applyRecommendationOverride`
- LMS: `applyObservation(state, observation)`, `mergeBanditSummaries(local, remote)`

**Edges (I/O, persistence, HTTP):**

- CLI, hub-transform (file read/write)
- Theta HTTP server, route handlers
- LMS `recordObservation` (load → apply → save)
- Accounts, author (file storage)
- Sentry (event flush, analysis write)
- Sync (network, USB)

---

## 16. Dependency Flow

```
@agni/utils (leaf)
    ↑
@ols/schema, @agni/engine, @agni/governance
    ↑
@ols/compiler
    ↑
@agni/services (wraps engine, governance, compiler, accounts, author)
    ↑
@agni/hub (theta, sentry, sync, hub-transform, routes)
    ↑
@agni/cli
```

`@agni/runtime` is browser-only and has no Node deps.

---

*Document version: 1.0 — generated from AGNI codebase analysis*
