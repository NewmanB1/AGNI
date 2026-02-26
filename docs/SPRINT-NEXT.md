# Next Development Sprint — Task List

**Open work for the next sprint → `docs/NEXT-SPRINT-TASKS.md`** (launch, community, Year 2 prep, quality, optional).

The sections below (P0–P4 and "Goals for next sprints") are **completed or historical**: every listed item is marked Done (Sprint A/B/C, Backlog, Phase 1–3). This file is kept as a **backlog and reference**. When you plan a sprint, use **`docs/NEXT-SPRINT-TASKS.md`** for the current recommended tasks.

---

## Completed backlog (P0–P4)

*All items in the following tables are done. For open work see `docs/NEXT-SPRINT-TASKS.md`.*

### P0 — High impact, closes “prove θ” / cultural adaptation

| # | Task | Source | Notes |
|---|------|--------|------|
| 1 | **Document Sentry → theta → graph_weights flow** (Done Sprint A) | Eval §5, ROADMAP Day 56–60 | Add a short section in ARCHITECTURE.md (or `docs/playbooks/sentry.md`) describing: how sentry.js consumes events, computes skill-collapse edges, writes `graph_weights.json`; how theta reads it via `getEffectiveGraphWeights()`; what’s implemented vs. optional (e.g. regional sync). Unblocks clear “cultural adaptation” narrative. |
| 2 | **Finalize `graph_weights.schema.json`** (Done Sprint A) | ROADMAP Phase 1 | Sentry already writes graph_weights and references the schema. Validate schema against Sentry output, add to CI if not already, and mark ROADMAP item complete. |
| 3 | **Portal–hub contract tests** (Done Sprint A) | Eval §6 | Add a small test suite (or E2E) that starts theta (and optionally hub-transform), then uses the portal’s API client (`createHubApi`) to call `/api/theta`, `/api/lms/status`, `/api/governance/report`, and asserts response shapes. Ensures the portal remains a first-class consumer when `VITE_HUB_URL` is set. |

---

## P1 — Quality and maintainability

| # | Task | Source | Notes |
|---|------|--------|------|
| 4 | **Threshold syntax in gate (e.g. `freefall > 0.2s`)** (Done Sprint B) | ROADMAP Day 36–40 | Implement or complete the regex/parser for hardware threshold expressions in the gate so “Golden Master” can require “drop the phone” to unlock the next step. Enables sensor–gate integration. |
| 5 | **Golden Master: drop-phone step + validator** (Done Sprint B) | ROADMAP Day 13–18, 19–25 | Fulfil “User must drop the phone to unlock the next step” and “Validator passes the new Threshold Syntax” so the Golden Master lesson and validation story are complete. |
| 6 | **Hardware / runtime compatibility note** (Done Sprint B) | Eval §3 | Add a short “Compatibility” subsection (e.g. in ARCHITECTURE.md or README): single Android/runtime baseline (e.g. 6.0+ or 4.0+), ES5 in runtime, and a one-line CI or checklist (e.g. “no Map/Set in hot paths” or build target). Resolves doc inconsistency (4.0 vs 6.0). |
| 7 | **LMS state migration/repair** (Done Backlog) | ARCH §5.6 | Implement a minimal `engine/migrations` (or single migration script) that detects an older `LMSState` schema and reshapes it (or applies safe defaults). Optionally expose a “repair” or “migrate” command via CLI or hub admin. Reduces “delete the file” as the only recovery. |

---

## P2 — Authoring and ecosystem

| # | Task | Source | Notes |
|---|------|--------|------|
| 8 | **Authoring API: POST /api/author/validate** (Done Sprint C) | api-contract.md §5 | Implement validation endpoint: accept raw YAML or JSON lesson in body; run parser + schema validation (and optional structure checks); return `{ valid, errors[], warnings[] }`. Serves WYSIWYG and CLI tooling. |
| 9 | **Authoring API: POST /api/author/preview** (Done Sprint C) | api-contract.md §5 | Implement preview endpoint: accept YAML or JSON; return compiled IR and sidecar (and optionally HTML snippet). Enables “preview before save” in an editor. |
| 10 | **Wire portal to real hub by default (or env)** (Done Sprint C) | Eval, ARCH §5.8 | Make it easy to run the portal against a live hub (e.g. default `VITE_HUB_URL` in dev, or a single env check). Add a short “Running portal against hub” note to README or portal docs. |

---

## P3 — Technical debt and refactor

| # | Task | Source | Notes |
|---|------|--------|------|
| 11 | **Formalize IR / runtime types in TypeScript** (Done Backlog) | ARCH §5.2 | Add or extend `src/types/index.d.ts` with `LessonIR`, `InferredFeatures`, `FactoryManifestEntry` (and any missing pieces). Use in compiler/runtime where feasible; run `npm run typecheck` to enforce. |
| 12 | **Decouple feature inference from filenames** (Done Backlog) | ARCH §5.3 | Introduce a small `runtimeManifest` (or equivalent) that maps high-level capabilities to concrete runtime file names and load order; have featureInference output capabilities only. Reduces coupling when adding or renaming runtime modules. |
| 13 | **Consolidate binary/base64 utilities** (Done Backlog) | ARCH §5.4 | Create `src/utils/binary.js` or `src/runtime/binary-utils.js`; centralize base64 ↔ bytes and UTF-8 helpers; replace duplicates in runtime and crypto paths. |
| 14 | **LMS engine: TypeScript for numerical modules** (Done Backlog) | ARCH §5.5 | Convert `rasch.js`, `embeddings.js`, `thompson.js`, `federation.js`, `math.js` to TypeScript (or add strict `.d.ts`) and model matrix/vector shapes where practical. Improves safety for θ and bandit changes. |

---

## P4 — Validation, content, and community

| # | Task | Source | Notes |
|---|------|--------|------|
| 15 | **Translation stress test** (Done Sprint B) | ROADMAP Day 19–25 | Fork Golden Master, translate to Spanish (or another language), run validator and player; document any schema or i18n gaps. |
| 16 | **Graph verification test** (Done Phase 1) | ROADMAP Day 91–95 | Simulate “Weaver Cohort” vs “Farmer Cohort” (e.g. different mastery inputs); confirm lesson menu order differs by cohort using the same content. Proves θ behaviour. |
| 17 | **Export/import and sneakernet (optional)** (Done Backlog) | ROADMAP Day 41–45 | Gzip + Base45 compression; “Export Progress” (e.g. QR); “Import Progress” (parse + merge). Lower priority unless field deployment needs it soon. |

---

## Suggested sprint focus

- **Sprint A (prove θ + ecosystem):** 1, 2, 3, (optional 16).  
- **Sprint B (content + quality):** 4, 5, 6, 15.  
- **Sprint C (authoring):** 8, 9, 10.  
- **Backlog (when touching code):** 7, 11, 12, 13, 14, 17. *(Done: 7, 11, 12, 13, 14, 17.)*

Update ROADMAP.md and ARCHITECTURE.md as items are completed.

---

## Goals for next sprints (completed D–I, refactor Phases 1–3)

*The sprint goals below (D through I and the refactor phases) are all marked Done. For current open work use `docs/NEXT-SPRINT-TASKS.md`.*

Historical: remaining high-value work as it was grouped into sprint-sized goals. Order by priority and capacity.

### Sprint D — Prove θ (evidence)

**Goal:** Turn “theta works” from implemented to demonstrated.

| Goal | Task | Success |
|------|------|--------|
| **Graph verification test** | Implement and run the Day 91–95 scenario: two cohorts (e.g. “Weaver” vs “Farmer”) with different mastery inputs; same lesson set. | Lesson menu order differs by cohort; document results. |
| **Optional** | Add a small script or test that seeds mastery_summary (or equivalent), calls theta for each cohort, and asserts ordering differs. | Reproducible proof of θ behaviour. |

**Source:** ROADMAP Day 91–95, ARCHITECTURE-EVALUATION §6 rec 2.

---

### Sprint E — Hardware and compatibility

**Goal:** One clear baseline so students and operators know what “supported” means.

| Goal | Task | Success |
|------|------|--------|
| **Single baseline** | Decide and document one Android/runtime baseline (e.g. Android 6.0+, ES5 in runtime). | ARCHITECTURE.md and README state one line (e.g. “Android 6.0+, ES5”). |
| **Compatibility section** | Add a short “Compatibility” subsection (ARCHITECTURE or README): baseline, ES5, and a one-line CI or checklist if feasible. | Doc inconsistency (4.0 vs 6.0) resolved. |
| **Optional** | CI or checklist: e.g. “no Map/Set in runtime hot paths” or build target. | Baseline is testable. |

**Source:** ARCHITECTURE-EVALUATION §3.1, §6 rec 1; consumer “Student” gap.

---

### Sprint F — Federation and operator story

**Goal:** Hub operators and multi-hub deployments have a clear model.

| Goal | Task | Success |
|------|------|--------|
| **Federation deployment** | Document in ARCHITECTURE or a playbook: who runs sync, how often, how hubs discover each other; local vs regional graph_weights. | Operators can deploy two hubs and understand sync. |
| **Optional** | Clarify hub-tools/sync.js and graph_weights_regional flow in playbooks. | Sentry/sync story is end-to-end. |

**Source:** ARCHITECTURE-EVALUATION §3.4, §6 rec 3; consumer “Hub operator” gap.

---

### Sprint G — Teacher and author experience

**Goal:** Close teacher override and optional author discovery.

| Goal | Task | Success |
|------|------|--------|
| **Recommendation override** | Design and implement an API (e.g. POST /api/recommendations/override or similar) so teachers can pin or override next-lesson for a student. | Portal (or future UI) can override; contract tests cover it. |
| **Optional** | “Browse by UTU” or lesson discovery API (e.g. GET /api/lessons?utu=MAC-2&band=4) for authors. | Authors can discover lessons by taxonomy. |

**Source:** ARCHITECTURE-EVALUATION §5.2 (Teacher), §5.3 (Author); consumer summary.

---

### Sprint H — Engine and runability

**Goal:** LMS, sneakernet, and theta engine work out of the box where expected.

| Goal | Task | Success |
|------|------|--------|
| **Engine run instructions** | Add a build step (e.g. tsc for engine) or clear “run with ts-node” instructions so theta/LMS/sneakernet have a loadable engine in a clean clone. | `npm run …` or documented command yields working engine. |
| **Optional** | Package.json script to build engine to JS if that becomes the canonical path. | No ambiguity on “how to run the hub with LMS.” |

**Source:** ARCHITECTURE-EVALUATION §3.3, §6 rec 4.

---

### Sprint I — Launch and community (ROADMAP Phase 4)

**Goal:** Public launch and community onboarding (content and process).

**Supporting docs:** **`docs/LAUNCH-AND-COMMUNITY.md`** (launch checklist, labels, onboarding), **`docs/tutorials/fork-and-translate-lesson.md`** (tutorial), **`docs/YEAR2-PREP.md`** (WYSIWYG, v1.0 spec).

| Goal | Task | Source |
|------|------|--------|
| **Public launch** | Publish manifesto / intro (e.g. HN, Reddit, Dev.to). | ROADMAP Day 76–80 |
| **Community onboarding** | Triage issues; label “Good First Issues” (e.g. translation). | ROADMAP Day 81–85 |
| **Code-as-content tutorial** | Record video: “How to fork and translate a lesson.” | ROADMAP Day 86–90 |
| **Year 2 prep** | Research TipTap (or equivalent) for WYSIWYG; finalize v1.0 spec. | ROADMAP Day 96–100 |

---

### Sprint J — Optional / later

| Goal | Task | When |
|------|------|------|
| **QR / Base45 for progress** | Add Base45 encoding and QR generation/scan for sneakernet payload if field deployment needs it. | When progress-via-QR is a requirement. |
| **Sensory and accessibility** | Test haptics with neurodivergent volunteers; refine Intensity schema. | ROADMAP Day 71–75. |
| **Outreach and pitch** | Kolibri integration guide; OLS-in-iframe demo. | ROADMAP Day 66–70. |
| **External platforms** | Integration guides and reference integrations (Kolibri, Moodle, Canvas). | Year 2. |

---

### Suggested order

1. **Sprint D** — Prove θ (unblocks “cultural adaptation” narrative with evidence).  
2. **Sprint E** — Hardware baseline (unblocks clear student/device story).  
3. **Sprint F** or **G** — Federation docs or teacher override (depending on whether operators or teachers are the next focus).  
4. **Sprint H** — If engine runability is blocking anyone.  
5. **Sprint I** — When ready for launch and community.

---

## Next sprints with an eye on the refactor (schema-based, functional)

The following order and framing prioritises work that **prepares for** or **is** the first steps toward the reference-implementation vision in **`docs/REFERENCE-IMPLEMENTATION-VISION.md`** (schema-based, functional where it helps).

### Phase 1 — Lock behaviour and contracts (prep for refactor) — **Done**

Do these first so the refactor has a stable, testable target.

| Sprint | Goal | Refactor relevance |
|--------|------|---------------------|
| **D** (Done) | Prove θ (graph verification test) | Locks “correct” theta behaviour. When we refactor to a pure `(index, graph, studentId) → ordered list`, we have a regression test. |
| **E** (Done) | Hardware / compatibility baseline | Single documented contract for “supported runtime”; refactor doesn’t change device target. |
| **H** (Done) | Engine runability (build or ts-node) | Engine must run reliably before we refactor it to `(state, observation) → newState` with persistence at the edge. |

### Phase 2 — Schema and pure pipelines (first refactor steps) — **Done**

First sprints that directly move toward schema-based, functional design.

| Sprint | Goal | Refactor relevance |
|--------|------|---------------------|
| **K** (Done) — Compiler: schema-first + pure pipeline | (1) Every lesson path (CLI, hub-transform, author API) validates with **same** OLS/IR schema before any business logic; invalid data fails fast with schema errors. (2) Expose compiler as a **pure pipeline**: `rawYaml → parse → validate(schema) → buildIR → buildArtifact`; no hidden mutable state inside the pipeline; I/O only at the edges (caller passes in file contents or receives output). | **Schema-based:** one definition of “valid OLS”; validation by construction. **Functional:** pipeline is pure; easy to test and to document as reference behaviour. |
| **L** (Done) — Governance: policy schema + pure compliance | (1) Add an explicit **policy schema** (e.g. `schemas/governance-policy.schema.json`) and validate policy files against it. (2) Ensure compliance is a **pure function**: `(policy, sidecar) → ComplianceResult`; no hidden state; all routes call this with their inputs. | **Schema-based:** policy is a first-class contract. **Functional:** compliance is (inputs) → (output); easy to test and reuse. |
| **M** (Done) — Engine: pure core, persistence at edge | (1) Extract a **pure** `applyObservation(state, observation) → newState` (and optionally `selectLesson(state, studentId, candidates) → lessonId | null`) from the LMS engine; no file I/O inside. (2) Persistence (load/save `lms_state.json`) is a thin wrapper around the pure core. (3) Theta: extract **pure** `computeOrder(index, graphWeights, studentMastery) → lesson[]`; HTTP and index loading stay at the edge. | **Functional:** core is (state, event) → new state and (index, graph, student) → order; reference behaviour is testable without touching the filesystem. |

### Phase 3 — Optional / follow-on — **Done**

| Sprint | Goal | Refactor relevance |
|--------|------|---------------------|
| **F** (Done) | Federation deployment docs | Clear contracts for sync and graph_weights; when we add more schema-driven sync, the deployment story is already documented. |
| **G** (Done) | Teacher override API | Design override as **pure** “(current state, override) → effective recommendation” so it fits the functional style; API is the edge. |
| **N** (Done) — Types/codegen from schemas (optional) | Generate TypeScript types or runtime validators from `ols.schema.json` (and optionally policy, graph_weights) so the implementation cannot drift from the spec without failing build/tests. | **Schema-based:** single source of truth; reference implementation stays aligned with the standard. |

### Suggested order (refactor-oriented)

1. **D → E → H** — Lock behaviour, baseline, and runability (Phase 1).  
2. **K** — Compiler schema-first + pure pipeline (biggest “reference implementation” win).  
3. **L** — Governance policy schema + pure compliance.  
4. **M** — Engine pure core, persistence at edge.  
5. **F, G** — Federation docs and teacher override (design override to be refactor-friendly).  
6. **N** — Schema-driven types/codegen when the team is ready to maintain codegen.

This order establishes stable, testable behaviour first (Phase 1), then applies the first schema-based and functional steps to the compiler (K), governance (L), and engine/theta (M), so the codebase moves incrementally toward the reference implementation vision without a big-bang rewrite.
