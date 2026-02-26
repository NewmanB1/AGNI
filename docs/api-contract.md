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

**Response 200**

```json
{
  "pseudoId": "string",
  "lessons": [ "... same lesson shape as above ..." ],
  "computedAt": "ISO8601",
  "cached": "boolean",
  "graphSource": "string",
  "override": "string | undefined"
}
```

- **override:** If set, the teacher has overridden the recommendation for this student; the first lesson in **lessons** is the override target (and is guaranteed to be in the theta-eligible list).

**Errors:** 400 (missing pseudoId), 405 (method not allowed).

---

### POST /api/theta/override (Phase 3 / Sprint G)

Set or clear a teacher recommendation override for a student. Override is **pure** in the sense that the effective list is `applyRecommendationOverride(thetaOrderedList, overrideLessonId)`; persistence is at the edge (file `data/recommendation_overrides.json`).

**Request body**

```json
{
  "pseudoId": "string",
  "lessonId": "string | null"
}
```

- **lessonId** set: must be a lesson ID that appears in the theta-eligible list for that student (GET /api/theta?pseudoId=...). That lesson becomes the first recommended.
- **lessonId** null or omitted: clear the override for that student.

**Response 200** `{ "ok": true, "override": "string | null" }`

**Errors:** 400 (pseudoId required, or lessonId not in eligible list), 500 (server error).

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

## 1.5. Student groups

Groups are stored in `data/groups.json` and support teacher-defined student groupings (e.g. reading groups, lab pairs).

### GET /api/groups

Returns all groups.

**Response 200**

```json
{
  "groups": [
    { "id": "string", "name": "string", "studentIds": ["string"] }
  ]
}
```

---

### POST /api/groups

Create a new group.

**Request body**

```json
{
  "name": "string",
  "studentIds": ["string"]
}
```

- **name** (required): Group display name.
- **studentIds** (optional): Array of student pseudo-IDs. Defaults to `[]`.

**Response 200** `{ "ok": true, "group": { "id": "string", "name": "string", "studentIds": ["string"] } }`

**Errors:** 400 (name required), 500.

---

### PUT /api/groups

Update an existing group.

**Request body**

```json
{
  "id": "string",
  "name": "string",
  "studentIds": ["string"]
}
```

- **id** (required): Group ID from GET or POST response.
- **name** (optional): New display name.
- **studentIds** (optional): New array of student pseudo-IDs.

**Response 200** `{ "ok": true, "group": { "id": "string", "name": "string", "studentIds": ["string"] } }`

**Errors:** 400 (id required), 404 (group not found), 500.

---

### POST /api/groups/:id/assign (T3)

Assign a lesson to a group. Applies the recommendation override to all group members for whom the lesson is theta-eligible.

**Request body**

```json
{
  "lessonId": "string"
}
```

**Response 200**

```json
{
  "ok": true,
  "lessonId": "string",
  "assigned": 3,
  "skipped": 1,
  "assignedIds": ["string"],
  "skippedIds": ["string"]
}
```

- **assigned:** Number of students who received the override.
- **skipped:** Number of students for whom the lesson was not in their theta-eligible list.
- **assignedIds / skippedIds:** Pseudo-IDs in each category.

**Errors:** 400 (lessonId required), 404 (group not found), 500.

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

### PUT /api/governance/policy

Saves the governance policy (configuration wizard G1). Validates against `governance-policy.schema.json` before writing.

**Request body:** JSON policy object (utuTargets, allowedTeachingModes, minDifficulty, maxDifficulty, requireUtu, requireTeachingMode).

**Response 200** `{ "ok": true }`

**Errors:** 400 (validation failed), 500 (server error).

---

### GET /api/admin/config

Returns the current hub configuration (paths, ports, cache). Merges runtime values with `data/hub_config.json` if present (A1).

**Response 200**

```json
{
  "dataDir": "string",
  "serveDir": "string",
  "thetaPort": 8082,
  "approvedCatalog": "string",
  "minLocalSample": 40,
  "minLocalEdges": 5,
  "yamlDir": "string",
  "factoryDir": "string",
  "katexDir": "string",
  "servePort": 8083,
  "cacheMax": 100,
  "hubId": "string",
  "homeUrl": "string",
  "usbPath": "string",
  "sentryPort": 8081
}
```

---

### PUT /api/admin/config

Writes hub configuration to `data/hub_config.json` (A1). Restart hub for changes to take effect. Hub loads this file at startup and applies values to `process.env`.

**Request body:** JSON with optional keys: dataDir, serveDir, thetaPort, approvedCatalog, minLocalSample, minLocalEdges, yamlDir, factoryDir, katexDir, servePort, cacheMax, hubId, homeUrl, usbPath, sentryPort (F1).

**Response 200** `{ "ok": true, "message": "Config saved. Restart hub for changes to take effect." }`

**Errors:** 500 (server error).

---

### GET /api/admin/onboarding-status

Returns whether the hub is in first-run state (no `hub_config.json`). Used by portal `/admin/onboarding` (A3).

**Response 200** `{ "isFirstRun": true }` — `isFirstRun` is `true` when `data/hub_config.json` does not exist.

---

### GET /api/governance/catalog

Returns the approved lesson catalog. When present, theta filters eligible lessons to this set.

**Response 200**

```json
{
  "lessonIds": ["string"],
  "provenance": { "sourceAuthorityId": "string", "exportedAt": "string", "version": "string" }
}
```

---

### POST /api/governance/catalog

Add or remove lesson IDs from the approved catalog.

**Request body:** `{ "add"?: string[], "remove"?: string[], "lessonIds"?: string[] }` — use `lessonIds` to replace entire set; otherwise `add` and `remove` modify the current set.

**Response 200** `{ "ok": true, "catalog": { "lessonIds": [...], "provenance"?: {...} } }`

**Errors:** 400 (validation failed), 500 (server error).

---

### POST /api/governance/catalog/import

Import approved catalog from another authority. Conflicts resolved at import time.

**Request body:** `{ "catalog": { "lessonIds": string[], "provenance"?: {...} }, "strategy": "replace" | "merge" | "add-only" }`

- **replace:** Imported catalog becomes the full approved set.
- **merge:** Union of current and imported IDs.
- **add-only:** Add imported IDs not already in current set.

**Response 200** `{ "ok": true, "catalog": { "lessonIds": [...], "provenance": {...} } }`

**Errors:** 400 (catalog/strategy missing or invalid), 500 (server error).

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

## 5. Lesson discovery

### GET /api/lessons (S2)

Returns the lesson index (compiled lessons from `serve/catalog.json` + sidecar) and the list of saved YAML slugs. Supports optional query filters.

| Query           | Type   | Required | Description                              |
|----------------|--------|----------|------------------------------------------|
| `utu`          | string | no       | Filter by exact UTU class (e.g. `MAC-2`) |
| `spine`        | string | no       | Filter by spine prefix (e.g. `SCI`)      |
| `teaching_mode`| string | no       | Filter by teaching mode (e.g. `socratic`)|

**Response 200**

```json
{
  "lessons": [
    {
      "lessonId": "string",
      "slug": "string",
      "title": "string",
      "difficulty": "number",
      "language": "string",
      "compiledAt": "string | null",
      "utu": { "class": "string", "band": "number" },
      "teaching_mode": "string | null",
      "skillsProvided": [{ "skill": "string", "declaredLevel": "number" }],
      "skillsRequired": ["string"],
      "inferredFeatures": "object | null"
    }
  ],
  "savedSlugs": ["string"],
  "total": "number"
}
```

- **savedSlugs:** Slugs of YAML files in `data/yaml/` (authored but not necessarily compiled).

---

## 6. Parent portal (P1)

Teacher-initiated invite code flow: teacher creates an invite for a student, parent redeems the code, then can view the child's progress.

### POST /api/parent/invite

Teacher creates an invite code for a student. If an unused invite already exists for that student, returns the existing code.

**Request body**: `{ "pseudoId": "student_42" }`

**Response (200)**:
```json
{ "code": "A3K7P2", "pseudoId": "student_42", "existing": false }
```

**Errors**: 400 if `pseudoId` missing, 404 if student not in mastery data.

---

### POST /api/parent/link

Parent redeems an invite code to link to a child.

**Request body**: `{ "code": "A3K7P2", "parentId": "parent_jane" }`

**Response (200)**:
```json
{ "ok": true, "pseudoId": "student_42", "alreadyLinked": false }
```

**Errors**: 400 if `code` or `parentId` missing, 404 if invite code invalid or expired.

---

### GET /api/parent/children?parentId=...

Lists all children linked to a parent.

**Response (200)**:
```json
{ "parentId": "parent_jane", "children": [{ "pseudoId": "student_42", "linkedAt": "..." }] }
```

---

### GET /api/parent/child/:pseudoId/progress?parentId=...

Parent views a child's mastery, recommended lessons, and override status. Requires an active parent-child link.

**Response (200)**:
```json
{
  "pseudoId": "student_42",
  "linkedAt": "2026-02-25T...",
  "mastery": { "skill_a": 0.8, "skill_b": 1.0 },
  "completedSkills": 1,
  "totalSkills": 2,
  "recommendedLessons": [{ "lessonId": "gravity_v1", "score": 0.95 }],
  "currentOverride": null
}
```

**Errors**: 400 if `parentId` missing, 403 if not linked to the student.

---

## 7. Authoring

Implemented in theta (Sprint C). For the WYSIWYG lesson builder and CLI tooling.

### GET /api/author/load/:slug (E9)

Loads a saved lesson YAML from `data/yaml/<slug>.yaml` and returns the parsed JSON.

**Response (200)**:
```json
{ "slug": "gravity_v1", "lessonData": { "identifier": "gravity_v1", "title": "...", "steps": [...], ... } }
```

**Error (404)**: `{ "error": "Lesson not found: <slug>" }`

---

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

### POST /api/author/save (S1)

Validate and persist a lesson to hub storage as YAML. Body: same as validate/preview (YAML string, JSON string, or JSON object).

The slug is derived from `lessonData.slug` (if present) or from the title. The file is written to `data/yaml/<slug>.yaml` (or `AGNI_YAML_DIR/<slug>.yaml`).

**Response 200**

```json
{
  "ok": true,
  "slug": "string",
  "path": "string",
  "warnings": ["string"]
}
```

- **slug:** Derived filesystem-safe slug.
- **path:** Absolute path where the YAML was written.
- **warnings:** Schema warnings (non-fatal).

**Errors:** 400 (validation failed, invalid body), 500 (write error).

---

## CORS and errors

- All API responses use `Access-Control-Allow-Origin: *`.
- JSON error payloads: `{ "error": "string" }`.
- Status codes: 200, 400, 404, 405, 500, 503.
