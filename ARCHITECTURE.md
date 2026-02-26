## AGNI / OLS Architecture (Implementation Overview)

**Where is the truth?** The **canonical architecture reference** is **`docs/ARCHITECTURE.md`** (conceptual design, phase roadmap, security/governance). This file is the **implementation overview** (directory layout, build pipeline, hub/engine wiring) and is kept at the repo root for visibility. Keep both in sync on key decisions; when in doubt, refer to `docs/ARCHITECTURE.md`.

---

## 1. High-Level Structure

- **Root package (`agni-core`)**
  - Node-based compiler and CLI for the Open Lesson Standard (OLS).
  - Builds lesson artifacts from YAML into HTML and native bundle formats.
  - Contains the browser runtime for executing lessons on devices.
- **Hub server & tools**
  - HTTP hub-transform for PWA-style delivery from YAML sources.
  - Adaptive graph and theta engine tooling for lesson scheduling.
- **LMS engine**
  - Rasch-based ability estimation, embeddings, and Thompson-sampling bandit for adaptive selection.
- **Portal (SvelteKit)**
  - Teacher-facing hub UI (currently mock-backed) for governance, class overview, and overrides.
- **Docs & infra**
  - Conceptual architecture and roadmap.
  - CI, Docker, and build tooling.

### 1.1 Directory Layout (Simplified)

```text
AGNI/
├── src/
│   ├── cli.js                # CLI entrypoint (bin: "agni")
│   ├── config.js             # Markdown/unified pipeline
│   ├── compiler/
│   │   └── buildLessonIR.js  # Canonical IR builder
│   ├── builders/
│   │   ├── html.js           # HTML + sidecar builder
│   │   └── native.js         # Native bundle builder
│   ├── utils/
│   │   ├── featureInference.js
│   │   ├── crypto.js
│   │   ├── io.js
│   │   ├── katex-css-builder.js
│   │   └── csp.js
│   ├── runtime/              # Browser runtime (player and factories)
│   │   ├── player.js
│   │   ├── shared-runtime.js
│   │   ├── sensor-bridge.js
│   │   ├── svg-stage.js
│   │   ├── svg-factories*.js
│   │   ├── svg-registry.js
│   │   └── table-renderer.js
│   ├── engine/               # LMS engine
│   │   ├── index.ts
│   │   ├── rasch.js
│   │   ├── embeddings.js
│   │   ├── thompson.js
│   │   ├── federation.js
│   │   └── math.js
│   ├── services/             # Top-down service layer
│   │   ├── index.js
│   │   ├── compiler.js
│   │   ├── lms.js
│   │   ├── governance.js
│   │   └── lessonAssembly.js # Shared lesson script block (CLI + hub-transform)
│   ├── governance/           # Policy-driven compliance and cohort coverage
│   │   ├── index.js
│   │   ├── policy.js
│   │   ├── evaluateLessonCompliance.js
│   │   └── aggregateCohortCoverage.js
│   ├── types/
│   │   └── index.d.ts        # IR, sidecar, LMSState types
│   └── ...
├── server/
│   ├── hub-transform.js      # YAML → PWA transform
│   ├── pwa/                  # PWA shell assets
│   ├── manifest.json
│   └── sw.js
├── hub-tools/
│   ├── theta.js              # Lesson graph and eligibility
│   ├── sentry.js             # Skill collapse / graph weights
│   └── sync.js               # Federated sync helpers
├── portal/                   # SvelteKit teacher portal
├── lessons/                  # Example lesson YAMLs
├── schemas/                  # JSON Schemas for OLS/IR
├── fixtures/                 # Sample graph and LMS data
├── docs/                     # Conceptual reference (incl. docs/ARCHITECTURE.md)
└── package.json
```

---

## 2. Main Modules and Components

### 2.1 CLI and Compilation Pipeline (`src/cli.js` + `src/compiler` + `src/builders`)

- **Responsibility**
  - Command-line entrypoint (bin `agni`) for compiling OLS YAML source files.
  - Orchestrates reading YAML, schema validation, feature inference, IR construction, and output via specific builders.
- **Key flows**
  - Parses CLI args (input YAML, format, output path/dir, flags).
  - **Phase 2 / Sprint K:** All paths (CLI, hub-transform, author API) validate with the **same** OLS schema and threshold rules via `src/services/lessonSchema.js` before any build; invalid data fails fast. Pure pipeline entry: `runCompilePipeline(rawYaml)` (parse → validate → buildIR → sidecar); I/O at the edges.
  - Loads YAML (via `js-yaml` and filesystem utilities).
  - Optionally runs feature inference (`utils/featureInference.js`).
  - Calls `compiler/buildLessonIR.js` to construct the canonical **Intermediate Representation (IR)**.
  - Dispatches to either:
    - `builders/html.js` → single-page HTML + `lesson-ir.json` sidecar.
    - `builders/native.js` → `lesson.json` + `content/*.md` for thin native clients.

### 2.2 IR Layer (`src/compiler/buildLessonIR.js`)

- **Responsibility**
  - Provides a single, canonical IR for all downstream builders and engines.
  - Normalizes YAML schema into a machine-oriented representation:
    - Pre-rendered HTML content for steps (via `config.processMarkdown`).
    - `inferredFeatures` (sensor usage, difficulty, Bloom ceiling, VARK counts, KaTeX assets, SVG factory manifest, etc.).
    - Normalized `ontology` (`requires` / `provides`).
    - Compiler stamps (`_compiledAt`, `_schemaVersion`, `_devMode`, `metadata_source`).
- **Outputs**
  - Returns the IR object.
  - Writes a `lesson-ir.json` **sidecar** which is consumed by the theta and LMS engines for indexing and scheduling.

### 2.3 Builders (`src/builders/html.js` and `src/builders/native.js`)

- **HTML builder (`html.js`)**
  - Converts IR into a standalone HTML lesson artifact.
  - Writes:
    - The HTML file (embedding `window.LESSON_DATA` and runtime loader script).
    - `lesson-ir.json` sidecar (via the compiler/IR layer).
    - Shared runtime assets (`shared-runtime.js`) into the output directory.
    - Required KaTeX CSS subsets via `katex-css-builder`.
  - Injects global integrity and identity fields:
    - `window.OLS_SIGNATURE`, `window.OLS_PUBLIC_KEY`, `window.OLS_INTENDED_OWNER`.
  - Wires up runtime dependencies by embedding a loader that reads `ir.requires.factories` and loads `AGNI` runtime modules in the expected order.

- **Native builder (`native.js`)**
  - Emits a **native bundle** format:
    - `lesson.json` manifest describing steps and metadata.
    - Individual `content/*.md` files for step content.
  - Designed for a future thin native runtime (e.g., Android app) that performs its own rendering and sensor orchestration.
  - Reuses only a minimal subset of the markdown pipeline; most logic is filesystem layout and manifest generation.

### 2.4 Markdown Configuration (`src/config.js`)

- **Responsibility**
  - Defines a lazily initialized, shared **unified / remark / rehype** pipeline.
  - Handles Markdown parsing plus math:
    - `remark-parse`, `remark-math`, `remark-html` / `remark-rehype`, `rehype-katex`, and HTML serialization.
  - Ensures:
    - Math is turned into KaTeX HTML at build time (no runtime parsing).
    - `buildLessonIR` can assume a stable API (`processMarkdown`) for transforming raw markdown into HTML fragments.

### 2.5 Utilities (`src/utils`)

- **`featureInference.js`**
  - Analyzes both YAML and IR to derive:
    - Boolean flags (uses sensors, uses vibration, uses tables, etc.).
    - Content classification (difficulty, Bloom ceiling, VARK profile, teaching style).
    - SVG factory manifest: a structured list of runtime modules to load.
    - KaTeX asset manifest: which symbol subsets are required.
  - Exposes:
    - `FACTORY_LOAD_ORDER` and `FACTORY_FILE_MAP`: how feature flags map to concrete runtime JS assets.
    - Helpers to produce the `ir.requires.factories` list that builders and `hub-transform` rely on.

- **`crypto.js`**
  - Implements content signing primitives:
    - Computes a **binding hash** over `JSON.stringify(lessonIR) + NUL + deviceId`.
    - Signs with Ed25519 and exposes helpers for embedding signature/public key into outputs.
  - Defines the **contract** that the runtime verification must match.

- **`io.js`**
  - Thin filesystem abstraction used by CLI and builders:
    - Safe read/write functions.
    - `ensureDir` semantics for output directories.
  - Centralizes error handling around missing paths and directory creation.

- **`katex-css-builder.js`**
  - Takes inferred KaTeX usage and emits **split CSS bundles** tailored to each lesson or hub-level cache.
  - Allows devices to cache only the math fonts and styles actually used by a cohort’s lessons.

- **`csp.js`**
  - Used primarily by `hub-transform` to generate Content Security Policy:
    - Builds CSP `<meta>` or `Header` strings with appropriate nonces.
    - Ensures inline runtime script blocks remain executable while keeping the shell locked down.

### 2.6 Runtime (`src/runtime/*`)

- **`shared-runtime.js`**
  - Global runtime backbone exposed as `window.AGNI_SHARED`:
    - Pub/sub event system for sensors and visuals.
    - Device capability detection.
    - Vibration patterns and haptic utilities.
    - Visual lifecycle primitives (`mountStepVisual`, `destroyStepVisual`).
    - Module registry for runtime factories (loaded via manifest).

- **`sensor-bridge.js`**
  - Normalizes access to motion/orientation sensors and optional Phyphox integration.
  - Publishes sensor readings into the shared runtime event system.
  - Offers dev utilities for simulated sensor data in non-hardware environments.

- **Visual stack (`svg-stage.js`, `svg-factories*.js`, `svg-registry.js`, `table-renderer.js`)**
  - `svg-stage.js`:
    - Translates a declarative `spec` object into a live SVG scene.
    - Integrates with the sensor bridge for dynamic, sensor-driven visuals.
  - `svg-factories*.js`:
    - Implement specific SVG-based visuals (e.g., pendulum, number lines, vector diagrams).
  - `svg-registry.js`:
    - Runtime registry mapping factory IDs to implementation modules.
  - `table-renderer.js`:
    - Renders lesson tables based on IR and inferred features.

- **`player.js` (lesson player)**
  - Core execution state machine:
    - Bootstraps after all runtime factories are loaded.
    - Reads `window.LESSON_DATA` (IR) and integrity globals.
    - Performs (or will perform) integrity verification against `OLS_SIGNATURE`.
    - Manages step navigation, gate evaluation, and sensor lifecycle.
  - Exposes simple navigation/control globals:
    - `window.OLS_NEXT` and `window.OLS_ROUTE` for higher-level shells or tools.

### 2.7 LMS Engine (`src/engine/*`)

- **Build:** The engine entry is TypeScript (`index.ts`). Run **`npm run build:engine`** to compile it to `src/engine/index.js` so that theta, the LMS service, and sneakernet can load it in a clean clone. See `tsconfig.engine.json` and README "Running the portal against the hub."
- **`engine/index.ts`**
  - Public API for the LMS engine:
    - `buildDefaultState`, `loadState`, `saveState`.
    - `seedLessons` (registers probes and lesson features).
    - `selectBestLesson` (chooses next lesson among candidates).
    - `recordObservation` (updates ability, embeddings, and bandit after outcomes).
    - `exportBanditSummary` / `mergeRemoteSummary` (federated aggregation).
  - **Sneakernet (Backlog):** `scripts/sneakernet.js` exports bandit summary as gzip+base64 (`npm run sneakernet -- export [--out file]`) and imports/merges from file or stdin (`import [--in file]`). Requires LMS engine available (e.g. hub context).
  - Operates over a persisted `LMSState` that encodes Rasch, embedding, and bandit state.

- **`rasch.js`**
  - Implements a 1PL Rasch model:
    - Maintains per-student ability estimates on a logit scale.
    - Updates ability based on responses (correct/incorrect, difficulty).
    - Provides a gain proxy for the bandit.

- **`embeddings.js`**
  - Online matrix factorization for student × lesson features:
    - Maintains latent vectors.
    - Uses a learning rate and forgetting factor.
    - Integrates with `inferredFeatures` from the IR sidecar.

- **`thompson.js`**
  - Linear Thompson sampling bandit:
    - Maintains posterior over parameters via matrices `A` (precision) and `b` (weighted rewards).
    - Samples parameter vectors to choose the next lesson with highest sampled gain.
    - Enforces invariant `featureDim === 2 * embeddingDim`.

- **`federation.js` and `math.js`**
  - Linear algebra helpers for bandit and embedding updates.
  - Federated merge logic for bandit summaries:
    - Combines bandit posteriors across hubs without exposing raw student data.

- **`types.js`**
  - Defines JSDoc / TS types for `LMSState` and related structures.
  - Acts as a contract between the engine, hub-tools, and any consumers.

### 2.8 Hub Server (`server/*`)

- **`hub-transform.js`**
  - HTTP-layer orchestration entrypoint:
    - Can attach to an existing `http.Server` (e.g. Express) or run standalone.
    - On request (e.g., `/lessons/:slug`), loads YAML, runs the compiler and IR builder, and wraps output in a PWA shell.
  - Responsibilities:
    - Caching compiled lessons with LRU or similar strategies.
    - Serving factories and KaTeX CSS subsets through whitelisted endpoints.
    - Injecting CSP and nonces for inline scripts.

- **PWA assets (`server/pwa/*`, `server/manifest.json`, `server/sw.js`)**
  - PWA shell HTML for hosting the lesson runtime.
  - Service worker for caching shared runtime assets and lesson artifacts.
  - Manifest describing icons, start URL, and offline behavior.

### 2.9 Hub Tools (`hub-tools/*`)

- **`theta.js`**
  - Builds and maintains the **lesson graph**:
    - Ingests `lesson-ir.json` sidecars.
    - Enforces `ontology.requires`/`provides` prerequisite relationships.
    - Filters eligible lessons for a student based on mastered skills.
  - **Phase 2 / Sprint M:** Pure ordering function **`computeLessonOrder(lessonIndex, skillGraph, baseCosts, graphWeights, masterySummary, pseudoId, scheduledSkills)`** returns sorted lesson list; no I/O. `getLessonsSortedByTheta(pseudoId)` loads from disk and calls it.
  - Provides an API to query for eligible lessons and pass candidate sets to the LMS engine.
  - **Governance routes (Phase 7):** `GET /api/governance/report`, `GET /api/governance/policy`, `POST /api/governance/compliance`; uses `src/services/governance` for cohort coverage and lesson compliance. **Phase 2 / Sprint L:** Policy files are validated against `schemas/governance-policy.schema.json` on load; compliance remains a pure function `(policy, sidecar) → result`.
- **Phase 3 / Sprint G:** **Teacher override:** `POST /api/theta/override` with `{ pseudoId, lessonId }` (or `lessonId: null` to clear). Pure `applyRecommendationOverride(orderedLessons, overrideLessonId)`; overrides stored in `data/recommendation_overrides.json`. GET /api/theta returns `lessons` with override applied and optional `override` field.

- **`sentry.js` and `sync.js`**
  - `sentry.js`:
    - Receives anonymized lesson-completion events via `POST /api/telemetry`; writes NDJSON to `data/events/`.
    - Runs incremental analysis: updates contingency tables and mastery, discovers a cohort (Jaccard clustering), computes skill-to-skill transfer weights (chi-square, benefit), and writes **`data/graph_weights.json`** (schema-compliant).
  - **Sentry → theta:** Theta reads `graph_weights.json` via `getEffectiveGraphWeights()` and uses it in `getResidualCostFactor()` / `computeLessonTheta()` to order lessons by Marginal Learning Cost (transfer benefit when prior skills are mastered). See **`docs/playbooks/sentry.md`** for the full flow.
  - `sync.js`:
    - Handles federation of bandit summaries and graph updates across hubs.
    - Can write regional `graph_weights_regional.json`; theta falls back to it when local graph has insufficient data.

### 2.10 Portal (`portal/*`)

- **SvelteKit teacher portal**
  - Separate app (SvelteKit + Vite + PWA plugin) located under `portal/`.
  - Provides:
    - Class and cohort overview.
    - Heterogeneity and progress views.
    - Recommendation overrides and governance-style milestones.
  - **API client:** `portal/src/lib/api.ts` is the typed Hub API client. It exposes `createHubApi(baseUrl)` and methods for theta, LMS, lesson sidecar, and governance (report, policy, compliance). Set `VITE_HUB_URL` to the hub origin to use real APIs; when unset, the UI can continue to use mock data.
  - **Shallow UI boundary:** The portal and future WYSIWYG builder should consume only the hub HTTP API and the types in `api.ts` / `docs/api-contract.md`. No direct imports of engine, compiler, or governance internals. This keeps UI work decoupled and within a small, stable contract.
  - Currently backed by **mock data**:
    - `portal/src/lib/mockData.ts` and local stores.
    - Teacher actions log to the console rather than hitting real APIs.
  - Governance endpoints are implemented on theta (`/api/governance/report`, `/api/governance/policy`, `/api/governance/compliance`); the portal can call them when `VITE_HUB_URL` is set.

---

## 3. Data Flows

### 3.1 Lesson Compilation (CLI Path)

1. **Input**: Operator runs `agni` (via `npm run build` or direct CLI) against an OLS YAML file.
2. **Parsing & validation**:
   - `src/cli.js` parses CLI options.
   - YAML is read via `js-yaml` and validated against schemas where configured.
3. **Feature inference & IR**:
   - `utils/featureInference.js` inspects lesson metadata and content.
   - `compiler/buildLessonIR.js` builds IR, runs `config.processMarkdown`, attaches `inferredFeatures`, and writes `lesson-ir.json`.
4. **Output**:
   - `builders/html.js` → HTML + sidecar + shared runtime + KaTeX CSS.
   - `builders/native.js` → native bundle (`lesson.json` + `content/*.md`).

### 3.2 On-Demand Hub Transform (Server Path)

1. **Request**: Device or browser requests a lesson (e.g., `/lessons/:slug`).
2. **Load & compile**:
   - `server/hub-transform.js` locates YAML, runs the same IR pipeline, and builds an HTML-based PWA bundle.
3. **Shell assembly**:
   - Inserts runtime loader, CSP nonces, PWA manifest links, and service worker registration.
4. **Delivery & caching**:
   - First request caches shared runtime assets and KaTeX CSS via service worker.
   - Subsequent lessons only fetch minimal HTML/IR deltas.

### 3.3 Runtime Execution (Device)

1. **Bootstrapping**:
   - Browser loads lesson HTML.
   - `factory-loader` (inline or external) reads `LESSON_DATA.requires.factories` and loads:
     - `shared-runtime.js`.
     - Sensor bridge.
     - SVG stage and factories.
     - Registry and table renderer.
2. **Integrity (current & future)**:
   - `player.js` reads `window.OLS_SIGNATURE`, `window.OLS_PUBLIC_KEY`, `window.OLS_INTENDED_OWNER`.
   - Intended to recompute binding hash over IR and device ID and verify Ed25519 signature.
3. **Execution**:
   - `player.js` initializes sensors via `AGNI_SHARED`.
   - Renders steps using IR and inferred features.
   - Exposes `OLS_NEXT` / `OLS_ROUTE` to host shell or automated tools.

### 3.4 Adaptive Scheduling (Theta + LMS Engine)

1. **Indexing**:
   - Compiler emits `lesson-ir.json` sidecars alongside artifacts.
   - `hub-tools/theta.js` ingests sidecars to build a lesson index and skill graph.
2. **Eligibility**:
   - For a given student, theta:
     - Consults ontology graph.
     - Filters lessons whose `requires` skills are mastered.
3. **Selection**:
   - Theta passes eligible lesson IDs and feature vectors to the LMS engine.
   - `engine/index.ts`:
     - Uses Rasch (`rasch.js`) to update ability.
     - Uses embeddings (`embeddings.js`) to maintain latent factors.
     - Uses bandit (`thompson.js`) to select the lesson maximizing sampled expected gain.
4. **Observation & update**:
   - After a lesson is completed, `recordObservation` updates state.
   - State persisted as JSON and may be exported/merged via `federation.js` and `hub-tools/sync.js`.

### 3.5 Governance and Portal

1. **Schema & IR**:
   - Governance-related fields (e.g., UTUs) live in YAML `meta` and are intended to be passed through into IR and sidecars.
2. **Reporting**:
   - Hub tools index lessons by UTU and ontology.
   - Future APIs will expose aggregates suitable for governance dashboards.
3. **Portal consumption**:
   - Portal can fetch class and governance metrics from hub APIs (GET /api/governance/report, GET /api/governance/policy, POST /api/governance/compliance) when `VITE_HUB_URL` is set; otherwise the UI uses mock data.
   - Teachers can override recommendations, whose effects are modeled via changes in lesson eligibility or bandit priors.

---

## 4. Key Invariants and Contracts

- **IR schema stability**
  - `buildLessonIR` defines the canonical shape of lesson IR and sidecar.
  - Downstream components (builders, hub-tools, LMS engine, portal) **must treat this as stable API**:
    - `steps[].htmlContent`.
    - `inferredFeatures` (including `factoryManifest`, `katexAssets`, `difficulty`, `bloom_ceiling`, etc.).
    - `ontology.requires` / `ontology.provides`.

- **Runtime asset manifest**
  - `featureInference` and `FACTORY_FILE_MAP` map feature flags and lesson patterns to concrete runtime JS filenames.
  - Builders and `hub-transform` rely on `ir.requires.factories` to know which assets must be bundled or served.
  - The **semantic contract** is that changing runtime module names or load order requires a corresponding update to feature inference and hub/CLI loaders.

- **Signing and binding**
  - The signing model (hub-side) and verification model (client-side) both use:
    - `bindingHash = SHA-256(JSON.stringify(lessonIR) + NUL + deviceId)`.
  - Any change to:
    - IR serialization ordering.
    - Device ID normalization.
    - Hash algorithm.
    - Signature encoding.
  - must be done in lockstep across `utils/crypto.js`, `builders/html.js`, `server/hub-transform.js`, and `runtime/player.js`.

- **LMS engine dimensionality**
  - `thompson.ensureBanditInitialized` enforces:
    - `featureDim === 2 * embeddingDim`.
    - `A` is a square SPD matrix of size `featureDim × featureDim`.
  - Any change to embedding dimensionality, feature vector construction, or bandit shape must respect this invariant or implement a migration to avoid corrupting saved state.

- **Global runtime protocol**
  - The browser runtime uses global symbols:
    - Inputs: `window.LESSON_DATA`, `window.OLS_SIGNATURE`, `window.OLS_PUBLIC_KEY`, `window.OLS_INTENDED_OWNER`.
    - Runtime backbone: `window.AGNI_SHARED`, `window.AGNI_LOADER`.
    - Control: `window.OLS_NEXT`, `window.OLS_ROUTE`.
  - Runtime modules **must** register themselves via `AGNI_SHARED` and be loadable via the manifest emitted by feature inference.

---

## 4.1 Compatibility (runtime and hardware)

- **Declared baseline:** **Android 6.0+** and **ES5 in the runtime** (player, factory-loader, shared-runtime, threshold-evaluator). This is the single supported target; older devices (e.g. Android 4.0+) are best-effort only (codebase avoids `Map`/`Set` in hot paths and uses ES5-friendly patterns where possible).
- **Runtime:** `src/runtime/` uses no `async`/`await` in critical paths and no ES2015+ syntax in the player or threshold-evaluator. KaTeX and SVG factories may require a capable engine.
- **Checklist:** Run `npm run validate` (schema + threshold syntax). For runtime compatibility, avoid introducing `Map`/`Set` in player.js, shared-runtime.js, factory-loader.js, or threshold-evaluator.js hot paths; prefer ES5 patterns there.
- **Validation:** `npm run validate` runs schema validation and **threshold syntax** checks (e.g. `freefall > 0.2s`, `accel.total > 2.5g`) for `hardware_trigger` steps via `src/utils/threshold-syntax.js`.

---

## 5. Refactoring Recommendations for Modular, Top-Down Design

The following steps would make the codebase more modular, reduce duplication, and reinforce a top-down architecture.

### 5.1 Extract a Shared “Lesson Assembly” Service — **Implemented (Phase 7)**

- **Problem**
  - HTML and PWA assembly logic was duplicated across `src/builders/html.js` and `server/hub-transform.js`, risking divergence in integrity globals and runtime bootstrap.
- **Implemented**
  - `src/services/lessonAssembly.js` provides `buildLessonScript(ir, options)` which builds the single inline script block (factory-loader, LESSON_DATA, OLS_SIGNATURE/OLS_PUBLIC_KEY/OLS_INTENDED_OWNER, player, load safety net). Both the CLI HTML builder and `hub-transform` call it with pre-read runtime files; I/O stays in the callers. Shell HTML (doctype, head, body) remains in each caller so PWA-specific concerns (CSP, nonce, manifest) stay in hub-transform.

### 5.2 Formalize IR and Runtime Types in TypeScript

- **Implemented (Backlog):** `src/types/index.d.ts` defines `LessonIR`, `InferredFeatures`, `FactoryManifestEntry`, `LessonRequires`, and LMS/governance types; engine modules have `.d.ts` shims; `npm run typecheck` enforces.
- **Problem**
  - IR shape, feature inference output, and runtime manifest are tracked primarily via JSDoc and convention.
  - Runtime loaders and hub tools operate with stringly typed contracts.
- **Recommendation**
  - Introduce shared TypeScript definitions (in `src/types/`) for:
    - `LessonIR`.
    - `InferredFeatures`.
    - `FactoryManifestEntry`.
    - `LessonSidecar`.
  - Gradually migrate key modules (`buildLessonIR`, feature inference, engine entrypoints) to TypeScript or at least provide `.d.ts` files, enabling static checking between compiler, server, engine, and portal.

### 5.3 Decouple Feature Inference from Concrete Runtime Filenames

- **Implemented (Backlog):** `src/utils/runtimeManifest.js` maps capabilities to filenames and load order; `featureInference.js` calls `getOrderedFactoryFiles()` and `getFileForFactoryId()` so inference outputs capabilities only.
- **Problem**
  - `featureInference.js` knows both **what** the lesson does and **how** that maps to concrete runtime asset filenames and load order.
- **Recommendation**
  - Split responsibilities:
    - `featureInference`:
      - Produces high-level capabilities (e.g., `needsSensors`, `visualFactories: ["pendulum", "vectorField"]`).
    - `runtimeManifest` module:
      - Maps capabilities to concrete files and load order.
  - This makes it easier to:
    - Swap or re-organize runtime files.
    - Introduce new build targets without rewriting inference heuristics.

### 5.4 Consolidate Binary and Base64 Utilities

- **Implemented (Backlog):** `src/utils/binary.js` (Node) and `src/runtime/binary-utils.js` (browser) centralize base64/bytes and concatBytes; shared-runtime and player use them; html/hub prepend binary-utils and list it in factory deps.
- **Problem**
  - Functions like `base64ToBytes` and other binary helpers are duplicated across runtime modules and shared utilities.
- **Recommendation**
  - Create a single `src/runtime/binary-utils.js` (or a shared `src/utils/binary.js`) and import it wherever needed.
  - Centralize:
    - Base64 ↔ bytes conversion.
    - UTF-8 encoding/decoding.
  - Reduces bundle size and risk of subtle mismatches in encoding logic.

### 5.5 Harden LMS Engine with Full Type Coverage

- **Partially implemented (Backlog):** Strict `.d.ts` files added for `math`, `rasch`, `embeddings`, `thompson`, `federation` in `src/engine/*.d.ts`; full conversion to `.ts` remains optional.
- **Problem**
  - `engine/index.ts` is TypeScript, but numerical modules are plain JS.
  - Critical invariants (dimensions, shapes) are enforced manually.
- **Recommendation**
  - Convert numerical modules (`rasch.js`, `embeddings.js`, `thompson.js`, `federation.js`, `math.js`) to TypeScript.
  - Ensure:
    - Matrix/vector shapes are modeled explicitly.
    - State persistence and migration paths are type-safe.
  - This will improve maintainability and allow safer new features in theta/hub-tools.

### 5.6 Introduce a Lightweight Migration / Repair Layer for LMS State

- **Implemented (Backlog):** `src/engine/migrations.js` provides `migrateLMSState(raw, opts)` and `looksLikeLMSState(raw)`; `loadState()` in the engine runs migration and saves repaired state; CLI supports `node src/cli.js lms-repair`.
- **Problem**
  - If `LMSState` on disk becomes inconsistent (e.g., due to changed dimensions), the operational remedy is effectively “delete the file.”
- **Recommendation**
  - Implement a small `engine/migrations.ts` that:
    - Detects known older schemas and reshapes them.
    - Adds jitter or safe defaults where statistically reasonable.
    - Only hard-fails on truly unrecoverable state.
  - Expose an explicit “repair” command through the CLI or admin tools.

### 5.7 Clarify and Implement Governance / UTU Path End-to-End

- **Problem**
  - `docs/ARCHITECTURE.md` describes UTUs and governance flows, but IR/schema/threading is partial or draft.
- **Recommendation**
  - Treat UTU and governance as first-class fields:
    - Extend JSON schemas for OLS YAML and IR.
    - Thread `meta.utu` through `buildLessonIR` and feature inference.
    - Index UTUs in `hub-tools/theta.js` for reporting queries.
    - Define minimal, well-documented hub APIs that the portal can consume.

### 5.8 Portal–Engine Boundary via API Client Layer

- **Problem**
  - The portal is currently mock-based, so there is no enforced boundary with real hub/engine APIs.
- **Recommendation**
  - Define a small TypeScript client in the portal:
    - `/api/classes`, `/api/students`, `/api/recommendations`, `/api/overrides`, `/api/governance`.
  - Stub these against Express or `hub-transform` endpoints, then progressively connect to real logic.
  - Keep the portal strictly UI + API client; avoid embedding any scheduling or governance logic there.

### 5.9 Move Toward a Top-Down “Services” Layer

- **Problem**
  - CLI, hub-transform, hub-tools, and external consumers all interact with low-level modules directly.
- **Recommendation**
  - Introduce a **services layer** (e.g., `src/services/`) encapsulating:
    - `compileLessonFromYaml(path, options)`.
    - `getLessonIndexFromSidecars(dir)`.
    - `selectNextLessonForStudent(state, candidateIds, options)`.
  - This gives the codebase clearer top-down entrypoints and lets callers stay small and declarative.

---

## 6. Architecture Evaluation and Critique

A goal-oriented evaluation of this architecture—strengths, gaps, and recommendations—is in **`docs/ARCHITECTURE-EVALUATION.md`**. It covers alignment with stated goals (standard, offline, θ/Skill Collapse, trust, epistemic pluralism, ecosystem), documentation drift, trust/verification, and suggested next steps.

---

## 7. How to Evolve This Document

- **Source of truth**
  - Continue using `docs/ARCHITECTURE.md` for **conceptual** design and roadmap.
  - Keep this `ARCHITECTURE.md` focused on **implementation reality**:
    - Directory layout.
    - Data flows.
    - Contracts and invariants.
- **API contract**
  - Hub HTTP endpoints and request/response shapes are specified in **`docs/api-contract.md`**. When adding or changing hub routes, update that document and the typed client in `portal/src/lib/api.ts`.
- **Architecture evaluation**
  - **`docs/ARCHITECTURE-EVALUATION.md`** — Evaluates the architecture against project goals; use it for planning and onboarding.
- **Reference implementation vision (future)**
  - **`docs/REFERENCE-IMPLEMENTATION-VISION.md`** — Describes a future direction: schema-based, possibly functional refactor so AGNI can serve as a true reference implementation of OLS. For use when planning larger refactors or onboarding.
- **Playbooks and conventions**
  - **`docs/playbooks/`** — Short "how to modify X" guides: `compiler.md`, `runtime.md`, `lms.md`, `governance.md`, **`federation.md`** (sync and graph_weights deployment), **`schema-to-types.md`** (optional codegen). Use them to find the right files and avoid breaking contracts.
  - **`docs/CONVENTIONS.md`** — LLM-friendly coding rules: small pure functions, public API via index, header comments, JSDoc, types in `src/types`, and running `npm run lint`, `npm run format:check`, `npm run typecheck` as guardrails.
- **Maintenance**
  - When adding new modules or changing data flows:
    - Update the relevant section here in the same PR.
    - Add or update types/schemas where applicable.
  - Consider adding a brief “Changelog” section if architecture changes become frequent.

