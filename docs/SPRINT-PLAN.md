# Sprint Plan: Next Several Sprints

Multi-sprint plan based on recent work. All six numbered sprints and all remediation follow-up tasks are now complete. Updated after config wizards Sprint 1 (G1–G4), common top page, tech debt Sprints 0–6, DRY refactor Sprints D7–D12, Weakness Remediation Phases 1–4, and Sprints 1–6.

**Reference:** `docs/archive/SPRINT-CONFIGURATION-WIZARDS.md`, `docs/archive/SPRINT-TECH-DEBT.md`, `docs/archive/SPRINT-DRY-REFACTOR.md`, `docs/YEAR2-PREP.md`, UTU Architecture spec.

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

## Sprint 1: UTU Architecture & Schema — COMPLETE

**Goal:** Extend OLS and governance to support the 3D coordinate model (Spine, Band, Protocol).

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **U1** | **Extend OLS schema `meta.utu`** | **Done** | `protocol` (1–5) added; `spineId` alias; schema validates UTU_Unit. Schema bumped to v1.8.0. |
| **U2** | **UTU constants reference** | **Done** | `docs/specs/utu-architecture.md` — Spine IDs (22), Protocol names (P1–P5) with Cognitive Role and Failure Mode, Bands (B1–B6). Machine-readable `data/utu-constants.json`. |
| **U3** | **Extend governance policy** | **Done** | Protocol-progression rules; failure-mode hints; `allowedProtocols`, `minProtocol`, `maxProtocol` in policy schema. |
| **U4** | **Policy wizard: UTU/Protocol** | **Done** | Governance setup page has UTU targets (Spine picker + Band + Protocol), protocol checkbox grid with min/max bounds, failure-mode hints toggle. |

---

## Sprint 2: Config Wizards — Admin, Field Tech, Teacher Override — COMPLETE

**Goal:** Complete Admin, Field Tech, and Teacher override wizards.

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **A1** | **Hub setup wizard** | **Done** | Portal `/admin/hub`; paths, ports, cache, theta/serve config. Save to hub or download JSON. |
| **A3** | **First-run onboarding** | **Done** | Portal `/admin/onboarding`; detects first-run, minimal config creation, redirects when complete. |
| **F1** | **Deployment wizard** | **Done** | Portal `/admin/deploy`; hub ID, home URL, ports, sentry port, USB path. |
| **F2** | **Sync wizard** | **Done** | Portal `/admin/sync`; Starlink vs USB transport, test connection, import/export path config. |
| **T1** | **Recommendation override wizard** | **Done** | Student detail page `/students/[id]`; view theta list, set/clear override lesson. Calls `POST /api/theta/override`. |
| **T4** | **Hub connection** | **Done** | Portal `/settings`; VITE_HUB_URL entry, test connection, save. Language picker. |

---

## Sprint 3: Teacher Groups & Lesson Save API — COMPLETE

**Goal:** Student groups for collaborative lessons; lesson persistence for WYSIWYG.

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **T2** | **Student groups backend** | **Done** | `data/groups.json`; `GET/POST/PUT /api/groups`, group CRUD with student roster. |
| **T2b** | **Student groups wizard** | **Done** | Portal `/groups`; create group, add students from roster, edit modal, assign link. |
| **T3** | **Group lesson assignment** | **Done** | `POST /api/groups/:id/assign`; assign lesson to group members, theta eligibility check, assigned/skipped counts. |
| **T3b** | **Group assignment wizard** | **Done** | Portal `/groups/:id/assign`; eligibility badges, group-only filter, sorted by eligibility then theta. |
| **S1** | **Lesson save API** | **Done** | `POST /api/author/save`; schema validation, slug derivation, content hash, lesson chain append, YAML write, optional compile. |
| **S2** | **Lesson list/discovery API** | **Done** | `GET /api/lessons`; sidecar-based index, `?utu=`, `?spine=`, `?teaching_mode=`, `?is_group=` filters, pagination. |

---

## Sprint 4: WYSIWYG Foundation — COMPLETE

**Goal:** Choose editor stack, implement minimal lesson editor scaffold.

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **E1** | **Editor stack decision** | **Done** | Form-based Svelte 5 (`LessonEditorCore.svelte` + `StepEditor.svelte`). |
| **E2** | **Lesson meta form** | **Done** | Identifier, title, language, difficulty, teaching mode, license, audience, time, UTU (Spine/Band/Protocol), declared features (Bloom's/VARK/teaching style), 4 lesson templates. |
| **E3** | **Step editor scaffold** | **Done** | StepEditor supports all 7 types: instruction, hardware_trigger, quiz, fill_blank, matching, ordering, completion. Drag-and-drop reordering, templates. |
| **E4** | **Preview integration** | **Done** | "Preview" button calls `POST /api/author/preview`; PreviewPanel renders IR/sidecar; LivePreview tab with auto-trigger. |
| **E5** | **Save flow** | **Done** | "Save" button calls `POST /api/author/save`; preflight validation, content hash update, Ctrl+S shortcut, compile-on-save option, draft auto-save to localStorage. |

---

## Sprint 5: WYSIWYG — Full Step Types & Ontology — COMPLETE

**Goal:** Complete step types, gate, ontology; author can produce valid OLS.

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **E6** | **Gate editor** | **Done** | `GateEditor.svelte`; gate type (quiz/manual_verification), question, expected answer, passing score, retry delay, on-fail behavior. |
| **E7** | **Ontology editor** | **Done** | `OntologyEditor.svelte`; requires/provides skill picker with level, UTU spine reference chips, datalist autocomplete. |
| **E8** | **All step types** | **Done** | instruction, hardware_trigger, quiz, fill_blank, matching, ordering, completion — all supported in player.js (runtime) and StepEditor.svelte (authoring). |
| **E9** | **YAML round-trip** | **Done** | Load via `GET /api/author/load/:slug`; import YAML/JSON; export YAML/JSON; save writes YAML to disk. Full round-trip editing. |

---

## Sprint 6: Parent, Student, Launch — MOSTLY COMPLETE

**Goal:** Parent view, student accessibility, launch prep.

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **P1** | **Parent linking** | **Done** | `POST /api/parent/invite` (generate code), `POST /api/parent/link` (redeem code), `GET /api/parent/children`, `GET /api/parent/child/:pseudoId/progress`. |
| **P2** | **Parent dashboard** | **Done** | Portal `/parent/dashboard`; parent ID, link via invite code, children list, per-child progress (mastery, skills, overrides). |
| **S1** | **Student device setup** | **Done** | Runtime `showHubSetup()` banner prompt for hub URL; persists to localStorage; skip option for offline mode. |
| **S2** | **Student accessibility** | **Done** | Gear icon settings panel: font size, high contrast, reduced motion, haptic intensity. Persists in localStorage. ARIA dialog. |
| **L1** | **Public launch** | **Done** | MANIFESTO.md, CONTRIBUTING.md. Release tag v1.0.0 exists. |
| **L2** | **Community onboarding** | **Done** | CONTRIBUTING.md (186 lines), GitHub issue templates (bug_report, feature_request, lesson_submission), labels.yml, dependabot.yml. |

**Remaining:** L1 needs a release tag (`git tag v1.0.0`).

---

## Remediation Follow-up Tasks — COMPLETE

| # | Task | Status | Deliverable |
|---|------|--------|-------------|
| **R1** | **Checkpoint integration tests** | **Done** | `tests/integration/checkpoint-sync.test.js` — 7 tests: save/retrieve, validation, savedAt conflict resolution, 404 handling. |
| **R2** | **Feature flag integration tests** | **Done** | `tests/integration/feature-flags.test.js` — 13 tests: CRUD, admin auth, rollout clamping, A/B results, `isEnabled` determinism, `getActiveFlagsForStudent`. |
| **R3** | **Frustration→Theta integration test** | **Done** | `tests/integration/frustration-theta.test.js` — 4 tests: no-penalty baseline, frustration penalty applied, per-lesson isolation, telemetry acceptance. |
| **R4** | **Feature flag UI in portal** | **Done** | Portal `/admin/flags`; create/edit flags, enable/disable toggle, rollout %, metric config, A/B results viewer. Admin sidebar link. |
| **R5** | **Declared features in LessonEditorCore** | **Done** | `declared_features` (blooms_level, vark, teaching_style) fields added to meta form with dropdowns and checkbox grid. |
| **R6** | **Checkpoint conflict resolution** | **Done** | Timestamp-based last-write-wins (`savedAt` comparison); server skips older writes, overwrites with newer. Tested in R1. |

---

## Dependency Summary

All sprints complete. Dependency chain satisfied:

```
Sprint 1 (UTU)           ✓ ──┐
Sprint 2 (Admin/Deploy)  ✓ ──┤
Sprint 3 (Groups/Save)   ✓ ──► Sprint 4 (WYSIWYG base) ✓ ──► Sprint 5 (WYSIWYG full) ✓
Sprint 6 (Parent/Launch)  ✓* ─┘   (* L1 release tag pending)
```

---

## What's Next

With all sprints complete, the remaining work is operational:

1. **Release tag** — `git tag v1.0.0` and push to origin for public discoverability (L1).
2. **Field testing** — Deploy to a real hub, run lessons with students, gather telemetry.
3. **Performance** — Profile theta recommendations and lesson compilation under load.
4. **New spines** — The UTU schema allows arbitrary spine IDs; new disciplinary spines can be added to `data/utu-constants.json`.
5. **Localization** — Translate portal UI strings (i18n framework in place with en/es/sw/fr).

---

## References

- **UTU Architecture spec** — `docs/specs/utu-architecture.md`; 3D coordinate (Spine, Band, Protocol); Cognitive Role, Failure Mode
- **Tech debt sprints** — `docs/SPRINT-TECH-DEBT.md` (Sprints 0–6, all complete)
- **DRY refactor sprints** — `docs/SPRINT-DRY-REFACTOR.md` (Sprints D7–D12, all complete)
- **Config wizards** — `docs/SPRINT-CONFIGURATION-WIZARDS.md` (G1–G4, A1, A3, F1, F2, T1–T4 all done)
- **WYSIWYG prep** — `docs/YEAR2-PREP.md`
- **API contract** — `docs/api-contract.md`

---

## Archived

Previous sprint-next and next-sprint-tasks content has been consolidated into this file.
See git history for the original files: `docs/SPRINT-NEXT.md`, `docs/NEXT-SPRINT-TASKS.md`.
