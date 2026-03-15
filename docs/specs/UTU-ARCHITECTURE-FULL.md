# UTU Architecture — Full Specification

**Document status:** Canonical architecture for the Unit of Teaching and Learning (UTU) taxonomy system in AGNI.

**Related documents:**
- [utu-architecture.md](utu-architecture.md) — Concise reference
- [GOVERNANCE-ARCHITECTURE.md](../GOVERNANCE-ARCHITECTURE.md) — Governance integration
- [ARCHITECTURE.md](../ARCHITECTURE.md) §8 — Knowledge architecture (UTUs vs ontology)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy and Goals](#2-design-philosophy-and-goals)
3. [The 3D Coordinate Model](#3-the-3d-coordinate-model)
4. [Dimension P: Pedagogical Protocol](#4-dimension-p-pedagogical-protocol)
5. [Dimension S: Disciplinary Spines](#5-dimension-s-disciplinary-spines)
6. [Dimension B: Developmental Bands](#6-dimension-b-developmental-bands)
7. [Canonical Constants and Machine-Readable Data](#7-canonical-constants-and-machine-readable-data)
8. [Schema and Type Definitions](#8-schema-and-type-definitions)
9. [Lifecycle: Authoring to Runtime](#9-lifecycle-authoring-to-runtime)
10. [Governance Integration](#10-governance-integration)
11. [LMS and Adaptive Scheduling](#11-lms-and-adaptive-scheduling)
12. [Pedagogical Archetypes](#12-pedagogical-archetypes)
13. [Failure Modes and Rigor Analysis](#13-failure-modes-and-rigor-analysis)
14. [Portability and Cross-Authority Use](#14-portability-and-cross-authority-use)
15. [Implementation Reference](#15-implementation-reference)
16. [Verification and Guards](#16-verification-and-guards)
17. [Appendix: Full Spine and Protocol Reference](#17-appendix-full-spine-and-protocol-reference)

---

## 1. Executive Summary

The **UTU (Unit of Teaching and Learning)** architecture defines an **Atomic Skill** as a unique triplet **(Spine, Band, Protocol)**. It serves as a:

- **Taxonomy layer** for classifying lessons by subject area, developmental level, and pedagogical approach
- **Governance coordinate system** for curriculum policy, compliance, and cohort coverage
- **Discovery and portability mechanism** for lesson authors and cross-cultural adaptation
- **Feature dimension** for the LMS adaptive engine (bandit, embeddings)

A UTU does **not** determine lesson sequencing. Sequencing is governed by the **ontology layer** (`ontology.requires` / `ontology.provides`). A UTU is a **label on a subgraph** — many skill nodes share the same UTU classification.

| Dimension | Symbol | Values | Role |
|-----------|--------|--------|------|
| Spine | S | MAC-1..8, SCI-1..7, SOC-1..7 | Disciplinary area (math, science, social studies) |
| Band | B | 1–6 | Developmental level (B1–B2 embodied, B3–B4 operational, B5–B6 formal) |
| Protocol | P | 1–5 | Pedagogical phase (P1 Transmission → P5 Meaning Activation) |

**Data schema:** `UTU_Unit = { class | spineId, band, protocol }`

---

## 2. Design Philosophy and Goals

### 2.1 Goals

1. **Portability** — Lessons authored in one culture or authority can be classified and reused elsewhere by preserving Spine coordinates. Cross-cultural semantic constants enable "same coordinate = same kind of reasoning."
2. **Governance without prescription** — Authorities declare targets (e.g. "MAC-2 Band 4 by age 13") and receive aggregate evidence without prescribing specific lessons or representations.
3. **Failure analysis** — Each protocol has a known failure mode. When students underperform, the system can suggest protocol-specific interventions (e.g. P3 Mimicry → require P2 intervention).
4. **Adaptive feature space** — UTU class and band are features in the lesson embedding; the bandit can learn that students who stabilise MAC-3 quickly may need more exposure to MAC-7.
5. **Author discovery** — Authors browse lessons by UTU bucket (e.g. MAC-6 Band 3) and find peer lessons for adaptation.

### 2.2 Non-Goals

- UTUs do **not** replace the ontology prerequisite graph.
- UTUs do **not** map to grade levels or ages directly (band describes cognitive resolution, not birthday).
- UTUs do **not** prescribe lesson content or representation.

---

## 3. The 3D Coordinate Model

### 3.1 Atomic Skill Triplet

An **Atomic Skill** in UTU space is uniquely identified by:

```
(Spine, Band, Protocol)
```

- **Spine** — Which disciplinary reasoning domain (e.g. MAC-2 = Transformation).
- **Band** — Developmental resolution of the learner (B1–B6).
- **Protocol** — Pedagogical operational state (P1–P5), representing where the learner is in the mastery lifecycle.

### 3.2 UTU Label in YAML and JSON

In OLS YAML:

```yaml
meta:
  utu:
    class: "MAC-2"   # Spine ID (alias: spineId)
    band: 4          # Developmental band 1–6
    protocol: 2      # Pedagogical protocol 1–5
```

In schema, both `class` and `spineId` are accepted; `class` is canonical in lesson IR and sidecar.

### 3.3 Bucket Keys (Aggregation Format)

For cohort coverage and reporting, UTU keys are derived as:

| Pattern | Example | When used |
|---------|---------|-----------|
| `{class}` | `MAC-2` | Class only |
| `{class}-B{band}` | `MAC-2-B4` | Class + band |
| `{class}-B{band}-P{protocol}` | `MAC-2-B4-P2` | Full triplet |
| `_no_utu` | — | Lesson has no UTU label |

---

## 4. Dimension P: Pedagogical Protocol

The protocol dimension models the **operational state of the learner** in the lifecycle of deep mastery. Each ordinal is a prerequisite for the next.

### 4.1 Protocol Table

| ID | Short | Name | Cognitive Role | Failure Mode |
|----|-------|------|----------------|--------------|
| 1 | P1 | Transmission | Schema acquisition: high-fidelity data loading and modeling | Passive Familiarity Illusion: recognition without ability to act |
| 2 | P2 | Guided Construction | Conceptual restructuring: merging new data with existing schema | Cognitive Flailing: inquiry without stable P1 buffer |
| 3 | P3 | Apprenticeship | Proceduralization: hard-coding the model into a fluid skill | Mimicry: execution without underlying abstraction |
| 4 | P4 | Dev. Sequencing | Stabilization: matching task complexity to biological bandwidth | Lockstep Stagnation: rigid, non-adaptive pacing |
| 5 | P5 | Meaning Activation | Transfer: deploying the skill in high-stakes, authentic context | Activity without Rigor: high engagement, zero structural output |

### 4.2 Protocol Progression

Instructional design should move learners through **P1 → P2 → P3** (and optionally P4, P5) as mastery deepens. Governance can enforce:

- **allowedProtocols** — Whitelist of permitted protocols (e.g. `[1,2,3]` for rigor).
- **minProtocol** / **maxProtocol** — Bounds for rigor.

When `failureModeHints` is enabled, protocol violations include the failure-mode description from `utu-constants.json` (e.g. "Mimicry: execution without underlying abstraction" for P3).

---

## 5. Dimension S: Disciplinary Spines

Spines are **cross-cultural semantic constants**. Lessons in one culture can be ported to another by preserving Spine coordinates.

### 5.1 Mathematical Spine (MAC)

| ID | Description |
|----|-------------|
| MAC-1 | Quantification: composition, decomposition, conservation of quantity |
| MAC-2 | Transformation: how actions change states while preserving structure |
| MAC-3 | Relation & Structure: meaning as a function of connections/constraints |
| MAC-4 | Representation: translation between external encodings (symbols/tools) |
| MAC-5 | Invariance & Equivalence: what survives change (congruence) |
| MAC-6 | Composition/Decomposition: complexity as structured assembly |
| MAC-7 | Uncertainty & Variation: quantifiable structure within non-fixed outcomes |
| MAC-8 | Justification & Generalization: the study of necessity and proof |

### 5.2 Science Spine (SCI)

| ID | Description |
|----|-------------|
| SCI-1 | System Observation: disciplined noticing as root of knowledge |
| SCI-2 | Pattern Detection: moving from event to expectation via repetition |
| SCI-3 | Model Construction: imagining mechanisms to explain the unseen |
| SCI-4 | Testing & Intervention: strengthening knowledge through interaction |
| SCI-5 | Scale Navigation: relating micro-phenomena to macro-consequences |
| SCI-6 | Uncertainty Management: quantifying reliability and known-ness of claims |
| SCI-7 | Knowledge Revision: self-correction and being "less wrong" |

### 5.3 Social Studies Spine (SOC)

| ID | Description |
|----|-------------|
| SOC-1 | Collective Organization: solving coordination via roles and norms |
| SOC-2 | Resource Exchange: negotiated allocation of value and scarcity |
| SOC-3 | Authority & Legitimacy: justification and contestation of power |
| SOC-4 | Cultural Expression: meaning systems that stabilize group identity |
| SOC-5 | Historical Continuity: reconstructing the past to guide action |
| SOC-6 | Human–Environment Interaction: co-evolution of culture and landscape |
| SOC-7 | Perspective Taking: social truth is multi-voiced |

### 5.4 Canonical Spine ID List

```
MAC-1, MAC-2, MAC-3, MAC-4, MAC-5, MAC-6, MAC-7, MAC-8
SCI-1, SCI-2, SCI-3, SCI-4, SCI-5, SCI-6, SCI-7
SOC-1, SOC-2, SOC-3, SOC-4, SOC-5, SOC-6, SOC-7
```

Schema allows any string for `class`/`spineId` to support future spines; validation warns if not in the canonical list.

---

## 6. Dimension B: Developmental Bands

Bands model the **processor resolution** of the learner (B1–B6).

### 6.1 Band Phases

| Band | Phase |
|------|-------|
| B1–B2 | Embodied/Representational: action-based and iconic reasoning |
| B3–B4 | Operational/Structural: procedural mastery moving to abstract relations |
| B5–B6 | Hypothetical/Formal: systemic modeling and epistemic validation |

### 6.2 Band Interpretation

- Band describes **cognitive demand**, not age or grade.
- Authors must justify band based on cognitive demand, not calendar.
- Governance can target bands (e.g. "MAC-2 Band 4 by cohort") for coverage reporting.
- When `enforceUtuTargets` is true, pathfinder excludes lessons whose UTU band does not match any policy target (unless overridden via catalog).

---

## 7. Canonical Constants and Machine-Readable Data

### 7.1 File Location

**Path:** `data/utu-constants.json`  
**Env override:** `AGNI_UTU_CONSTANTS` (e.g. `{DATA_DIR}/utu-constants.json`)

### 7.2 Structure

```json
{
  "version": "1.0",
  "description": "Canonical UTU constants for authoring and governance.",
  "protocols": [
    {
      "id": 1,
      "name": "Transmission",
      "short": "P1",
      "cognitiveRole": "...",
      "failureMode": "Passive Familiarity Illusion: ..."
    }
  ],
  "spines": {
    "MAC": {
      "name": "Mathematical Spine",
      "ids": ["MAC-1", "MAC-2", ...],
      "items": [{ "id": "MAC-1", "description": "..." }]
    },
    "SCI": { ... },
    "SOC": { ... }
  },
  "spineIds": ["MAC-1", "MAC-2", ...],
  "bands": [
    { "id": 1, "phase": "Embodied/Representational: ..." },
    ...
  ]
}
```

### 7.3 Consumers

- **Authoring UIs** — Dropdowns, validation, tooltips
- **Governance** — Spine validation, protocol failure-mode hints
- **API** — `GET /api/governance/utu-constants` returns this file (Bearer auth)

---

## 8. Schema and Type Definitions

### 8.1 OLS Meta (YAML Source)

**Schema:** `schemas/ols.schema.json` → `meta.properties.utu`

```json
{
  "utu": {
    "type": "object",
    "properties": {
      "class": { "type": "string" },
      "spineId": { "type": "string" },
      "band": { "type": "integer", "minimum": 1, "maximum": 6 },
      "protocol": { "type": "integer", "minimum": 1, "maximum": 5 }
    }
  }
}
```

### 8.2 Lesson Sidecar / IR

**Schema:** `schemas/lesson-sidecar.schema.json` → `$defs/UTULabel`

```json
{
  "UTULabel": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "class": { "type": "string" },
      "band": { "type": "number", "minimum": 1, "maximum": 6 },
      "protocol": { "type": "number", "minimum": 1, "maximum": 5 }
    }
  }
}
```

### 8.3 Governance Policy (UTU Targets)

**Schema:** `schemas/governance-policy.schema.json`

| Field | Type | Description |
|-------|------|-------------|
| `utuTargets` | `Array<{ class, band, protocol? }>` | Target coordinates; each target has required `class` and `band`, optional `protocol`. |
| `requireUtu` | `boolean` | Lessons must have `meta.utu.class`. |
| `enforceUtuTargets` | `boolean` | Pathfinder excludes lessons whose UTU does not match any target (override via catalog). |
| `allowedProtocols` | `number[]` | Permitted protocols (P1–P5). |
| `minProtocol` / `maxProtocol` | `number` | Rigor bounds. |
| `failureModeHints` | `boolean` | Include failure-mode hint when protocol check fails. |

### 8.4 Approved Catalog (UTU Overrides)

**Schema:** `schemas/approved-catalog.schema.json`

| Field | Type | Description |
|-------|------|-------------|
| `utuBandOverrides` | `Record<string, { at, reason? }>` | Lesson IDs that remain eligible despite band mismatch when `enforceUtuTargets` is true. `at` is ISO8601; `reason` is optional. |

---

## 9. Lifecycle: Authoring to Runtime

### 9.1 Authoring

1. **YAML meta** — Author sets `meta.utu` in OLS YAML.
2. **Spine picker** — Portal/author UI uses `utu-constants.json` for dropdowns.
3. **Validation** — `packages/ols-schema/lesson-schema.js` validates:
   - `band` 1–6, `protocol` 1–5
   - Spine ID in canonical list (warning if not)
4. **Compiler** — `buildLessonIR` passes `utu` through to IR and sidecar.

### 9.2 Compilation

- `packages/ols-compiler` emits `index-ir.json` (sidecar) with `utu` intact.
- Sidecar is the source of truth for theta, governance, and hub.

### 9.3 Lesson Index

`packages/agni-hub/pathfinder.js` → `rebuildLessonIndex()` builds lesson index from sidecars:

```javascript
{
  lessonId, slug, title, description, difficulty, language,
  utu: sidecar.utu || null,
  teaching_mode: sidecar.teaching_mode || null,
  subject: (sidecar.utu && sidecar.utu.class) || '',
  skillsProvided, skillsRequired,
  inferredFeatures, ...
}
```

### 9.4 Runtime

- **Navigator** (`packages/agni-runtime/engine/navigator.js`) — `applyTeachingModeFilter` re-weights lessons by `teaching_mode` and `utu_protocol` when `opts.utuSpine` or `opts.utuProtocol` are provided.
- **Pathfinder** — Filters by UTU targets when `enforceUtuTargets` is true.

---

## 10. Governance Integration

### 10.1 Compliance Evaluation

**Function:** `evaluateLessonCompliance(sidecar, policy, opts?) → { status, issues }`

**UTU-related rules:**

| Rule | Condition | Severity |
|------|-----------|----------|
| Require UTU | `requireUtu` and no `sidecar.utu.class` | warning |
| Spine portability | `utu.class` not in canonical list | warning |
| UTU target match | `requireUtu` and UTU doesn't match any `utuTargets` | fail |
| Allowed protocols | `utu.protocol` not in `allowedProtocols` | fail |
| Min/max protocol | `utu.protocol` outside bounds | fail |
| Protocol failure hint | When `failureModeHints` and protocol fails | warning (added) |

### 10.2 Scheduling Filter

**Function:** `lessonPassesUtuTargets(lesson, policy, opts?) → boolean`

Used by pathfinder when `enforceUtuTargets` is true.

- Returns `true` if policy does not enforce UTU targets.
- Returns `true` if lesson ID is in `opts.utuBandOverrideLessonIds` (from catalog `utuBandOverrides`).
- Returns `false` if lesson has no UTU or `utu.class` missing.
- Returns `true` if lesson's UTU matches any target (class, band, protocol if specified).

**Pure function** — no I/O; used in pathfinder hot path.

### 10.3 Cohort Coverage

**Function:** `aggregateCohortCoverage(lessonIndex, masterySummary, policy?)`

**Output:** `{ byUtu, bySkill, studentCount, lessonCount }`

- `byUtu` — `Record<utuKey, { lessons, skills, studentMasteryCount }>`
- UTU keys: `{class}`, `{class}-B{band}`, or `{class}-B{band}-P{protocol}`; lessons without UTU use `_no_utu`.
- Mastery threshold: `envConfig.masteryThreshold` (default 0.6).

### 10.4 Pathfinder Filter Pipeline

In `getLessonsSortedByPathfinder`:

1. Load catalog.
2. If `catalog.lessonIds.length > 0`, filter to approved set.
3. If `policy.enforceUtuTargets` and `policy.utuTargets.length > 0`:
   - Build `overrideIds` from `Object.keys(catalog.utuBandOverrides || {})`.
   - Filter with `lessonPassesUtuTargets(l, policy, { utuBandOverrideLessonIds: overrideIds })`.
4. Remaining candidates go to theta for skill-graph ordering.

---

## 11. LMS and Adaptive Scheduling

### 11.1 Lesson Embedding Features

UTU class and band are features in the lesson embedding vector. The bandit can learn correlations (e.g. students who stabilise MAC-3 quickly may need more MAC-7 exposure).

### 11.2 Navigator Re-weighting

`applyTeachingModeFilter(scoredLessons, opts)` adjusts theta scores by:

- **teaching_mode** — Match → +0.15; related mode → +0.05; mismatch → -0.05.
- **utu_spine** — Lesson ontology skills contain spine prefix → +0.1.
- **utu_protocol** — Match → +0.08.

### 11.3 Boundary with Ontology

- **UTU** — Taxonomy label; governance, discovery, LMS features.
- **Ontology** — Sequencing; `requires`/`provides` govern eligibility and prerequisite gates.
- UTU does **not** affect lesson order within the skill graph.

---

## 12. Pedagogical Archetypes

### 12.1 Archetype–UTU Mapping

Archetypes in `data/archetypes.json` define coherent clusters of UTU band, protocol, Bloom's level, VARK, and teaching mode. Each archetype has:

- `bandRange` — Inclusive [min, max] UTU band.
- `protocols` — UTU protocols (e.g. `[1]`, `[2,3]`).

### 12.2 Core Archetypes (Band × Protocol)

| Band | P1 | P2 | P3 | P4 | P5 |
|------|----|----|----|----|-----|
| B1–B2 | sensory-intake | embodied-discovery | motor-apprenticeship | embodied-sequencing | concrete-transfer |
| B3–B4 | procedural-intake | structural-construction | procedural-fluency | relational-sequencing | applied-problem-solving |
| B5–B6 | formal-schema | hypothesis-testing | formal-practice | systematic-consolidation | authentic-transfer |

### 12.3 Specialty Archetypes

Include: sensor-lab, socratic-dialogue, narrative-journey, cross-domain-bridge, scaffolded-retry, peer-collaborative, rapid-diagnostic, design-challenge, multi-modal-synthesis.

### 12.4 Archetype Match

`packages/agni-utils/archetype-match.js` — `computeFitScore(features, archetype)` uses band and protocol from `lesson.utu` (or `lesson.meta.utu`). Coherence score feeds theta modifier and compiler warnings.

---

## 13. Failure Modes and Rigor Analysis

### 13.1 Failure Mode Table

Each protocol has a documented failure mode. When students show the failure pattern, the system can suggest protocol-specific intervention:

| Protocol | Failure Mode | Intervention Hint |
|----------|--------------|--------------------|
| P1 | Passive Familiarity Illusion | Ensure active application, not just recognition |
| P2 | Cognitive Flailing | Ensure P1 schema is stable before inquiry |
| P3 | Mimicry | Require P2 conceptual restructuring |
| P4 | Lockstep Stagnation | Introduce adaptive pacing |
| P5 | Activity without Rigor | Ensure structural output, not just engagement |

### 13.2 Governance Failure-Mode Hints

When `failureModeHints` is true and a protocol check fails, `evaluateLessonCompliance` appends a warning with the failure-mode text from `utu-constants.json`.

---

## 14. Portability and Cross-Authority Use

### 14.1 Spine as Portable Constant

Spine IDs are designed as cross-cultural constants. A lesson authored for Culture A with `class: "MAC-2"` describes the same kind of reasoning in Culture B. Authorities can:

1. Import catalogs from other authorities.
2. Set `utuTargets` to match regional standards.
3. Use `utuBandOverrides` for lessons that don't match but are approved by exception.

### 14.2 Schema Extensibility

- `class`/`spineId` accept any string; validation warns if not canonical.
- New spines can be added to `utu-constants.json` and `spineIds` list without schema change.
- New bands or protocols would require schema and constants update.

---

## 15. Implementation Reference

### 15.1 Package Locations

| Component | Location |
|-----------|----------|
| UTU constants | `data/utu-constants.json` |
| Compliance | `packages/agni-governance/evaluateLessonCompliance.js` |
| Coverage | `packages/agni-governance/aggregateCohortCoverage.js` |
| Lesson index | `packages/agni-hub/pathfinder.js` → `rebuildLessonIndex` |
| Pathfinder filter | `packages/agni-hub/pathfinder.js` → `getLessonsSortedByPathfinder` |
| OLS validation | `packages/ols-schema/lesson-schema.js` |
| Navigator filter | `packages/agni-runtime/engine/navigator.js` → `applyTeachingModeFilter` |
| Archetype match | `packages/agni-utils/archetype-match.js` |
| Config | `packages/agni-utils/env-config.js` → `utuConstantsPath` |

### 15.2 HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/governance/utu-constants` | Bearer | UTU constants from `utu-constants.json` |
| GET | `/api/governance/archetypes` | Bearer | Archetypes; query `?band=&protocol=` for filtering |
| POST | `/api/governance/compliance` | Bearer | Evaluate compliance (body: sidecar JSON) |

### 15.3 Pure vs I/O

**Pure (no I/O):**

- `lessonPassesUtuTargets(lesson, policy, opts)` when `opts.utuConstants` provided
- `evaluateLessonCompliance(sidecar, policy, opts)` when `opts.utuConstants` provided
- `aggregateCohortCoverage(lessonIndex, masterySummary, policy)`

**I/O:**

- `evaluateLessonCompliance` — loads `utu-constants.json` when `opts.utuConstants` not provided
- `loadPolicy`, `loadCatalog` — file read

---

## 16. Verification and Guards

### 16.1 Validation

- **OLS schema** — `meta.utu.band` 1–6, `meta.utu.protocol` 1–5.
- **Lesson schema** — `lesson-schema.js` validates UTU and emits warnings for non-canonical spine IDs.
- **Governance** — Policy schema validates `utuTargets`, `allowedProtocols`, `minProtocol`, `maxProtocol`.

### 16.2 Tests

- `tests/unit/governance.test.js` — Compliance, `lessonPassesUtuTargets`, coverage, UTU target matching.
- `tests/unit/lesson-validator.test.js` — UTU protocol and band range validation.

### 16.3 CI

- `verify:all` includes governance-related checks.

---

## 17. Appendix: Full Spine and Protocol Reference

### A. Protocols (P1–P5)

| ID | Name | Cognitive Role | Failure Mode |
|----|------|----------------|--------------|
| 1 | Transmission | Schema acquisition: high-fidelity data loading and modeling | Passive Familiarity Illusion |
| 2 | Guided Construction | Conceptual restructuring: merging new data with existing schema | Cognitive Flailing |
| 3 | Apprenticeship | Proceduralization: hard-coding the model into a fluid skill | Mimicry |
| 4 | Dev. Sequencing | Stabilization: matching task complexity to biological bandwidth | Lockstep Stagnation |
| 5 | Meaning Activation | Transfer: deploying the skill in high-stakes, authentic context | Activity without Rigor |

### B. Spines (22 IDs)

**MAC:** MAC-1, MAC-2, MAC-3, MAC-4, MAC-5, MAC-6, MAC-7, MAC-8  
**SCI:** SCI-1, SCI-2, SCI-3, SCI-4, SCI-5, SCI-6, SCI-7  
**SOC:** SOC-1, SOC-2, SOC-3, SOC-4, SOC-5, SOC-6, SOC-7

### C. Bands (B1–B6)

- **B1–B2:** Embodied/Representational
- **B3–B4:** Operational/Structural
- **B5–B6:** Hypothetical/Formal

---

*End of UTU Architecture — Full Specification*
