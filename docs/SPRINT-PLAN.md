# Sprint Plan: Next Several Sprints

Multi-sprint plan based on recent work: configuration wizards (done), UTU Architecture spec, WYSIWYG lesson builder, and remaining wizard flows. Updated after config wizards Sprint 1 (G1–G4) and common top page.

**Reference:** `docs/SPRINT-CONFIGURATION-WIZARDS.md`, `docs/NEXT-SPRINT-TASKS.md`, `docs/YEAR2-PREP.md`, UTU Architecture spec.

---

## Completed (Recent)

- **Config wizards G1–G4** — Policy, Approved catalog, Import, Export
- **Common top page** — `/` with links to Hub and Governance
- **Teacher Hub** — Moved to `/hub`

---

## Sprint 1: UTU Architecture & Schema

**Goal:** Extend OLS and governance to support the 3D coordinate model (Spine, Band, Protocol).

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **U1** | **Extend OLS schema `meta.utu`** | Add `protocol` (1–5); formalize `spineId` (or keep `class` as Spine ID). Document Spine enum (MAC-1..8, SCI-1..7, SOC-1..7). | Schema validates UTU_Unit = { spineId, band, protocol } |
| **U2** | **UTU constants reference** | `docs/specs/utu-architecture.md` — Spine IDs, Protocol names (P1–P5), Cognitive Role, Failure Mode. | Authoring and governance can reference canonical values |
| **U3** | **Extend governance policy** | Add protocol-progression rules (e.g. require P1→P2→P3 for rigor); optional failure-mode hints. | Policy schema and evaluateLessonCompliance support Protocol |
| **U4** | **Policy wizard: UTU/Protocol** | Update policy wizard to include Protocol targets; Spine picker using UTU reference. | Governance can set Protocol and Spine targets via wizard |

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

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **E1** | **Editor stack decision** | Update `docs/YEAR2-PREP.md` with chosen approach (TipTap vs form-based vs hybrid). | Clear implementation path |
| **E2** | **Lesson meta form** | Portal `/author/new` or `/author/:slug/edit`; form for identifier, title, language, UTU (Spine, Band, Protocol), difficulty. | Author can set core metadata |
| **E3** | **Step editor scaffold** | Add/edit steps: type (instruction, hardware_trigger, quiz), content, threshold (for hardware_trigger). Validate on change via `POST /api/author/validate`. | Author can define steps with validation |
| **E4** | **Preview integration** | "Preview" button calls `POST /api/author/preview`; show IR/sidecar or open compiled lesson in new tab. | Author can preview before save |
| **E5** | **Save flow** | "Save" calls lesson save API; success/error feedback. | Author can persist new/edited lesson |

---

## Sprint 5: WYSIWYG — Full Step Types & Ontology

**Goal:** Complete step types, gate, ontology; author can produce valid OLS.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **E6** | **Gate editor** | Form for gate type (quiz, manual_verification), question, expected_answer, on_fail, passing_score, retry_delay. | Full gate definition in UI |
| **E7** | **Ontology editor** | requires / provides skill picker or comma list; link to UTU Spine for skill IDs. | Ontology editable in UI |
| **E8** | **All step types** | instruction, hardware_trigger (sensor, threshold, feedback), quiz (answer_options, correct_index). Threshold syntax validation. | All OLS step types supported |
| **E9** | **YAML round-trip** | Load existing YAML into editor; edit and save; output valid OLS YAML. | Existing lessons editable in WYSIWYG |

---

## Sprint 6: Parent, Student, Launch

**Goal:** Parent view, student accessibility, launch prep.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **P1** | **Parent linking** | Model for parent–child link (code or invite); `GET /api/parent/child/:pseudoId/progress` (auth). | Parent can link to child |
| **P2** | **Parent dashboard** | Portal `/parent/dashboard`; read-only progress (skills mastered, lessons completed). | Parent can view child progress |
| **S1** | **Student device setup** | Runtime prompt for hub URL; store in localStorage. | Student/facilitator can set hub once |
| **S2** | **Student accessibility** | Haptic intensity (0–1), reduced motion; persist in localStorage; runtime reads. | Student can reduce haptics |
| **L1** | **Public launch** | Manifesto, one-line pitch, release tag (e.g. v0.2.0). | Project discoverable |
| **L2** | **Community onboarding** | Labels, triage process, CONTRIBUTING, fork-and-translate tutorial. | Contributors know where to start |

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

- **Sprint 1** can run in parallel with Sprint 2.
- **Sprint 4** depends on lesson save API (Sprint 3).
- **Sprint 5** builds on Sprint 4.
- **Sprint 6** is mostly independent; can overlap with 4/5.

---

## Recommended Order

| Order | Sprint | Focus |
|-------|--------|-------|
| 1 | **Sprint 1** | UTU Architecture — schema, docs, governance |
| 2 | **Sprint 2** | Config wizards (Admin, Field Tech, Teacher override) |
| 3 | **Sprint 3** | Groups + Lesson save API |
| 4 | **Sprint 4** | WYSIWYG foundation |
| 5 | **Sprint 5** | WYSIWYG full |
| 6 | **Sprint 6** | Parent, Student, Launch |

---

## References

- **UTU Architecture spec** — 3D coordinate (Spine, Band, Protocol); Cognitive Role, Failure Mode; governance Portability/Rigor/Failure checks
- **Config wizards** — `docs/SPRINT-CONFIGURATION-WIZARDS.md` (G1–G4 done; A1, A3, F1, F2, T1–T4, P1–P3, S1–S3)
- **WYSIWYG prep** — `docs/YEAR2-PREP.md`
- **API contract** — `docs/api-contract.md`

---

## Archived

Previous sprint-next and next-sprint-tasks content has been consolidated into this file.
See git history for the original files: `docs/SPRINT-NEXT.md`, `docs/NEXT-SPRINT-TASKS.md`.
