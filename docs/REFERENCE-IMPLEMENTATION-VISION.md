# Reference Implementation Vision (Future Refactor)

This document describes the **reference implementation** direction for AGNI: a **schema-based**, and where it helps **functional**, design so the codebase can serve as the reference implementation of the Open Lesson Standard (OLS). The refactor is incremental; §4.1 and §4.2 record progress and the boundary between pure core and edges.

---

## 1. Goal

- **Schema-based:** The OLS spec, graph weights, policy, and any other core contracts are expressed as **schemas** (e.g. JSON Schema, or a single source of truth). The implementation is **driven by** those schemas—validation, types, and ideally pipeline stages—so the reference implementation stays aligned with the standard by construction.
- **Functional where it makes sense:** Prefer **pure functions** and **immutable data** along the main pipelines (e.g. YAML → IR → artifact; state in → state out). Avoid hidden mutation and side effects in the core transforms so the behaviour of the standard is easy to reason about and test.
- **True reference implementation:** Other runtimes, tools, or platforms can point at AGNI and say: “this is what OLS means.” The code should be readable, predictable, and clearly separated into “what the spec says” vs “hub/device glue.”

---

## 2. Schema-based

### 2.1 What it could mean

- **Schemas as source of truth**
  - OLS lesson: `schemas/ols.schema.json` (and any IR/sidecar schemas) define the contract. All parsing, validation, and transformation assume these shapes.
  - Graph weights: `schemas/graph_weights.schema.json` already exists; Sentry and theta consume/produce only data valid under this schema.
  - Governance policy: an explicit policy schema so compliance and reporting are defined against a single contract.
- **Validation by construction**
  - Every lesson path (CLI, hub-transform, authoring API) validates against the same schemas before any business logic. Invalid data fails fast with schema-driven errors.
- **Types and codegen (optional)**
  - TypeScript types or runtime validators generated from schemas where useful, so the reference implementation cannot drift from the spec without breaking the build or tests.

### 2.2 Benefits

- **Single definition of “valid OLS”** — no ad-hoc checks that drift from the schema.
- **Easier for other implementers** — they can use the same schemas and compare behaviour against AGNI.
- **Reference implementation** — the code that runs is a direct reflection of the published standard.

---

## 3. Functional where it makes sense

### 3.1 What it could mean

- **Pure pipelines**
  - Compiler: `rawYaml → parse → validate(schema) → buildIR → buildArtifact`. Each step is a function: input → output; no hidden mutable state inside the pipeline.
  - LMS: `(state, observation) → newState`; state is copied/updated explicitly rather than mutated in place. Same for theta: “given this index and this graph, here is the ordered list.”
- **Immutable data in core**
  - Lesson IR, sidecar, graph_weights, policy: treated as immutable once built. Updates (e.g. state after an observation) produce new values; persistence is a separate “write” step.
- **Side effects at the edges**
  - I/O (file, network), persistence, and device binding stay at the edges. The core of the compiler, scheduler, and engine remains pure so it’s easy to test and to document as “the OLS behaviour.”

### 3.2 Where it helps

- **Compiler and authoring** — YAML → IR → HTML/JSON is already a pipeline; making it explicitly pure and schema-validated at each step would make the reference behaviour obvious.
- **Theta and LMS** — Scheduling and selection are pure “given inputs, here is the output”; state persistence is a separate concern. Today the engine mutates in-memory state; a refactor could expose “state → event → new state” and keep persistence as a wrapper.
- **Governance** — Policy in, lesson/sidecar in → compliance result out. No hidden state.

### 3.3 Where to be pragmatic

- **Runtime (player)** — Browser, device, sensors; inherently stateful. The goal is not to make the player “functional” but to keep its **contract** with the lesson (steps, gates, thresholds) clear and specified by the schema/IR.
- **Hub and HTTP** — Request/response and I/O are at the edge; the “functional” part is the business logic behind the routes (e.g. “given these params, return this JSON”).

---

## 4. Relation to current codebase

- **Already aligned**  
  - Single canonical IR (`buildLessonIR`); schemas for OLS and graph_weights; services layer; typed API contract. These are steps toward “schema as contract” and clear boundaries.
- **Future refactor**  
  - Gradually move to schema-driven validation and codegen where it pays off; introduce pure pipelines and immutable core data where the change is small and the benefit is high (e.g. compiler path, theta “compute order” function).
- **Not a rewrite**  
  - The vision is to refactor when touching code—not a big-bang rewrite. Prefer incremental steps: e.g. “this module’s public API is now (input) → (output) with no side effects,” or “this route now validates against schema X before calling the engine.”

---

## 4.1 Progress checklist (reference implementation refactor)

| Area | Goal | Status |
|------|------|--------|
| **Schema-based** | OLS, graph_weights, governance-policy validated by schema | Done: lessonSchema uses ols.schema.json (Ajv); policy and graph_weights have schemas and validators |
| **Compiler pipeline** | Pure rawYaml to parse to validate to buildIR; I/O at edges | Done: runCompilePipeline(rawYaml) is pure; CLI/hub do file I/O outside |
| **Governance** | Policy schema + pure (policy, sidecar) to ComplianceResult | Done: governance-policy.schema.json; policy.js validates; compliance is pure |
| **Theta** | Pure (index, graph, student) to ordered lessons | Done: computeLessonOrder, applyRecommendationOverride |
| **LMS engine** | Pure (state, observation) to newState; persistence at edge | Done: applyObservation(state, observation); recordObservation = load then apply then save |
| **Types** | Types aligned with schemas; optional codegen | Done: index.d.ts, LMSObservation; codegen:validate-schemas; **schema-driven codegen** (codegen:types from ols, graph-weights, governance-policy schemas); GovernancePolicy, OlsLessonInput, GraphWeights from generated |
| **Reference boundaries** | Document pure core vs edges | Done: see section 4.2 below |

---

## 4.2 Reference boundaries: pure core vs edges

**Pure core (reference behaviour, testable without I/O):**

- **Compiler:** parseLessonFromString, validateLessonData, buildLessonIR, buildLessonSidecar, runCompilePipeline(rawYaml). Builders take IR and options; I/O is inside builders, input is from the pure pipeline.
- **Governance:** validatePolicy(policy), checkCompliance(policy, sidecar).
- **Theta:** computeLessonOrder(...), applyRecommendationOverride(orderedLessons, overrideLessonId).
- **LMS engine:** applyObservation(state, observation) returns newState. Thompson selectLesson(state, studentId). Federation mergeBanditSummaries(local, remote).

**Edges (I/O, environment, stateful):**

- **CLI:** Reads YAML from disk, writes artifacts; calls compiler service.
- **Hub / HTTP:** Routes load state, call pure core, persist, return JSON.
- **Engine:** loadState/saveState, seedLessons (reads sidecars), recordObservation (applyObservation then save), mergeRemoteSummary (merge then save).
- **Runtime (player):** DOM, sensors, device binding; contract with lesson (steps, gates) is defined by schema/IR.

When adding or changing behaviour, keep logic in the pure core and reserve edges for I/O and wiring.

---

## 5. When to use this document

- **Planning** — When considering a larger refactor of the compiler, engine, or governance, check whether a step could be “more schema-based” or “more functional” and record it here or in the roadmap.
- **Onboarding** — New contributors (and LLMs) can read this to understand where the project is heading and why certain patterns (e.g. pure functions in the compiler, schemas in CI) are preferred.
- **Reference implementation claim** — When we say “AGNI is the reference implementation of OLS,” this document describes the direction we want that to mean: schema-driven, behaviour clear and testable, with side effects at the edges.

---

## 6. References

- **Current schemas:** `schemas/ols.schema.json`, `schemas/graph_weights.schema.json`, **`schemas/governance-policy.schema.json`** (Phase 2)
- **Types:** `packages/types/` (schema-generated: `packages/types/generated/`) (today’s schema-generated for OLS, graph_weights, governance-policy; hand-written for IR, LMS)
- **API contract:** `docs/api-contract.md` (external behaviour; could be schema/OpenAPI later)
- **Sprint plan:** `docs/SPRINT-PLAN.md` — tracks all completed and planned sprints — section “Next sprints with an eye on the refactor” gives a phased order: Phase 1 (lock behaviour: D, E, H), Phase 2 (schema + pure pipelines: K compiler, L governance, M engine), Phase 3 (F, G, N). Use it when planning work that moves toward this vision.
