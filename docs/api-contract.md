# Hub API Contract

This document describes the **HTTP API** exposed by the AGNI hub (theta + hub-transform). The portal and future WYSIWYG builder should consume only these endpoints and the types below; no direct access to engine or compiler internals.

**Base URL:** Typically `http://<hub-host>:8082` when theta and hub-transform run together (`AGNI_THETA_PORT`, default 8082). Lesson delivery uses the same origin.

---

## 1. Theta (scheduling)

### GET /api/theta

Returns lessons for a student sorted by Marginal Learning Cost (theta).

| Query      | Type   | Required | Description        |
|-----------|--------|----------|--------------------|
| `pseudoId`| string | yes      | Student pseudo-ID  |

**Response 200**

```json
{
  "pseudoId": "string",
  "lessons": [
    {
      "lessonId": "string",
      "slug": "string",
      "title": "string",
      "theta": "number",
      "baseCost": "number",
      "residualFactor": "number",
      "transferBenefit": "number",
      "alreadyMastered": "boolean",
      "skillsProvided": [{ "skill": "string", "declaredLevel": "number" }],
      "skillsRequired": ["string"]
    }
  ],
  "computedAt": "ISO8601",
  "cached": "boolean",
  "graphSource": "string"
}
```

**Errors:** 400 (missing pseudoId), 405 (method not allowed).

---

### GET /api/theta/all

Returns theta-sorted lessons for all students in the mastery summary.

**Response 200**

```json
{
  "students": { "<pseudoId>": [ /* same lesson shape as /api/theta */ ] },
  "computedAt": "ISO8601"
}
```

---

### GET /api/theta/graph

Returns the effective graph weights (local or regional) used for theta.

**Response 200**

```json
{
  "edges": [{ "from": "string", "to": "string", "weight": "number", "confidence": "number" }],
  "sample_size": "number",
  "default_weight": "number",
  "level": "string"
}
```

---

## 2. LMS (adaptive selection)

### GET /api/lms/select

Selects the best lesson for a student from a theta-eligible candidate set (bandit).

| Query        | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| `pseudoId`  | string | yes      | Student pseudo-ID                    |
| `candidates`| string | yes      | Comma-separated lesson IDs           |

**Response 200**

```json
{
  "pseudoId": "string",
  "selected": "string | null",
  "ability": { "ability": "number", "variance": "number" } | null,
  "candidates": "number"
}
```

**Errors:** 400 (missing params), 503 (LMS engine not available), 500.

---

### POST /api/lms/observation

Records a completed lesson and updates Rasch, embeddings, and bandit.

**Request body**

```json
{
  "studentId": "string",
  "lessonId": "string",
  "probeResults": [{ "probeId": "string", "correct": "boolean" }]
}
```

**Response 200** `{ "ok": true }`

**Errors:** 400 (missing/invalid body), 503, 500.

---

### GET /api/lms/status

Engine diagnostic snapshot (student count, lesson count, observations, embedding dim, state path).

**Response 200**

```json
{
  "students": "number",
  "lessons": "number",
  "probes": "number",
  "observations": "number",
  "embeddingDim": "number",
  "featureDim": "number",
  "statePath": "string"
}
```

**Errors:** 503 if LMS not available.

---

### POST /api/lms/federation/merge

Merges a remote bandit summary into the local hub (federation sync).

**Request body:** `BanditSummary`

```json
{
  "mean": ["number"],
  "precision": ["number[]"],
  "sampleSize": "number"
}
```

**Response 200** `{ "ok": true, "status": { /* getLmsStatus shape */ } }`

**Errors:** 400 (invalid body), 503, 500.

---

## 3. Lesson delivery (hub-transform)

Served on the same origin as the theta API when hub-transform is attached.

### GET /lessons/:slug

Returns compiled lesson HTML (PWA shell). Optional query/headers for device binding.

**Response 200:** HTML document.

**Response 404:** Lesson not found.

---

### GET /lessons/:slug/sidecar

Returns the lesson sidecar JSON (metadata only) for the given slug.

**Response 200:** Sidecar object (identifier, slug, title, language, difficulty, utu, teaching_mode, ontology, gate, inferredFeatures, katexAssets, factoryManifest, compiledAt, schemaVersion, metadata_source).

**Response 404/500:** Not found or compile error.

---

### GET /factories/:file

Serves a runtime factory file (e.g. `shared-runtime.js`, `sensor-bridge.js`). Whitelist only.

**Response 200:** JavaScript with long cache headers.

---

### GET /katex/:file

Serves a KaTeX CSS subset file.

**Response 200:** CSS with long cache headers.

---

### GET /manifest.json

PWA manifest.

---

### GET /sw.js

Service worker script (no-cache).

---

## 4. Governance

Implemented in theta (Phase 7). Used by the portal and authoring tools.

### GET /api/governance/report

Returns cohort coverage by UTU and by skill (from mastery summary + lesson index).

**Response 200**

```json
{
  "byUtu": {
    "<utuKey>": { "lessons": "number", "skills": ["string"], "studentMasteryCount": "number" }
  },
  "bySkill": {
    "<skillId>": { "lessons": "number", "studentMasteryCount": "number" }
  },
  "studentCount": "number",
  "lessonCount": "number"
}
```

---

### GET /api/governance/policy

Returns the current governance policy (if loaded from file). Uses cached policy from `AGNI_GOVERNANCE_POLICY` or default `data/governance_policy.json`.

**Response 200**

```json
{
  "utuTargets": [{ "class": "string", "band": "number" }],
  "allowedTeachingModes": ["string"],
  "minDifficulty": "number",
  "maxDifficulty": "number",
  "requireUtu": "boolean",
  "requireTeachingMode": "boolean"
}
```

---

### POST /api/governance/compliance

Evaluates a lesson sidecar against the current policy (for authoring tools).

**Request body:** JSON sidecar object.

**Response 200**

```json
{
  "status": "ok | warning | fail",
  "issues": ["string"]
}
```

---

## 5. Authoring

Implemented in theta (Sprint C). For the WYSIWYG lesson builder and CLI tooling.

### POST /api/author/validate

Validates OLS YAML or lesson structure. Body: raw YAML string, or JSON string, or JSON object (e.g. `Content-Type: application/json` with a lesson object). Runs schema validation (OLS schema), basic structure check (meta, steps), and threshold syntax validation for `hardware_trigger` steps.

**Response 200** `{ "valid": boolean, "errors": string[], "warnings": string[] }`

- `valid`: `true` if no errors; `false` if schema, structure, or threshold errors.
- `errors`: list of error messages (e.g. schema path + message, threshold parse error).
- `warnings`: e.g. "Schema validation skipped (ajv not available)" if ajv could not load.

**Errors:** 400 (body required or parse error), 500 (server error).

---

### POST /api/author/preview

Returns compiled IR and sidecar for a given lesson payload. Body: same as validate (YAML or JSON). Does not write to disk.

**Response 200** `{ "ir": object, "sidecar": object }`

- `ir`: full lesson IR (steps with htmlContent, inferredFeatures, etc.).
- `sidecar`: metadata sidecar (identifier, slug, title, ontology, inferredFeatures, etc.) as would be written to `lesson-ir.json`.

**Errors:** 400 (invalid structure or build error), 500 (server error).

---

## CORS and errors

- All API responses use `Access-Control-Allow-Origin: *`.
- JSON error payloads: `{ "error": "string" }`.
- Status codes: 200, 400, 404, 405, 500, 503.
