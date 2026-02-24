## AGNI Modules Overview

This document describes the **top-level modules** in the AGNI / OLS implementation.  
It is intentionally high-level and focused on **entrypoints and responsibilities**, so humans and LLMs can navigate the codebase without loading every file.

---

## 1. Compiler

- **Purpose**
  - Transform OLS YAML lessons into a canonical **Intermediate Representation (IR)** and concrete artifacts (HTML, native bundles).
- **Key files**
  - `src/cli.js` — CLI entrypoint (`bin: "agni"`).
  - `src/compiler/buildLessonIR.js` — IR + sidecar builder.
  - `src/builders/html.js` — HTML + sidecar + runtime assets.
  - `src/builders/native.js` — Native bundle layout.
  - `src/config.js` — Markdown + math pipeline.
  - `src/utils/featureInference.js` — feature and factory inference.
- **Primary responsibilities**
  - Read and validate YAML (with `js-yaml` and schemas).
  - Run feature inference and build IR/sidecar.
  - Emit artifacts for the runtime and hub/theta/LMS engine.

---

## 2. Runtime

- **Purpose**
  - Execute compiled lessons on devices (browser/WebView), handling sensors, visuals, navigation and integrity.
- **Key files**
  - `src/runtime/shared-runtime.js` — global backbone (`AGNI_SHARED`).
  - `src/runtime/sensor-bridge.js` — sensor abstraction.
  - `src/runtime/svg-stage.js` and `src/runtime/svg-factories*.js` — SVG visual system.
  - `src/runtime/svg-registry.js` — spec → factory dispatch.
  - `src/runtime/table-renderer.js` — tabular visuals.
  - `src/runtime/player.js` — lesson player state machine.
- **Primary responsibilities**
  - Load runtime modules based on the **factory manifest**.
  - Verify (or eventually verify) signing and device binding.
  - Manage step lifecycle, sensor subscriptions, and navigation.

---

## 3. LMS Engine

- **Purpose**
  - Provide adaptive lesson selection given theta’s prerequisite-filtered candidate set.
- **Key files**
  - `src/engine/index.ts` — public API for the engine.
  - `src/engine/rasch.js` — Rasch ability model.
  - `src/engine/embeddings.js` — student/lesson embeddings.
  - `src/engine/thompson.js` — linear Thompson bandit.
  - `src/engine/federation.js` — bandit summary export/merge.
  - `src/engine/math.js` — linear algebra helpers.
  - `src/types/index.d.ts` — `LMSState`, `BanditSummary` and related types.
- **Primary responsibilities**
  - Maintain `LMSState` on disk (`data/lms_state.json`).
  - Seed lessons and track student ability.
  - Select the next lesson and update bandit parameters.
  - Export and merge summaries for federated learning.

---

## 4. Hub Services

- **Purpose**
  - Serve lessons and runtime assets over HTTP, and provide an integration surface for theta, portal, and governance.
- **Key files**
  - `server/hub-transform.js` — YAML → PWA transform + caching; uses `services/lessonAssembly` for the script block.
  - `server/manifest.json`, `server/sw.js`, `server/pwa/*` — PWA shell and service worker.
  - `hub-tools/theta.js` — lesson graph, eligibility, and governance HTTP routes (`/api/governance/report`, `/api/governance/policy`, `/api/governance/compliance`).
  - `hub-tools/sentry.js` — skill collapse graph maintenance.
  - `hub-tools/sync.js` — bandit summary sync.
- **Primary responsibilities**
  - Resolve YAML by slug and compile on demand.
  - Serve PWA shells, KaTeX CSS, and runtime factories.
  - Build and maintain the skill graph and lesson index.
  - Coordinate LMS engine and governance service calls; expose governance APIs for the portal.

---

## 5. Governance

- **Purpose**
  - Model governance constraints (UTUs, teaching_mode, coverage targets) as data and services separate from lesson content and scheduling.
- **Key files**
  - `src/governance/index.js` — public API.
  - `src/governance/policy.js` — load policy from JSON (e.g. `data/governance_policy.json` or `AGNI_GOVERNANCE_POLICY`).
  - `src/governance/evaluateLessonCompliance.js` — per-lesson compliance (utu, teaching_mode, difficulty).
  - `src/governance/aggregateCohortCoverage.js` — cohort coverage by UTU and skill.
  - `src/services/governance.js` — service layer (loadPolicy, evaluateLessonCompliance, aggregateCohortCoverage).
- **Responsibilities**
  - Evaluate lessons against a JSON-driven policy (requireUtu, allowedTeachingModes, etc.).
  - Aggregate cohort coverage for reporting (by UTU bucket and by skill).
  - Policy is versioned data; no governance logic hard-coded in lesson or scheduler code.

---

## 6. Portal

- **Purpose**
  - Teacher- and operator-facing UI for monitoring cohorts, recommendations, and governance progress.
- **Key files**
  - `portal/src/routes/+page.svelte` — main Teacher Hub screen.
  - `portal/src/lib/api.ts` — typed Hub API client (theta, LMS, lesson sidecar, governance); use `VITE_HUB_URL` to point at the hub.
  - `portal/src/lib/mockData.ts` — mock data when hub is not used.
  - `portal/vite.config.ts`, `portal/svelte.config.js` — SvelteKit + PWA config.
- **Primary responsibilities**
  - Present class, student, and governance views.
  - Let teachers inspect and (in future) override recommendations.
  - Consume hub APIs via `api.ts` only; see `docs/api-contract.md` for the contract. No direct use of engine/compiler internals.

---

## 7. Authoring / WYSIWYG Builder (Planned)

- **Purpose**
  - Provide a visual lesson builder that produces valid OLS YAML and metadata (including teaching mode and governance tags).
- **Planned integration points**
  - Authoring APIs on the hub:
    - `compileLessonFromYaml` / preview endpoints.
    - Validation endpoints backed by JSON Schemas.
    - Governance-feedback endpoints (intent vs inferred checks).
- **Intended responsibilities**
  - Maintain an internal structured lesson model.
  - Emit YAML + metadata aligned with `src/types/LessonIR` and schemas.
  - Never embed compiler logic; always call compiler/validation services.

---

## 8. Shared Types and Schemas

- **Purpose**
  - Provide a **single source of truth** for data contracts across modules.
- **Key files**
  - `src/types/index.d.ts` — IR, inferred features, and LMS engine types.
  - `schemas/*.json` — OLS YAML and IR JSON Schemas.
- **Primary responsibilities**
  - Define the shapes of `LessonIR`, `LessonSidecar`, `InferredFeatures`, and `LMSState`.
  - Keep compiler, runtime, hub, engine, portal, and authoring tools in sync.

