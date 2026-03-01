# Sprint Plan: Next Several Sprints

Multi-sprint plan based on recent work: configuration wizards (done), UTU Architecture spec, WYSIWYG lesson builder, and remaining wizard flows. Updated after config wizards Sprint 1 (G1–G4), common top page, tech debt Sprints 0–6, DRY refactor Sprints D7–D12, and Weakness Remediation Phases 1–4.

**Reference:** `docs/SPRINT-CONFIGURATION-WIZARDS.md`, `docs/SPRINT-TECH-DEBT.md`, `docs/SPRINT-DRY-REFACTOR.md`, `docs/YEAR2-PREP.md`, UTU Architecture spec.

---

## Completed (Recent)

- **Config wizards G1–G4** — Policy, Approved catalog, Import, Export
- **Common top page** — `/` with links to Hub and Governance
- **Teacher Hub** — Moved to `/hub`
- **Tech Debt Sprints 0–6** — Security fixes, config centralization, player.js decomposition (1837→~1087 lines), runtime tests (46 new), async I/O, docs consolidation. See `docs/SPRINT-TECH-DEBT.md`.
- **DRY Refactor Sprints D7–D12** — Service layer DRY extraction, hub middleware, governance schema store, runtime deduplication, engine fixes, error conventions. See `docs/SPRINT-DRY-REFACTOR.md`.

### Weakness Remediation (Phases 1–4)

| Phase | What was done |
|-------|---------------|
| **1A** | **Checkpoint hardening** — Configurable 7-day expiry, version field, hub sync via XHR, `POST/GET /api/checkpoint` endpoints |
| **1B** | **Accessibility settings panel** — Gear icon trigger, font size/contrast/motion/haptic controls, ARIA dialog, live preview (`a11y.js`) |
| **1C** | **Data cleanup** — Reset stale `learning_paths.json` and `review_schedule.json`; server-side validation on `POST /api/learning-paths` |
| **1D** | **Config centralization** — `env-config.js` used by `policy.js`, `author.js`, `logger.js`, `http-helpers.js` |
| **2A** | **New quiz types** — `fill_blank`, `matching`, `ordering` renderers in `player.js`; StepEditor.svelte editing UI; OLS schema v1.8.0 |
| **2B** | **Frustration improvement** — Difficulty-scaled thresholds, continuous 0–1 frustration score, event recording, telemetry integration |
| **3A** | **LessonEditorCore templates** — 4 lesson templates (Sensor Lab, MCQ Quiz, Reading Comprehension, Mixed Lesson) |
| **3B** | **Feature override system** — `declared_features` overlay in `featureInference.js`, confidence scoring, low-confidence compliance warnings |
| **4A** | **Feature flag system** — Deterministic student bucketing, admin API (`/api/flags`), A/B test metrics endpoint |
| **4B** | **Frustration→Theta loop** — Historical frustration penalty applied to lesson recommendation scores in `theta.js` |

184 tests across 45 suites, 0 failures.

---

## Sprint 1: UTU Architecture & Schema

**Goal:** Extend OLS and governance to support the 3D coordinate model (Spine, Band, Protocol).

**Status:** U1 partially complete (OLS schema v1.8.0 includes `meta.utu` with `class`, `spineId`, `band`, `protocol`). U3 partially complete (protocol bounds in governance policy, `evaluateLessonCompliance` checks protocol).

| # | Task | Status | Deliverable | Success |
|---|------|--------|-------------|---------|
| **U1** | **Extend OLS schema `meta.utu`** | **Done** | `protocol` (1–5) added; `spineId` alias; schema validates UTU_Unit. Schema bumped to v1.8.0. | Schema validates UTU_Unit = { spineId, band, protocol } |
| **U2** | **UTU constants reference** | Pending | `docs/specs/utu-architecture.md` — Spine IDs, Protocol names (P1–P5), Cognitive Role, Failure Mode. | Authoring and governance can reference canonical values |
| **U3** | **Extend governance policy** | **Done** | Protocol-progression rules; failure-mode hints; `allowedProtocols`, `minProtocol`, `maxProtocol` in policy schema. | Policy schema and evaluateLessonCompliance support Protocol |
| **U4** | **Policy wizard: UTU/Protocol** | Pending | Update policy wizard to include Protocol targets; Spine picker using UTU reference. | Governance can set Protocol and Spine targets via wizard |

**Remaining:** U2 (reference docs) and U4 (wizard UI).

---

## Sprint 2: Config Wizards — Admin, Field Tech, Teacher Override

**Goal:** Complete Admin, Field Tech, and Teacher override wizards.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **A1** | **Hub setup wizard** | Portal `/admin/hub` or CLI `agni hub setup --wizard`; paths, ports, cache. Output env snippet or hub_config.json. | Admin can configure hub without editing env |
| **A3** | **First-run onboarding** | Portal `/admin/onboarding` or CLI `agni hub init --wizard`; minimal config creation. | New hub can be provisioned in one flow |
| **F1** | **Deployment wizard** | Portal `/admin/deploy` or CLI; hub ID, home URL, ports, USB path. | Field tech can provision hub in one flow |
| **F2** | **Sync wizard** | Configure sync transport, hub URL, import/export paths. | Sneakernet/sync configurable via UI |
| **T1** | **Recommendation override wizard** | Portal route; select student, view theta list, pick override lesson. Calls `POST /api/theta/override`. | Teacher can set/clear override in guided flow |
| **T4** | **Hub connection** | Portal settings for VITE_HUB_URL; connection test. | Teacher can point portal at hub and verify |

---

## Sprint 3: Teacher Groups & Lesson Save API

**Goal:** Student groups for collaborative lessons; lesson persistence for WYSIWYG.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **T2** | **Student groups backend** | `data/groups.json`; `GET/POST/PUT /api/groups`, group CRUD. | Groups stored and queryable |
| **T2b** | **Student groups wizard** | Portal `/groups`; create group, add students from roster. | Teacher can manage groups via UI |
| **T3** | **Group lesson assignment** | `POST /api/groups/:id/assign`; assign lesson to group (applies override to members). | Teacher can assign lesson to group |
| **T3b** | **Group assignment wizard** | Portal `/groups/:id/assign`; select group, select lesson, assign. | Full teacher flow for group lessons |
| **S1** | **Lesson save API** | `POST /api/author/save` or `PUT /api/lessons/:slug`; accept lesson JSON, write YAML to hub storage. Define storage model (e.g. `data/yaml/<slug>.yaml`). | Authors can persist lessons via API |
| **S2** | **Lesson list/discovery API** | `GET /api/lessons` (optional `?utu=`, `?spine=`); return lesson index or catalog. | WYSIWYG can list and discover lessons |

---

## Sprint 4: WYSIWYG Foundation

**Goal:** Choose editor stack, implement minimal lesson editor scaffold.

**Status:** E1 decided (form-based Svelte 5); E2 partially done (LessonEditorCore has meta form + 4 templates); E3 substantially done (StepEditor supports all 7 step types).

| # | Task | Status | Deliverable | Success |
|---|------|--------|-------------|---------|
| **E1** | **Editor stack decision** | **Done** | Form-based Svelte 5 (`LessonEditorCore.svelte` + `StepEditor.svelte`). | Clear implementation path |
| **E2** | **Lesson meta form** | **Partial** | LessonEditorCore has identifier, title, language, difficulty, and 4 lesson templates. UTU fields (Spine, Band, Protocol) still needed. | Author can set core metadata |
| **E3** | **Step editor scaffold** | **Done** | StepEditor supports all 7 types: instruction, hardware_trigger, quiz, fill_blank, matching, ordering, completion. Drag-and-drop reordering, templates. | Author can define steps with validation |
| **E4** | **Preview integration** | Pending | "Preview" button calls `POST /api/author/preview`; show IR/sidecar or open compiled lesson in new tab. | Author can preview before save |
| **E5** | **Save flow** | Pending | "Save" calls lesson save API; success/error feedback. | Author can persist new/edited lesson |

**Remaining:** E2 (UTU fields in meta form), E4 (preview), E5 (save flow — depends on Sprint 3 S1).

---

## Sprint 5: WYSIWYG — Full Step Types & Ontology

**Goal:** Complete step types, gate, ontology; author can produce valid OLS.

**Status:** E8 complete (all 7 step types implemented in both editor and runtime).

| # | Task | Status | Deliverable | Success |
|---|------|--------|-------------|---------|
| **E6** | **Gate editor** | Pending | Form for gate type (quiz, manual_verification), question, expected_answer, on_fail, passing_score, retry_delay. | Full gate definition in UI |
| **E7** | **Ontology editor** | Pending | requires / provides skill picker or comma list; link to UTU Spine for skill IDs. | Ontology editable in UI |
| **E8** | **All step types** | **Done** | instruction, hardware_trigger, quiz, fill_blank, matching, ordering, completion — all supported in player.js (runtime) and StepEditor.svelte (authoring). | All OLS step types supported |
| **E9** | **YAML round-trip** | Pending | Load existing YAML into editor; edit and save; output valid OLS YAML. | Existing lessons editable in WYSIWYG |

**Remaining:** E6 (gate editor), E7 (ontology editor), E9 (YAML round-trip).

---

## Sprint 6: Parent, Student, Launch

**Goal:** Parent view, student accessibility, launch prep.

**Status:** S2 complete (a11y settings panel); L1 partially done (MANIFESTO.md written); L2 partially done (issue templates, labels, dependabot configured).

| # | Task | Status | Deliverable | Success |
|---|------|--------|-------------|---------|
| **P1** | **Parent linking** | Pending | Model for parent–child link (code or invite); `GET /api/parent/child/:pseudoId/progress` (auth). | Parent can link to child |
| **P2** | **Parent dashboard** | Pending | Portal `/parent/dashboard`; read-only progress (skills mastered, lessons completed). | Parent can view child progress |
| **S1** | **Student device setup** | Pending | Runtime prompt for hub URL; store in localStorage. | Student/facilitator can set hub once |
| **S2** | **Student accessibility** | **Done** | Gear icon settings panel: font size, high contrast, reduced motion, haptic intensity. Persists in localStorage. ARIA dialog. | Student can adjust accessibility prefs |
| **L1** | **Public launch** | **Partial** | MANIFESTO.md written. Release tag and one-line pitch still needed. | Project discoverable |
| **L2** | **Community onboarding** | **Partial** | GitHub issue templates, labels.yml, dependabot.yml configured. CONTRIBUTING and fork-and-translate tutorial still needed. | Contributors know where to start |

**Remaining:** P1/P2 (parent features), S1 (device setup), L1 (release tag), L2 (CONTRIBUTING guide).

---

## New: Remediation Follow-up Tasks

Tasks that emerged from the Weakness Remediation Strategy but were deferred.

| # | Task | Deliverable | Priority |
|---|------|-------------|----------|
| **R1** | **Checkpoint integration tests** | E2E test: save checkpoint on device A, load on device B via hub sync. | High |
| **R2** | **Feature flag integration tests** | E2E test: create flag → assign rollout → verify student bucketing → collect A/B metrics. | High |
| **R3** | **Frustration→Theta integration test** | E2E test: record high-frustration session → verify theta penalizes that lesson for the student. | High |
| **R4** | **Feature flag UI in portal** | Admin page to view/create/edit feature flags and view A/B results. | Medium |
| **R5** | **Declared features in LessonEditorCore** | Add `declared_features` (blooms_level, vark, teaching_style) fields to the meta form. | Medium |
| **R6** | **Checkpoint conflict resolution** | Handle merge conflicts when local and hub checkpoints diverge (currently hub wins if local is absent). | Low |

---

## Dependency Summary

```
Sprint 1 (UTU) ──────────────────────────────────────────────────┐
                                                                   │
Sprint 2 (Admin, Field Tech, T1, T4) ─────────────────────────────┤
                                                                   │
Sprint 3 (Groups, Save API) ──────────► Sprint 4 (WYSIWYG base) ──►│ Sprint 5 (WYSIWYG full)
                                                                   │
Sprint 6 (Parent, Student, Launch) ────────────────────────────────┘
```

- **Sprint 1** can run in parallel with Sprint 2. U1/U3 already done.
- **Sprint 4** depends on lesson save API (Sprint 3). E1/E3 already done.
- **Sprint 5** builds on Sprint 4. E8 already done.
- **Sprint 6** is mostly independent; can overlap with 4/5. S2/L1/L2 partially done.

---

## Recommended Order

| Order | Sprint | Focus | Notes |
|-------|--------|-------|-------|
| 1 | **Sprint 1** | UTU Architecture — U2 (docs), U4 (wizard) | U1/U3 already done |
| 2 | **Sprint 2** | Config wizards (Admin, Field Tech, Teacher override) | All tasks pending |
| 3 | **Sprint 3** | Groups + Lesson save API | All tasks pending |
| 4 | **Sprint 4** | WYSIWYG foundation — E2 (UTU meta), E4, E5 | E1/E3 already done |
| 5 | **Sprint 5** | WYSIWYG full — E6, E7, E9 | E8 already done |
| 6 | **Sprint 6** | Parent, Student, Launch — P1, P2, S1, L1, L2 | S2 done, L1/L2 partial |

---

## References

- **UTU Architecture spec** — 3D coordinate (Spine, Band, Protocol); Cognitive Role, Failure Mode; governance Portability/Rigor/Failure checks
- **Tech debt sprints** — `docs/SPRINT-TECH-DEBT.md` (Sprints 0–6, all complete)
- **DRY refactor sprints** — `docs/SPRINT-DRY-REFACTOR.md` (Sprints D7–D12, all complete)
- **Config wizards** — `docs/SPRINT-CONFIGURATION-WIZARDS.md` (G1–G4 done; A1, A3, F1, F2, T1–T4, P1–P3, S1–S3)
- **WYSIWYG prep** — `docs/YEAR2-PREP.md`
- **API contract** — `docs/api-contract.md`

---

## Archived

Previous sprint-next and next-sprint-tasks content has been consolidated into this file.
See git history for the original files: `docs/SPRINT-NEXT.md`, `docs/NEXT-SPRINT-TASKS.md`.
