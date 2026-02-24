# Next Development Sprint — Task List

Prioritized tasks for the next sprint, drawn from ROADMAP.md, ARCHITECTURE-EVALUATION.md, and ARCHITECTURE.md refactoring recommendations. Pick by priority and capacity.

---

## P0 — High impact, closes “prove θ” / cultural adaptation

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
| 16 | **Graph verification test** | ROADMAP Day 91–95 | Simulate “Weaver Cohort” vs “Farmer Cohort” (e.g. different mastery inputs); confirm lesson menu order differs by cohort using the same content. Proves θ behaviour. |
| 17 | **Export/import and sneakernet (optional)** (Done Backlog) | ROADMAP Day 41–45 | Gzip + Base45 compression; “Export Progress” (e.g. QR); “Import Progress” (parse + merge). Lower priority unless field deployment needs it soon. |

---

## Suggested sprint focus

- **Sprint A (prove θ + ecosystem):** 1, 2, 3, (optional 16).  
- **Sprint B (content + quality):** 4, 5, 6, 15.  
- **Sprint C (authoring):** 8, 9, 10.  
- **Backlog (when touching code):** 7, 11, 12, 13, 14, 17. *(Done: 7, 11, 12, 13, 14, 17.)*

Update ROADMAP.md and ARCHITECTURE.md as items are completed.
