# Open Lesson Standard (OLS) v1.0 Spec

**Status:** Frozen for v1.0.  
**Target:** Schema and contracts locked; v1.0 is a stable target for implementers. See `docs/SCHEMA-FREEZE.md`.

---

## 1. Overview

The Open Lesson Standard (OLS) defines a YAML-based format for offline, sensor-rich, culturally adaptive lessons. The AGNI reference implementation compiles OLS YAML to single-file HTML bundles that run on resource-constrained devices (Android 6+, Chrome 51+).

**v1.0 scope:**
- Lesson schema (metadata, steps, ontology, gate)
- IR and sidecar formats
- Graph weights schema (Sentry/theta)
- Hub API contract (theta, LMS, governance, authoring)

---

## 2. Schema Versions (Frozen for v1.0)

| Artifact | Version | Location |
|----------|---------|----------|
| OLS lesson schema | **1.8.0** | `schemas/ols.schema.json` |
| Lesson IR schema | — | `schemas/lesson-ir.schema.json` |
| Lesson sidecar schema | — | `schemas/lesson-sidecar.schema.json` |
| Graph weights schema | 1.7.0 | `schemas/graph-weights.schema.json` |
| Governance policy schema | — | `schemas/governance-policy.schema.json` |

**Frozen fields for v1.0:** The `required` arrays and top-level structure of these schemas are stable. New optional fields may be added post-1.0; see `docs/BREAKING-VS-ADDITIVE.md`.

---

## 3. Lesson Structure

```yaml
version: "1.8.0"
meta:
  identifier: "ols:physics:gravity_v1"
  title: "Understanding Gravity"
  language: "en"
  license: "CC-BY-4.0"
  created: "2024-01-15T00:00:00Z"
steps:
  - type: instruction
    content: "Drop your phone to unlock the next step."
  - type: hardware_trigger
    sensor: "freefall"
    threshold: "> 0.2s"
    feedback: "Great!"
ontology:
  provides: [{ skill: "ols:physics:gravity", declaredLevel: 1 }]
  requires: []
gate:
  type: quiz
  question: "What did you observe?"
  expected_answer: "The phone fell."
```

- **Required:** `version`, `meta` (identifier, title, language, license, created), `steps`
- **Optional:** `ontology`, `gate`, `inferredFeatures`, `utu`, `teaching_mode`
- **Step types:** `instruction`, `hardware_trigger`, `quiz`, `completion`, `fill_blank`, `matching`, `ordering`

---

## 4. Hub API Contract

See `docs/api-contract.md`. Key endpoints:
- `GET /api/pathfinder?pseudoId=` — Lesson order by MLC
- `POST /api/telemetry` — Completion events
- `GET /api/lms/select` — Bandit lesson selection
- `POST /api/author/validate`, `preview`, `save` — Authoring

---

## 5. Reference Implementation Compliance

**OLS 1.0 compliant** means:
- `npm run validate` passes (schema validation)
- `npm run test` passes (unit tests)
- `npm run test:graph` passes (θ behavior)
- `npm run verify:all` passes (architectural guards)

AGNI is the reference implementation. See `docs/REFERENCE-IMPLEMENTATION-VISION.md` §4.3.

---

## 6. Related Specs

- **Threshold grammar:** `docs/specs/threshold_grammar.md` — sensor expressions (`freefall > 0.2s`, etc.)
- **UTU architecture:** `docs/specs/utu-architecture.md` — cultural adaptation taxonomy
