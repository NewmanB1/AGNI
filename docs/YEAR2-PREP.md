# Year 2 Prep (Phase 4, Days 96–100)

This document captures **preparation for Year 2**: WYSIWYG editor research and v1.0 spec finalization. It is a living note for maintainers and contributors.

---

## 1. WYSIWYG editor (TipTap and alternatives)

**Goal:** Research an approach for a drag-and-drop GUI that produces valid OLS YAML (the "Editor" in Future Horizons).

### Options evaluated

| Option | Notes |
|--------|--------|
| **TipTap** | Rich-text editor with extensions; can output structured content. Research: output format (JSON/Markdown), headless usage, licensing. |
| **Slate / Lexical** | Alternative rich-text frameworks; compare extensibility and OLS fit (steps, gates, ontology). |
| **Form-based builder** | Instead of WYSIWYG, a form that builds YAML step-by-step (lesson meta, gate, steps with type + content + threshold). Simpler but less "document-like." |

### What the editor must support

- **Lesson meta:** identifier, title, description, language, license, authors, subject, tags, audience, time_required, difficulty.
- **Ontology:** requires / provides (skills).
- **Gate:** type (e.g. quiz), question, expected_answer, on_fail, passing_score, retry_delay.
- **Steps:** instruction, hardware_trigger (sensor, threshold, feedback), quiz, etc. For hardware_trigger, threshold syntax must stay valid (see `src/utils/threshold-syntax.js`).
- **Output:** Valid OLS YAML (or JSON that passes `npm run validate` and author API validation).

### Decision: Form-based builder with structured preview (E1)

**Chosen approach: Form-based builder (hybrid).**

After evaluating all three options against AGNI's constraints, the form-based builder wins on every axis that matters for this project:

| Criterion | TipTap / Slate / Lexical | Form-based builder |
|-----------|--------------------------|-------------------|
| **Offline operation** | Large runtime (~200 KB+), CDN fonts | Zero extra deps; works with current Svelte/Vite stack |
| **OLS fidelity** | Rich-text to YAML is lossy; steps, gates, thresholds have no natural rich-text mapping | 1:1 mapping from form fields to OLS YAML nodes |
| **Threshold syntax** | Custom node/plugin for each sensor expression | Plain input validated via `POST /api/author/validate` |
| **Gate / ontology** | Awkward to model as document blocks | Natural as form sections |
| **Complexity budget** | New dependency tree, custom schema, serializer | Svelte forms + existing `js-yaml` |
| **Accessibility** | Editor a11y is notoriously hard | Standard form controls work out of the box |

**Why not TipTap?**
TipTap excels at document-like content (blog posts, notes). OLS lessons are structured records (meta + ordered steps + gate + ontology), not flowing prose. Mapping structured YAML to a rich-text document model requires custom nodes for every step type, gate fields, and threshold expressions — essentially rebuilding the form inside TipTap with worse a11y and a larger bundle.

**Why not pure YAML textarea?**
A raw YAML editor gives maximum flexibility but no guardrails. Authors would need to know the schema. The form approach adds guardrails (dropdowns for step type, sensor picker for thresholds, Spine/Band picker for UTU) while still outputting valid YAML.

**Implementation plan (Sprints 4–5):**

1. **E2 — Meta form:** `/author/new` route with fields for identifier, title, language, UTU (Spine picker, Band, Protocol), difficulty, description, tags.
2. **E3 — Step editor:** Add/remove/reorder steps. Each step is a card with type selector (instruction, hardware_trigger, quiz) and type-specific fields. `hardware_trigger` gets sensor dropdown + threshold input validated on blur.
3. **E4 — Preview:** "Preview" button sends the assembled JSON to `POST /api/author/preview` and shows IR/sidecar in a panel or new tab.
4. **E5 — Save:** "Save" calls `POST /api/author/save`; success toast with slug and path.
5. **E6–E8 — Gate, ontology, all step types:** Form sections for gate, skill requires/provides, quiz answer options.
6. **E9 — YAML round-trip:** Load existing YAML via `GET /api/lessons` then select, fetch, populate form, edit, save.

**Stack:** Svelte 5 forms + `js-yaml` (already a dependency) + existing hub author API (`validate`, `preview`, `save`). No new npm dependencies required for the editor itself.

---

## 2. v1.0 spec finalization

**Goal:** Lock the OLS spec so that v1.0 is a clear, stable target for implementers and the reference implementation.

### Current schema and contracts

- **Lesson schema:** `schemas/ols.schema.json` — version 1.7.0 in lessons; required fields, meta, steps, ontology, gate.
- **Graph weights:** `schemas/graph_weights.schema.json` — used by Sentry and theta.
- **Governance policy:** `schemas/governance-policy.schema.json` — policy file shape.
- **API contract:** `docs/api-contract.md` — hub HTTP API (theta, LMS, governance, authoring, override).

### Checklist toward v1.0

- [ ] **Freeze OLS schema** — Decide which schema version is "1.0" and document it (e.g. in `schemas/ols.schema.json` or a new `docs/spec-v1.md`). Deprecate or version any fields that will change post-1.0.
- [ ] **Document breaking vs additive** — Clarify what changes are breaking (e.g. removing a required field) vs additive (e.g. new optional meta field).
- [ ] **Reference implementation** — AGNI is the reference implementation; ensure `npm run validate`, `npm run test`, and `npm run test:graph` pass and are required for "OLS 1.0 compliant."
- [ ] **Changelog** — Maintain a CHANGELOG or release notes so downstream and translators see what changed between versions. (Deferred until first tagged release; can be auto-generated from git tags.)

### References

- **Schema spec:** `schemas/ols.schema.json`.
- **Reference implementation vision:** `docs/REFERENCE-IMPLEMENTATION-VISION.md`.
- **Roadmap:** `docs/ROADMAP.md` — Future Horizons, Phase 4.
