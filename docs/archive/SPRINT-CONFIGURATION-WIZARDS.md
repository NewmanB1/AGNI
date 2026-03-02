# Sprint: Configuration Wizards by User Role

Guided setup flows (wizards) for each persona so they can configure AGNI without editing JSON or env vars by hand. Each wizard is a step-by-step UI (portal or CLI) that collects inputs and writes the appropriate config files or API calls.

**Prerequisites:** Hub APIs, governance policy, portal, and config points exist (see `docs/api-contract.md`, `schemas/governance-policy.schema.json`). This sprint adds **wizard UIs** on top.

---

## 1. Governance Authority — Configuration Wizard

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **G1** | **Policy wizard** — Step-by-step flow to set UTU targets, allowed teaching modes, difficulty bounds, requireUtu, requireTeachingMode. Writes `governance_policy.json`. | Portal route (e.g. `/governance/setup`) or `agni governance policy --wizard` | Governance can create/edit policy via wizard; no manual JSON. |
| **G2** | **Approved catalog wizard** — Create and maintain approved lesson set: add/remove lesson IDs from catalog. Catalog stored in `data/approved_catalog.json` (or equivalent). Schema defines `{ lessonIds: string[], provenance?: { sourceAuthorityId?, exportedAt?, version? } }`. | Portal route `/governance/catalog` | Governance can manage approved set via UI. |
| **G3** | **Catalog import wizard** — Import approved list from another authority. Steps: (1) upload/paste catalog file, (2) choose strategy: replace | merge | add-only, (3) preview diff, (4) confirm. Old and new lessons coexist by ID; student pointers unchanged. | Portal route `/governance/catalog/import` + API `POST /api/governance/catalog/import` | Import resolves at wizard completion; no deferred review. |
| **G4** | **Catalog export** — Export current approved catalog as JSON for sharing with another authority. Optional: include provenance (authorityId, exportedAt). | Button in catalog UI + `GET /api/governance/catalog` or `agni catalog export --out file.json` | Governance can export catalog for transfer. |

**Dependencies:** Approved catalog schema and API (G2 blocks G3, G4 if not already present).

### Sprint 1 implementation notes (G1, G2)

**G1 Policy wizard**
- Load current policy via `GET /api/governance/policy` (exists).
- Form fields: utuTargets (list of {class, band}), allowedTeachingModes (multi-select), minDifficulty, maxDifficulty (1–5), requireUtu, requireTeachingMode (checkboxes).
- Submit: `PUT /api/governance/policy` (new) or write to `data/governance_policy.json` via existing path.

**G2 Approved catalog**
- Schema: `schemas/approved-catalog.schema.json`:
  ```json
  {
    "lessonIds": ["string"],
    "provenance": {
      "sourceAuthorityId": "string",
      "exportedAt": "string (ISO8601)",
      "version": "string"
    }
  }
  ```
- File: `data/approved_catalog.json` (default path; override via env).
- Theta/eligibility: filter lesson index by `lessonIds` when catalog exists; if no catalog, allow all (backward compatible).

---

## 2. Administrator — Configuration Wizard

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **A1** | **Hub setup wizard** — Configure data dir, theta port, serve dir, YAML dir, factory dir, KaTeX dir, cache size. Writes env file or `data/hub_config.json` (if hub reads it). | Portal admin route `/admin/hub` or CLI `agni hub setup --wizard` | Admin can set hub paths and ports without editing env. |
| **A2** | **LMS engine wizard** — Configure embedding dim, learning rate, forgetting factor, regularization. Writes to config that engine loads on startup. | Portal admin route `/admin/lms` | Admin can tune LMS params via UI. |
| **A3** | **First-run onboarding** — Single wizard that runs when hub has no config: collect data dir, ports, and optional policy path. Creates minimal working config. | Portal or CLI on first hub start | New hub can be configured in one guided pass. |

**Dependencies:** Hub and engine must support reading config from file (not only env). If they already read env, wizard can generate `.env.example` or similar for the operator to apply.

### Sprint 1 implementation notes (A1, A3)

**A1 Hub setup wizard**
- Hub currently reads env vars (`AGNI_DATA_DIR`, `AGNI_THETA_PORT`, etc.). Wizard can:
  - Write `data/hub_config.json` and document that theta/hub-transform must be started with a loader that reads it and sets `process.env`, or
  - Generate `agni.env` (or `.env`) with key=value lines; operator runs `source agni.env` before starting hub.
- Portal route `/admin/hub`: form with path/port inputs; "Save" writes config file or triggers download of env snippet.

**A3 First-run onboarding**
- Detect first run: no `data/governance_policy.json` and no `data/lms_state.json` (or no `data/` dir).
- Single multi-step wizard: (1) Data dir, (2) Theta port, (3) Optional policy path, (4) "Create config" → writes minimal files.
- Can be portal route `/admin/onboarding` or CLI `agni hub init --wizard`.

---

## 3. Field Tech — Configuration Wizard

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **F1** | **Deployment wizard** — Configure hub ID, home URL, ports (theta, serve, Sentry). Optionally USB path for sneakernet. Writes deployment config. | CLI `agni deploy setup --wizard` or portal `/admin/deploy` | Field tech can provision a hub in one flow. |
| **F2** | **Sync wizard** — Configure sync transport (USB, starlink, etc.), hub URL, import/export paths. Test connection step. | CLI or portal `/admin/sync` | Field tech can enable sneakernet/sync. |
| **F3** | **Sentry wizard** — Configure telemetry port, analyse-after threshold, cron schedule. Link to graph weights and theta fallback behaviour. | Portal `/admin/sentry` | Field tech can enable and tune Sentry. |

**Dependencies:** `hub-tools/sync.js`, `hub-tools/sentry.js` env vars. Wizard produces config that sets those env or writes to a config file they read.

---

## 4. Teacher — Configuration Wizard

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **T1** | **Recommendation override wizard** — Select student, view theta-ordered list, pick override lesson (or clear). Calls `POST /api/theta/override`. | Portal route (e.g. `/class/:id/override`) | Teacher can set/clear override in a guided flow. |
| **T2** | **Student group wizard** — Create group (name, description), add students from class roster. Store in `data/groups.json` or equivalent. | Portal route `/groups` | Teacher can create and manage groups. |
| **T3** | **Group lesson assignment wizard** — Select group, select lesson (from theta-eligible for group or from approved catalog), assign. Effect: each group member gets that lesson as override (or group-level assignment). | Portal route `/groups/:id/assign` | Teacher can assign a collaborative/skill lesson to a group. |
| **T4** | **Class and hub connection** — Connect portal to hub (VITE_HUB_URL or in-app setting). Verify connection; show class/student data from hub. | Portal settings + connection test | Teacher can point portal at hub and confirm it works. |

**Dependencies:** Override API exists. Group model and APIs (T2, T3) may need backend work if not present.

---

## 5. Parent — Configuration Wizard

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **P1** | **Parent view onboarding** — Link parent account/device to child (pseudoId) via code or invite. Establishes read-only access to child progress. | Portal route `/parent/link` | Parent can link to child and see progress. |
| **P2** | **Content preferences wizard** — Set optional filters: max difficulty, allowed teaching modes, time-of-day or session limits. Stored per-child or per-device. | Portal route `/parent/preferences` | Parent can set content bounds (if runtime/hub enforce them). |
| **P3** | **Progress summary view** — Read-only dashboard: skills mastered, lessons completed, recommended next. Consumes hub APIs. | Portal route `/parent/dashboard` | Parent can view child progress without edit access. |

**Dependencies:** Parent–child linking model and auth (or anonymous link codes). Hub APIs for progress (theta, LMS status) exist; parent-scoped read API may need definition.

---

## 6. Student — Configuration Wizard

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **S1** | **First-run device setup** — Prompt for hub URL (if PWA/fetch), optional device nickname. Store in local storage or PWA config. Sets `AGNI_HUB` for factory loader. | Runtime prompt before first lesson load | Student (or facilitator) can configure hub URL once. |
| **S2** | **Accessibility wizard** — Haptic intensity (0–1), optional “reduced motion” flag. Persist in localStorage; runtime reads and applies. | In-lesson settings gear or pre-lesson screen | Student can reduce haptics or motion. |
| **S3** | **Session preferences** — Optional: preferred language (if multiple available), font size. Stored per-device. | Settings UI in player shell or portal | Student can personalise display. |

**Dependencies:** Runtime must read haptic/accessibility prefs from localStorage or similar. `shared.js` vibrate already accepts intensity; wire to persisted pref.

---

## Suggested Sprint Order

| Sprint | Focus | Tasks |
|--------|-------|-------|
| **Sprint 1** | Governance + Admin core | G1, G2, A1, A3 |
| **Sprint 2** | Governance catalog sharing + Field tech | G3, G4, F1, F2 |
| **Sprint 3** | Teacher | T1, T2, T4 |
| **Sprint 4** | Teacher groups + Parent + Student | T3, P1, P3, S1, S2 |

---

## API Contract Additions (for wizards)

Document in `docs/api-contract.md` as implemented:

- `GET /api/governance/catalog` — Return approved catalog.
- `POST /api/governance/catalog` — Update catalog (add/remove IDs).
- `POST /api/governance/catalog/import` — Import with strategy: `replace` \| `merge` \| `add-only`.
- `GET /api/admin/config` — Read hub config (if stored).
- `PUT /api/admin/config` — Write hub config (admin only).
- `GET /api/groups`, `POST /api/groups`, `PUT /api/groups/:id` — Group CRUD.
- `POST /api/groups/:id/assign` — Assign lesson to group.
- `GET /api/parent/child/:pseudoId/progress` — Parent read-only progress (auth required).

---

## References

- **Config points by role:** Analysis in agent transcript (configuration matrix).
- **Approved catalog semantics:** Old and new lessons coexist by ID; student pointers stable; import resolves at import time.
- **API contract:** `docs/api-contract.md`
- **Governance playbook:** `docs/playbooks/governance.md`

---

## Backend foundations (Sprint 1)

**Implemented:**

| Component | Description |
|-----------|-------------|
| `schemas/approved-catalog.schema.json` | Schema for approved lesson set. |
| `data/approved_catalog.json` | Default storage path; env `AGNI_APPROVED_CATALOG` to override. |
| `src/governance/catalog.js` | loadCatalog, saveCatalog, updateCatalog, importCatalog. |
| `GET /api/governance/catalog` | Return current approved catalog (or empty if none). |
| `POST /api/governance/catalog` | Body: `{ add?, remove?, lessonIds? }`. Add/remove IDs or replace set. |
| `POST /api/governance/catalog/import` | Body: `{ catalog, strategy: "replace"|"merge"|"add-only" }`. |
| `PUT /api/governance/policy` | Accept policy JSON in body; validate and save. |
| Theta integration | When catalog has lessonIds, filter eligible lessons to that set. Cache invalidates on catalog change. |

**Portal wizard UIs (done):**
- G1 Policy: `/governance/setup`
- G2 Catalog: `/governance/catalog` (add/remove lesson IDs)
- G3 Import: `/governance/catalog/import` (upload/paste, strategy, preview)
- G4 Export: button on catalog page (downloads JSON)
