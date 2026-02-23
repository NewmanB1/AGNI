# 🏗️ Open Lesson Standard (OLS): System Architecture v2.1
> **Draft status:** Updated from v2.0 to reflect implementation reality as of Phase 2 completion.
> Sections marked `[DRAFT NOTE]` are changes from v2.0 that need editorial review before finalising.

---

## 1. High-Level Overview

The Open Lesson Standard (OLS) is a decentralized, offline-first protocol for interactive
education on resource-constrained hardware.

The system follows a "Source-to-Artifact" philosophy. We do not distribute heavy binaries;
we distribute lightweight source code (`.yaml`). The artifacts (HTML or Native Bundles) are
generated Just-in-Time (JIT) at the edge — the Village Hub.

### Core Design Constraints

- **Hardware:** Android 4.0+, <2GB RAM, intermittent power.
  `[DRAFT NOTE: v2.0 said Android 6.0+. Implementation targets Android 4.0+ throughout —
  Map/Set avoided in hot paths, explicit Promise chains instead of async/await, no ES6+
  syntax anywhere. This is a hard constraint that affects every JS compatibility decision.
  Update to 4.0+ unless there is a policy reason to restrict to 6.0+.]`
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

#### SVG Factory Pattern (v2.1)

`[DRAFT NOTE: v2.0 described a single shared.js as the factory library. The implementation
has split this into two distinct files with different responsibilities:]`

The hub maintains a shared factory system cached on each edge device via Service Worker.
Lessons only send parameters — the device generates visuals locally from cached code.

**Implementation (as built):**
- `shared-runtime.js` — Runtime utilities: pub/sub event system, vibration patterns,
  device detection, sensor subscription management, visual mounting lifecycle
  (`mountStepVisual` / `destroyStepVisual`)
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
│   │   ├── crypto.js             # Ed25519 signing & device binding
│   │   └── io.js                 # File system & asset hydration
│   ├── builders/
│   │   ├── html.js               # Strategy A: The "Universal" SPA (HTML + sidecar)
│   │   └── native.js             # Strategy B: The "Efficient" Native Bundle [Phase 6]
│   └── runtime/                  # The player engine (compiled into lesson HTML)
│       ├── player.js             # Core logic (state machine, sensors, routing)
│       ├── style.css             # High-contrast UI
│       ├── shared-runtime.js     # Cached: pub/sub, vibration, device detection, visual lifecycle
│       ├── sensor-bridge.js      # Hardware sensor abstraction (iOS/Android motion)
│       └── svg-stage.js          # Cached: spec-driven SVG factory + stage system
│
├── hub-tools/
│   └── theta.js                  # Adaptive scheduling engine (skill graph, MLC, lesson index)
│
└── server/                       # [Phase 3 — not yet implemented]
    ├── hub-transform.js          # YAML → PWA/JSON transformation
    ├── pwa-shell.html            # PWA entry point template
    ├── sw.js                     # Service Worker for caching
    └── manifest.json             # PWA manifest
```

`[DRAFT NOTE: v2.0 file tree did not include compiler/, hub-tools/, or the runtime split.
The server/ directory remains accurate as Phase 3 scope — not yet built.]`

#### The IR Layer (new in Phase 2)

`buildLessonIR.js` is the canonical intermediate representation layer. All builders receive
a fully enriched IR rather than raw YAML. The IR contains:

- Pre-rendered HTML for each step (Markdown processed at build time — no parsing cost at runtime)
- `inferredFeatures` — full feature profile (difficulty, VARK, Bloom ceiling, sensor flags,
  factory manifest, KaTeX asset list)
- `ontology` — skill requires/provides for the theta scheduling engine
- Compiler stamps (`_compiledAt`, `_schemaVersion`, `_devMode`, `metadata_source`)

The IR builder also writes a `lesson-ir.json` sidecar alongside each compiled lesson HTML.
The theta engine reads this file for its lesson index (see Section 7).

### 3.2 Output Strategies

The compiler supports dual-mode distribution:

| Feature | Strategy A: HTML SPA | Strategy B: Native Bundle |
|---------|---------------------|--------------------------|
| Target | Browsers (Chrome, WebView, KaiOS) | OLS Android Player (Kotlin/Flutter) |
| Format | Single HTML file + `lesson-ir.json` sidecar + cached `shared-runtime.js` | `lesson.json` + `content/*.md` + shared libraries |
| Battery | Moderate (browser overhead) | Excellent (screen-off capability) |
| Sensors | Standard Web APIs (DeviceMotion) | HAL Access (high fidelity) |
| Caching | Service Worker caches shared assets + lesson data | Native caching |
| Packet Size | ~5–500 KB per lesson (shared assets cached separately) | ~10–20 KB per new lesson |
| Use Case | Zero-install entry point, sneakernet/Starlink | Long-term retention, pocket learning |
| Status | **Implemented** | Phase 6 |

---

## 4. Network Topology: The "Smart Edge"

### 4.1 Bandwidth Optimization (The 99% Saving)

By transmitting Source YAML instead of pre-built HTML:

- **HTML Strategy:** 100 lessons = ~500 KB (with caching).
- **YAML Strategy:** 100 lessons = ~50 KB.

Result: The Hub uses its local CPU to "inflate" the content for the village.

The shared runtime assets (`shared-runtime.js`, `svg-stage.js`, KaTeX CSS) are cached once
by the Service Worker and not retransmitted per lesson. Only lesson-specific content (HTML
packet + IR sidecar) changes between lessons.

### 4.2 Content Negotiation & Delivery

`[DRAFT NOTE: This flow describes the Phase 3 server/ target. Current (Phase 2) delivery
is direct file compilation via CLI, not on-demand hub-transform. Marking this section as
the target architecture rather than current state.]`

**Target architecture (Phase 3):**

1. Device requests `GET /lessons/gravity`
2. Hub detects User-Agent / capabilities
3. Hub runs `hub-transform.js`: loads YAML → runs inference → builds IR → wraps in PWA shell
4. Hub serves the PWA bundle
5. Edge device loads in Chrome → Service Worker caches shared assets
6. Subsequent lessons only need new HTML packet + IR sidecar (shared code already cached)

**Current (Phase 2) delivery:**
1. Hub operator runs `node src/cli.js --input gravity.yaml --output dist/gravity.html`
2. Compiler builds `gravity.html` + `gravity-ir.json` sidecar
3. `shared-runtime.js` written to `dist/` once, reused across all lessons
4. Files distributed to devices via USB/SD/sneakernet

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

`[DRAFT NOTE: v2.0 described a sketch of the MLC heuristic. The implementation is
substantially more developed. Updating this section to reflect what is built and what
is queued.]`

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

### 7.2 LMS Engine — Adaptive Selection (Phase 2.5 — queued)

A principled ML engine that selects among theta-eligible lessons using observed learning gain.
Theta handles prerequisite enforcement; the LMS engine handles selection within the eligible set.

**Architecture (Option B integration):**

| Layer | Algorithm | Role |
|-------|-----------|------|
| `rasch.ts` | 1PL IRT (Newton-Raphson MAP) | Estimates student ability on logit scale; produces gain proxy |
| `embeddings.ts` | Online matrix factorization | Student × lesson latent factors with forgetting |
| `thompson.ts` | Linear Thompson Sampling | Selects next lesson by sampling from posterior over gain-given-features |
| `federation.ts` | Precision-weighted Bayesian merge | Merges bandit posteriors across village hubs without raw data sharing |

**Feature vectors:**
- Lesson feature vector populated from `lesson-ir.json` sidecar `inferredFeatures`
  (difficulty, VARK profile, Bloom ceiling, pedagogical style)
- Student feature vector from Rasch ability estimate + learned embedding

**Federated learning:** Village hubs can merge their bandit posteriors using
`federation.ts` without sharing raw student data. Each hub improves from the
collective without centralising sensitive learning logs.

### 7.3 The Skill Collapse Concept

We assume that for certain cohorts, mastering Skill A makes Skill B trivial (a "Skill Collapse").

The Village Sentry analyzes anonymized local learning logs to detect these collapses:

- **Nodes:** Skill IDs (e.g., `ols.math:ratios`)
- **Edges:** Observed probability that Skill A facilitates Skill B

Result: The graph weights (`graph_weights.json`) are updated over time as real cohort
data accumulates, making the system progressively more culturally adapted.

## 8. Knowledge Architecture: UTUs and Skill Ontology

OLS operates two distinct but related knowledge structures. They serve different consumers
and must not be conflated.

### 8.1 Universal Transformative Units (UTUs) — Taxonomy Layer

UTUs are broad classification labels, analogous to a Dewey Decimal system for skills.
A UTU says: "this lesson engages this *kind* of reasoning at this *developmental level*."

```yaml
meta:
  utu:
    class: "MAC-2"      # Mathematical Activity Class: Transformation
    band: 4             # Developmental Band: Relational Abstraction (ages 11–13)
```

**Who uses UTUs:**

- **Governance authorities** — a regional body declares "11-year-olds should demonstrate
  MAC-2 Band 4." The system maps that declaration to the set of skill nodes in that bucket
  and reports stabilisation rates. The authority gets compliance evidence without prescribing
  specific lessons or representations.
- **Lesson authors** — browsing for lessons to fork. `MAC-6 Band 3` is a discoverable
  category; authors find peer lessons in the same bucket and adapt them for their cohort.
- **The LMS engine (Phase 2.5)** — UTU class and band are features in the lesson embedding
  vector, allowing the bandit to learn that a student who stabilises MAC-3 quickly tends
  to need more exposure to MAC-7 before advancing.

**What UTUs do not do:** They do not determine lesson sequencing. A UTU bucket may contain
fifty distinct skill nodes at varying levels of prerequisite depth. The order in which those
skills are acquired is governed entirely by the ontology layer.

### 8.2 Skill Ontology — Sequencing Layer

The `ontology` block in OLS YAML defines the fine-grained prerequisite chain that actually
governs lesson ordering. Each `provides` entry is a specific, atomic skill node. Each
`requires` entry is a hard dependency — theta will not offer a lesson until all required
skills are stabilised.

This is the layer that makes a complex target like:

```
(3(x - 2)) / 4 + 5 = (2x + 7) / 2 - 1
```

reachable, because the full dependency chain is encoded explicitly:

```
ols:math:integer_arithmetic
  → ols:math:variable_as_placeholder
    → ols:math:one_step_linear
      → ols:math:multi_step_linear
        → ols:math:equations_with_fractions
          → ols:math:distributive_property
            → ols:math:fractions_and_distribution_both_sides
```

Each node in this chain is a separate OLS lesson with its own `requires` and `provides`.
Theta's BFS skill graph traverses these edges to determine eligibility. The student
cannot reach the final lesson until every upstream node is stabilised — not because
the system is rigid, but because the prerequisite structure reflects genuine cognitive
dependencies.

**Example YAML (a mid-chain lesson):**

```yaml
meta:
  title: "Solving equations with fractions"
  utu:
    class: "MAC-2"
    band: 4

ontology:
  requires:
    - skill: "ols:math:multi_step_linear"
    - skill: "ols:math:fraction_arithmetic"
  provides:
    - skill: "ols:math:equations_with_fractions"
      level: 1
```

The UTU label (`MAC-2 Band 4`) sits on top of the graph as a governance/discovery tag.
It does not affect how theta routes the student.

### 8.3 The Relationship Between Layers

```
Governance authority
    ↓ declares
  UTU targets (e.g. "MAC-2 Band 4 by age 13")
    ↓ maps to
  Set of skill nodes carrying that UTU label
    ↓ theta tracks stabilisation across
  Individual OLS lessons
    ↓ each connected by
  ontology.requires / ontology.provides edges
    ↓ forming
  Directed acyclic prerequisite graph
```

A UTU is a *label on a subgraph*, not a node in the graph. Many skill nodes share the
same UTU classification. The governance layer asks "how many MAC-2 Band 4 nodes has this
cohort stabilised?" — theta answers by counting stabilised nodes in that bucket. The
authority gets meaningful aggregate evidence without seeing individual student data or
prescribing specific lesson content.

### 8.4 Schema Fields

| Field | Layer | Consumer |
|-------|-------|----------|
| `meta.utu.class` | Taxonomy | Governance reporting, lesson discovery, LMS features |
| `meta.utu.band` | Taxonomy | Governance, Band-ceiling validation at compile time |
| `ontology.requires[].skill` | Sequencing | Theta (eligibility gate), LMS (prerequisite distance) |
| `ontology.provides[].skill` | Sequencing | Theta (stabilisation tracking) |
| `ontology.provides[].level` | Sequencing | Future: multi-level mastery tracking |
| `inferredFeatures.difficulty` | Both | LMS bandit feature vector, UI display |
| `inferredFeatures.bloom_ceiling` | Taxonomy | Band validation (compile-time warning if mismatch) |

`[DRAFT NOTE: meta.utu is not yet in the OLS YAML schema or the IR. Adding it requires:
(1) Schema update to accept utu.class and utu.band in the meta block.
(2) featureInference.js: warn at compile time if declared band conflicts with inferred
    bloom_ceiling (e.g. author declares Band 2 but content requires formal abstraction).
(3) buildLessonIR.js: pass utu fields through to IR and sidecar unchanged.
(4) theta.js: index lessons by UTU class/band for governance reporting queries.
This is clean additive work — no breaking changes to existing lessons that omit utu.]`

---

## Appendix: Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | player.js sensor bridge, threshold evaluator, emulator controls | Complete |
| Phase 2 | IR layer, Markdown pipeline, sidecar, config fixes | Complete |
| Phase 2.5 | LMS engine (Rasch + embeddings + bandit + federation) | Queued |
| Phase 3 | factory-loader.js, KaTeX CSS splitting, server/ PWA delivery, config.js fixes | Queued |
| Phase 4 | Ed25519 integrity verification (Web Crypto SubtleCrypto) | Queued |
| Phase 5 | Gate retry_delay/passing_score, max_attempts, step-level sensor dependency tracking | Queued |
| Phase 6 | native.js builder, yaml-packet.js builder (thin client targets) | Queued |
