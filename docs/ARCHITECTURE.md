# 🏗️ Open Lesson Standard (OLS): System Architecture v2.3
> **Draft status:** Updated from v2.2 to reflect Phase 3 completion.
> Sections marked `[DRAFT NOTE]` are changes that need editorial review before finalising.

---

## 1. High-Level Overview

The Open Lesson Standard (OLS) is a decentralized, offline-first protocol for interactive
education on resource-constrained hardware.

The system follows a "Source-to-Artifact" philosophy. We do not distribute heavy binaries;
we distribute lightweight source code (`.yaml`). The artifacts (HTML or Native Bundles) are
generated Just-in-Time (JIT) at the edge — the Village Hub.

### Core Design Constraints

- **Hardware:** Android 4.0+, <2GB RAM, intermittent power.
- **Network:** 100% Offline capability. Intermittent "Village Hub" updates via Satellite/LoRa/USB/SD.
- **Input:** Haptic/Sensor-first (Accelerometer, Vibration) + Touch.
- **Trust:** Hub-and-Spoke Distribution for content (security), Mesh for signaling (interaction).
- **Epistemic Pluralism:** The system adapts learning paths based on local "Generative Metaphors"
  (e.g., prioritizing Weaving logic before Math if that aids the specific cohort).

---

## 2. The Data Structure (The Source)

The core of the architecture is the Lesson File. It is a YAML document designed to be
human-readable, git-forkable, and machine-executable.

### 2.1 Schema Definition

An OLS file is composed of strictly defined blocks:

- **`meta`:** Dublin Core metadata (subject, rights, coverage).
- **`ontology`:** The "Skill Contract." What this lesson `requires` and what it `provides`.
- **`gate`:** The logic block that enforces the "Zero-Trust" prerequisite check.
- **`steps`:** The content payload (Text + Hardware Instructions + SVG parameters).

### 2.2 Asset Hydration Strategy

To minimize backhaul data usage, OLS files do not embed binary assets or full SVG code.
They reference them or use parameters.

- **Images:** `image: "assets/physics/earth_diagram.png"`
- **SVGs:** Parameter-based factory calls (see SVG Factory Pattern below)

#### SVG Factory Pattern

The hub maintains a shared factory system cached on each edge device via `factory-loader.js`.
Lessons only send parameters — the device generates visuals locally from cached code.

**Implementation (as built):**
- `factory-loader.js` — Asset bootstrap. Inlined into lesson HTML. Reads
  `LESSON_DATA.requires.factories`, fetches each file from the hub cache (Cache API first,
  hub fetch fallback), and executes them in dependency order. Exposes `AGNI_LOADER`.
- `shared-runtime.js` — Runtime utilities: pub/sub event system, vibration patterns,
  device detection, sensor subscription management, visual mounting lifecycle
  (`mountStepVisual` / `destroyStepVisual`). Always the first file the loader fetches.
- `sensor-bridge.js` — Hardware sensor abstraction (DeviceMotion iOS/Android). Cached asset
  loaded by the factory loader. Must execute after `shared-runtime.js` and before `svg-stage.js`.
- `svg-stage.js` — Spec-driven visual rendering. Translates a declarative `step.spec`
  object into a live SVG stage via `AGNI_SVG.fromSpec()`. Handles RAF loop, sensor
  bindings owned by the stage, and teardown.

Example lesson YAML:
```yaml
- type: "svg"
  spec:
    type: "pendulum"
    params:
      length: 120
      bob_radius: 12
      fill: "#4fc3f7"
```

At render time, `svg-stage.js` (cached on the device) generates and animates the SVG
locally from the spec parameters.

**Runtime load order** (enforced by `factory-loader.js`):
1. `factory-loader.js` — inline, executes first
2. `shared-runtime.js` — always fetched first by loader (AGNI_SHARED)
3. `sensor-bridge.js` — fetched before stage; attaches sensor streams to AGNI_SHARED
4. `svg-stage.js` — binds sensors via `AGNI_SHARED.subscribeToSensor()`
5. `svg-factories*.js` — factory functions attached to `AGNI_SVG`
6. `svg-registry.js` — `fromSpec()` dispatch; always last in SVG chain
7. `table-renderer.js` — only if lesson has tables and visuals

Result: After first lesson, new lessons are tiny (no duplicated code), and bandwidth is saved.

---

## 3. The Compiler & Hub Architecture (agni-core + Village Hub)

The compiler is a modular Node.js application running on the Village Hub (e.g. Raspberry Pi).
It transforms the YAML source into executable artifacts based on the requesting device's capabilities.

### 3.1 Modular Structure

```
agni-core/
├── src/
│   ├── cli.js                    # Orchestration & argument parsing
│   ├── config.js                 # Markdown/unified processor (remark + rehype-katex)
│   ├── compiler/
│   │   └── buildLessonIR.js      # Canonical IR layer — single source of truth for all builders
│   ├── utils/
│   │   ├── featureInference.js   # Build-time feature inference from lesson YAML
│   │   ├── katex-css-builder.js  # Splits katex.min.css into per-lesson subset files
│   │   ├── crypto.js             # Ed25519 signing & device binding
│   │   └── io.js                 # File system & asset hydration
│   ├── builders/
│   │   ├── html.js               # Strategy A: The "Universal" SPA (HTML + sidecar)
│   │   └── native.js             # Strategy B: The "Efficient" Native Bundle [Phase 6]
│   ├── runtime/                  # The player engine (compiled into lesson HTML)
│   │   ├── player.js             # Core logic (state machine, sensors, routing)
│   │   ├── style.css             # High-contrast UI
│   │   ├── factory-loader.js     # Inlined: cache-first asset bootstrap (AGNI_LOADER)
│   │   ├── shared-runtime.js     # Cached: pub/sub, vibration, device detection, visual lifecycle
│   │   ├── sensor-bridge.js      # Cached: hardware sensor abstraction (iOS/Android motion)
│   │   └── svg-stage.js          # Cached: spec-driven SVG factory + stage system
│   └── engine/                   # LMS adaptive engine (hub-side, Node.js only)
│       ├── index.js              # Engine entry point — state persistence, public API
│       ├── types.js              # JSDoc type definitions (LMSState, BanditSummary, etc.)
│       ├── math.js               # Pure math utilities (Cholesky, invertSPD, sampleMVN)
│       ├── rasch.js              # 1PL IRT ability estimation (Newton-Raphson MAP)
│       ├── embeddings.js         # Online matrix factorization (student × lesson vectors)
│       ├── thompson.js           # Linear Thompson Sampling bandit
│       └── federation.js         # Precision-weighted Bayesian merge across hubs
│
├── hub-tools/
│   └── theta.js                  # Adaptive scheduling engine (skill graph, MLC, lesson index,
│                                 # LMS engine integration — /api/lms/* routes)
│
└── server/                       # [Phase 3 — implemented]
    ├── hub-transform.js          # On-demand YAML → PWA compilation + /factories/ serving
    ├── sw.js                     # Service Worker: cache-first factories, network-first lessons
    └── manifest.json             # PWA manifest (name, icons, display, theme)
```

#### The IR Layer (Phase 2)

`buildLessonIR.js` is the canonical intermediate representation layer. All builders receive
a fully enriched IR rather than raw YAML. The IR contains:

- Pre-rendered HTML for each step (Markdown processed at build time — no parsing cost at runtime)
- `inferredFeatures` — full feature profile (difficulty, VARK, Bloom ceiling, sensor flags,
  factory manifest, KaTeX asset list)
- `requires.factories` — ordered factory dependency list read by `factory-loader.js` at runtime.
  Built by `html.js` from `inferredFeatures.factoryManifest` with `shared-runtime.js` always
  prepended first. `sensor-bridge.js` is included whenever the lesson has visuals or sensor steps.
- `ontology` — skill requires/provides for the theta scheduling engine
- Compiler stamps (`_compiledAt`, `_schemaVersion`, `_devMode`, `metadata_source`)

The IR builder also writes a `lesson-ir.json` sidecar alongside each compiled lesson HTML.
The theta engine reads this file for its lesson index (see Section 7).

#### The Factory Loader (Phase 3)

`factory-loader.js` is inlined into lesson HTML as the first script. It is the bootstrap for
all runtime assets and must execute before `LESSON_DATA` is assigned and before `player.js` runs.

**Cache-first strategy:**
1. Check Cache API for versioned factory file (cache key: `file@version`)
2. If missing → fetch from village hub (`/factories/<file>`) → write to Cache API → execute
3. If hub unreachable → show offline banner with tap-to-retry
4. On connectivity return → `retryQueued()` re-fetches missing files and re-inits the player

**Hub URL resolution order:**
1. `LESSON_DATA._hubUrl` (compiled in by author)
2. `window.AGNI_HUB` (set by PWA install or local config)
3. Same origin as the lesson file (sneakernet folder delivery)
4. Offline fallback with queue

**`AGNI_LOADER` API:**
- `loadDependencies(lessonData)` — loads all files in `requires.factories` in declared order;
  always loads `shared-runtime.js` before `Promise.all()` fires on the rest
- `register(factoryId, version)` — called by each factory file on execution
- `isAvailable(factoryId)` — check if a factory function is ready on `AGNI_SVG`
- `listCached()`, `evict(file, version)`, `clearCache()` — cache management for device info screen
- `retryQueued()` — retry failed loads after connectivity returns

#### The KaTeX CSS Builder (Phase 3)

`katex-css-builder.js` splits `node_modules/katex/dist/katex.min.css` into subset files at
build time. Only the files a lesson actually needs are written to the output directory.

**Output files:**
- `katex-core.css` — layout rules, sizing (~15KB). Written when any equations present.
- `katex-symbols-{domain}.css` — operator/symbol subsets per detected domain:
  algebra, trig, calculus, physics, sets. Only the domains detected in the lesson are written.
- `katex-fonts.css` — `@font-face` declarations (~80KB). Written once, cached aggressively.

**Splitting strategy:** CSS is walked character-by-character at brace depth to correctly
handle nested blocks (`@font-face`, `@keyframes`). `@font-face` rules → fonts file;
domain-specific selectors → per-domain symbols file; everything else → core. Algebra
operators are included in core (not a separate file) since they appear in nearly every
equation — the algebra symbols file is written as a stub so the loader does not 404.

**Build-time optimisation:** The split result is cached in-process keyed to source file mtime.
A multi-lesson build run pays the split cost once. Files already present and up-to-date are skipped.

#### The LMS Engine (Phase 2.5)

`src/engine/` is a pure Node.js module that runs entirely on the hub. It is never loaded
on student devices. All six files are plain CommonJS JavaScript — no TypeScript, no compile
step, no `tsc` required.

The engine is loaded by `theta.js` at startup via `require('./src/engine')`. If the engine
files are missing, theta degrades gracefully: prerequisite scheduling continues unaffected
and `/api/lms/*` routes return 503.

State is persisted to `DATA_DIR/lms_state.json` using an atomic write (`.tmp` → `rename`)
so a process crash cannot corrupt the state file.

### 3.2 Output Strategies

The compiler supports dual-mode distribution:

| Feature | Strategy A: HTML SPA | Strategy B: Native Bundle |
|---------|---------------------|--------------------------|
| Target | Browsers (Chrome, WebView, KaiOS) | OLS Android Player (Kotlin/Flutter) |
| Format | Single HTML file + `lesson-ir.json` sidecar + KaTeX CSS subset files | `lesson.json` + `content/*.md` + shared libraries |
| Battery | Moderate (browser overhead) | Excellent (screen-off capability) |
| Sensors | Standard Web APIs (DeviceMotion) | HAL Access (high fidelity) |
| Caching | Cache API via factory-loader.js | Native caching |
| Packet Size | ~5–500 KB per lesson HTML (factory files cached separately) | ~10–20 KB per new lesson |
| Use Case | Zero-install entry point, sneakernet/Starlink | Long-term retention, pocket learning |
| Status | **Implemented** | Phase 6 |

### 3.3 Build Output Per Lesson

```
dist/
  gravity.html              # lesson HTML — inlines factory-loader.js + LESSON_DATA + player.js
  gravity-ir.json           # metadata sidecar for theta engine
  shared-runtime.js         # written once per dist/, reused across lessons (write-if-newer)
  katex-core.css            # written if lesson has equations (write-if-newer)
  katex-symbols-trig.css    # written if lesson has trig equations (example)
  katex-fonts.css           # written if lesson has equations (write-if-newer)
```

Factory files (`svg-stage.js`, `svg-factories*.js`, `sensor-bridge.js`, etc.) are served
by the village hub from its `/factories/` endpoint and cached on-device by `factory-loader.js`.
They are not written to `dist/` per-lesson — the hub serves them separately.

---

## 4. Network Topology: The "Smart Edge"

### 4.1 Bandwidth Optimization (The 99% Saving)

By transmitting Source YAML instead of pre-built HTML:

- **HTML Strategy:** 100 lessons = ~500 KB (with caching).
- **YAML Strategy:** 100 lessons = ~50 KB.

Result: The Hub uses its local CPU to "inflate" the content for the village.

The shared runtime assets (`shared-runtime.js`, `sensor-bridge.js`, `svg-stage.js`,
factory files, KaTeX CSS) are cached once by `factory-loader.js` and not retransmitted
per lesson. Only lesson-specific content (HTML packet + IR sidecar) changes between lessons.

### 4.2 Content Negotiation & Delivery

**Current (Phase 3) delivery:**
1. Hub operator runs `node src/cli.js --input gravity.yaml --output dist/gravity.html`
2. Compiler builds `gravity.html` + `gravity-ir.json` sidecar + required KaTeX CSS subset files
3. `shared-runtime.js` written to `dist/` once (write-if-newer), reused across all lessons
4. Files distributed to devices via USB/SD/sneakernet
5. On first lesson open, `factory-loader.js` fetches factory files from hub and caches them via Cache API
6. Subsequent lessons: factory files served from Cache API — no hub request needed

**On-demand delivery (Phase 3 — implemented):**

1. Device requests `GET /lessons/gravity`
2. `hub-transform.js` loads `gravity.yaml` → runs `buildLessonIR()` → wraps in PWA shell HTML
3. Response served immediately; lesson HTML cached in memory keyed to YAML mtime
4. Service Worker (`sw.js`) pre-caches core factory files on install
5. `factory-loader.js` fetches remaining factory files and caches via Cache API
6. Subsequent lessons: factory files served from Cache API — no hub request needed
7. A changed YAML file invalidates only that lesson's in-memory cache entry

---

## 5. Security & Governance: "Device Binding"

We enforce a "Digital Chain of Custody" to prevent the spread of corrupted, unverified,
or unauthorized lessons via P2P file sharing.

### 5.1 The "Signed Lease" Model

We move from a "Public Flyer" model to a "Personalized Ticket" model.

1. **Request:** Student device sends its UUID (e.g., `A-123`) to the Hub.
2. **Binding:** Hub compiles the lesson and calculates `Hash(Content + UUID)`.
3. **Signing:** Hub signs the hash with its Private Authority Key.
4. **Injection:** The signature and intended UUID are hardcoded into the compiled artifact.

### 5.2 Runtime Verification

`[DRAFT NOTE: Ed25519 verification via Web Crypto SubtleCrypto is Phase 4.
The `verifyIntegrity()` function in player.js is currently a placeholder that always
returns true. iOS 9 has `window.crypto.subtle` but limited Ed25519 support — a polyfill
will be needed. The signing infrastructure in `utils/crypto.js` is implemented; the
runtime verification is not yet.]`

When the lesson runs:

- **Check 1 (Identity):** Does the UUID embedded in the code match the device UUID?
  Mismatch → "Unauthorized Copy." (Stops P2P file cloning.)
- **Check 2 (Integrity):** Does the signature match the content?
  Mismatch → "Corrupted File." (Stops malicious editing.)

---

## 6. The Signaling Mesh (Allowed P2P)

While Lesson Files (Data Plane) are restricted to Hub-and-Spoke to ensure authority,
Interaction (Control Plane) remains Peer-to-Peer.

**Scenario: Multiplayer Quiz.**
- Device A broadcasts `SESSION:START` via Bluetooth LE or WebRTC.
- Device B receives signal, verifies it has its own valid signed copy of the lesson logic.
  It does not accept code from Device A.
- If valid, Device B joins the session.

Result: Students can interact and learn together (Mesh), but cannot bypass the Authority
node to distribute content (Star).

---

## 7. The Adaptive Graph Engine (Navigation)

OLS uses a probabilistic graph to order lessons based on observed learning outcomes.
The engine has two layers with distinct responsibilities.

### 7.1 Theta — Prerequisite Enforcement & Eligibility Filtering (Implemented)

`theta.js` (hub-tools/) maintains the lesson graph and enforces prerequisite readiness
before any lesson is offered to a student.

- **Skill graph:** BFS traversal with cycle guard. Lessons are only eligible if all
  `ontology.requires` skills are mastered.
- **MLC heuristic:** Among eligible lessons, sorts by Marginal Learning Cost:
  `θ = BaseCost − CohortDiscount`
  Students with background in weaving see "Loops" first; students with farming background
  may see "Modulo Arithmetic" first.
- **Lesson index:** Built from `lesson-ir.json` sidecar files written by the compiler.
  Falls back to HTML scraping for lessons compiled before Phase 2.
- **LMS integration:** After `rebuildLessonIndex()` completes, theta seeds all lessons
  into the LMS engine. Seeding is idempotent — safe on every full rebuild.

**HTTP API** (served on `AGNI_THETA_PORT`, default 8082):

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/theta` | Theta-sorted eligible lessons for a student (`?pseudoId=`) |
| GET | `/api/theta/all` | Theta results for all known students |
| GET | `/api/theta/graph` | Current effective graph weights |
| GET | `/api/lms/select` | Bandit lesson selection from a theta candidate set |
| POST | `/api/lms/observation` | Record completed lesson, update all models |
| GET | `/api/lms/status` | Engine diagnostic snapshot |
| POST | `/api/lms/federation/merge` | Merge remote bandit summary from regional hub |

### 7.2 LMS Engine — Adaptive Selection (Phase 2.5 — implemented)

A principled ML engine that selects among theta-eligible lessons using observed learning
gain. Theta handles prerequisite enforcement; the LMS engine handles selection within
the eligible set. Neither system needs to be complete before the other ships.

**JS compatibility note:** All engine files run on the hub (Node.js 14+) only. They are
never loaded on student devices and therefore are not subject to the ES5 constraint that
governs the runtime files in `src/runtime/`.

**Architecture:**

| File | Algorithm | Role |
|------|-----------|------|
| `rasch.js` | 1PL IRT (Newton-Raphson MAP) | Estimates student ability on logit scale; produces gain proxy for bandit |
| `embeddings.js` | Online matrix factorization | Student × lesson latent factors with exponential forgetting |
| `thompson.js` | Linear Thompson Sampling | Selects next lesson by sampling from RLS posterior over gain-given-features |
| `federation.js` | Precision-weighted Bayesian merge | Merges bandit posteriors across village hubs without sharing raw student data |
| `math.js` | Pure utilities | Cholesky decomposition, `invertSPD`, `sampleMVN`, matrix/vector ops |
| `engine/index.js` | Engine entry point | State load/persist, public API surface, lesson seeding |

**Feature vectors:**
- Bandit feature vector: `[...studentVec, ...lessonVec]` — always `embeddingDim * 2` in length.
  This constraint is enforced at runtime by `ensureBanditInitialized()`.
- Lesson vector seeded from `lesson-ir.json` sidecar `inferredFeatures`
- Student vector from Rasch ability estimate + learned embedding

**State persistence:**
- `DATA_DIR/lms_state.json` — single JSON file, atomically written (`.tmp` → `rename`)
- Loaded once at `require()` time; all mutations persist before returning to caller
- On parse failure: corrupted file is preserved as `.bak`, fresh state is initialised

**Federated learning:** Village hubs can merge their bandit posteriors using
`federation.js` without sharing raw student data. The merge uses precision-weighted
Bayesian combination: each hub's precision matrix is normalised to per-observation units
before combining, then restored to total-observation scale.

### 7.3 The Skill Collapse Concept

We assume that for certain cohorts, mastering Skill A makes Skill B trivial (a "Skill Collapse").

The Village Sentry analyzes anonymized local learning logs to detect these collapses:

- **Nodes:** Skill IDs (e.g., `ols.math:ratios`)
- **Edges:** Observed probability that Skill A facilitates Skill B

Result: The graph weights (`graph_weights.json`) are updated over time as real cohort
data accumulates, making the system progressively more culturally adapted.

---

## Appendix: Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | player.js sensor bridge, threshold evaluator, emulator controls | Complete |
| Phase 2 | IR layer, Markdown pipeline, sidecar, config fixes | Complete |
| Phase 2.5 | LMS engine (Rasch + embeddings + bandit + federation) | Complete |
| Phase 3 | factory-loader.js, KaTeX CSS, sensor-bridge.js as cached asset, server/ PWA delivery | **Complete** |
| Phase 4 | Ed25519 integrity verification (Web Crypto SubtleCrypto) | Queued |
| Phase 5 | Gate retry_delay/passing_score, max_attempts, step-level sensor dependency tracking | Queued |
| Phase 6 | native.js builder, yaml-packet.js builder (thin client targets) | Queued |
