# Year 2 Prep (Phase 4, Days 96–100)

This document captures **preparation for Year 2**: WYSIWYG editor research and v1.0 spec finalization. It is a living note for maintainers and contributors.

---

## 1. WYSIWYG editor (TipTap and alternatives)

**Goal:** Research an approach for a drag-and-drop GUI that produces valid OLS YAML (the “Editor” in Future Horizons).

### Options to evaluate

| Option | Notes |
|--------|--------|
| **TipTap** | Rich-text editor with extensions; can output structured content. Research: output format (JSON/Markdown), headless usage, licensing. |
| **Slate / Lexical** | Alternative rich-text frameworks; compare extensibility and OLS fit (steps, gates, ontology). |
| **Form-based builder** | Instead of WYSIWYG, a form that builds YAML step-by-step (lesson meta, gate, steps with type + content + threshold). Simpler but less “document-like.” |

### What the editor must support

- **Lesson meta:** identifier, title, description, language, license, authors, subject, tags, audience, time_required, difficulty.
- **Ontology:** requires / provides (skills).
- **Gate:** type (e.g. quiz), question, expected_answer, on_fail, passing_score, retry_delay.
- **Steps:** instruction, hardware_trigger (sensor, threshold, feedback), quiz, etc. For hardware_trigger, threshold syntax must stay valid (see `src/utils/threshold-syntax.js`).
- **Output:** Valid OLS YAML (or JSON that passes `npm run validate` and author API validation).

### Where to record decisions

- Update this section with “Chosen approach: …” and link to a design doc or ADR when decided.
- ROADMAP “Future Horizons” and REFERENCE-IMPLEMENTATION-VISION already mention the Editor and WYSIWYG.

---

## 2. v1.0 spec finalization

**Goal:** Lock the OLS spec so that v1.0 is a clear, stable target for implementers and the reference implementation.

### Current schema and contracts

- **Lesson schema:** `schemas/ols.schema.json` — version 1.7.0 in lessons; required fields, meta, steps, ontology, gate.
- **Graph weights:** `schemas/graph_weights.schema.json` — used by Sentry and theta.
- **Governance policy:** `schemas/governance-policy.schema.json` — policy file shape.
- **API contract:** `docs/api-contract.md` — hub HTTP API (theta, LMS, governance, authoring, override).

### Checklist toward v1.0

- [ ] **Freeze OLS schema** — Decide which schema version is “1.0” and document it (e.g. in SCHEMA_SPEC or a new `docs/spec-v1.md`). Deprecate or version any fields that will change post-1.0.
- [ ] **Document breaking vs additive** — Clarify what changes are breaking (e.g. removing a required field) vs additive (e.g. new optional meta field).
- [ ] **Reference implementation** — AGNI is the reference implementation; ensure `npm run validate`, `npm run test`, and `npm run test:graph` pass and are required for “OLS 1.0 compliant.”
- [ ] **Changelog** — Maintain a CHANGELOG or release notes so downstream and translators see what changed between versions.

### References

- **Schema spec:** `docs/SCHEMA_SPEC.md` (if present); `schemas/ols.schema.json`.
- **Reference implementation vision:** `docs/REFERENCE-IMPLEMENTATION-VISION.md`.
- **Roadmap:** `docs/ROADMAP.md` — Future Horizons, Phase 4.
