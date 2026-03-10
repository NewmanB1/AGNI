# Lesson Creator Improvement Plan

Implementation plan for improvements to the lesson creator experience in AGNI. Based on the analysis in the prior conversation.

**Reference:** `docs/guides/LESSON-CREATORS.md`, `docs/YEAR2-PREP.md`, `docs/playbooks/compiler.md`, `docs/specs/threshold_grammar.md`.

---

## Implementation Status (2026-03-04)

| Phase | Status | Notes |
|-------|--------|-------|
| 1 | ✅ Done | cleanStep preserves fill_blank, matching, ordering |
| 2 | ✅ Done | Threshold builder, help panel, validation on blur |
| 3 | ✅ Done | validateLessonClient when hub offline |
| 4 | ✅ Done | Simulate sensors toggle in LivePreview |
| 5 | ✅ Done | /author landing page |
| 6 | ✅ Done | Skill picker in OntologyEditor, UTU tooltips |
| 7 | ✅ Done | generate-lesson --json, curriculum-gen import-to-hub.js |
| 8 | ✅ Done | Duplicate & translate modal, moveUp/moveDown in StepEditor |

---

## Overview

| Phase | Focus | Effort | Dependencies |
|-------|-------|--------|--------------|
| 1 | Critical bug fix (cleanStep data loss) | 0.5 day | None |
| 2 | Threshold authoring UX | 1–2 days | None |
| 3 | Validation & offline support | 1 day | None |
| 4 | Live preview & sensor simulation | 1–2 days | Phase 3 optional |
| 5 | Onboarding & discoverability | 1 day | None |
| 6 | Skill ontology & UTU guidance | 0.5–1 day | None |
| 7 | AI & curriculum-gen integration | 1–2 days | Phase 1 |
| 8 | Translation & step reorder UX | 0.5–1 day | None |

**Total estimate:** 6–10 days across phases; phases can be parallelized where dependencies allow.

---

## Phase 1: Fix cleanStep Data Loss (Critical)

**Goal:** Preserve all step-type-specific fields when saving from the portal; fix YAML round-trip fidelity.

### 1.1 Extend cleanStep for fill_blank, matching, ordering

| Task | Location | Effort |
|------|----------|--------|
| Add `fill_blank`: `blanks` (array of `{ answer, accept }`) | `portal/src/lib/components/LessonEditorCore.svelte` | 15m |
| Add `matching`: `pairs` (array of `{ left, right }`) | Same | 15m |
| Add `ordering`: `items` (array), `correct_order` (array of indices) | Same | 15m |
| Add regression test: import lesson with fill_blank/matching/ordering, save, re-load, assert no data loss | `portal/` or `tests/` | 30m |

**Acceptance:** Saving a lesson with fill_blank, matching, or ordering steps preserves all fields; re-loading shows identical content.

### 1.2 Verify StepEditor passes full step objects

| Task | Location | Effort |
|------|----------|--------|
| Ensure StepEditor emits full step objects (including blanks, pairs, items, correct_order) | `portal/src/lib/components/StepEditor.svelte` | 15m |
| Sanity-check WysiwygEditor round-trip for these step types | `portal/src/lib/components/WysiwygEditor.svelte` | 15m |

**Acceptance:** No step-type fields are stripped before reaching LessonEditorCore.

---

## Phase 2: Threshold Authoring UX

**Goal:** Make hardware_trigger threshold expressions easier to author and validate.

### 2.1 Inline threshold documentation

| Task | Location | Effort |
|------|----------|--------|
| Add collapsible "Threshold syntax help" panel next to threshold input in StepEditor | `portal/src/lib/components/StepEditor.svelte` | 30m |
| Include: subject list (accel.total, freefall, steady, etc.), operators, units, duration vs intensity semantics | Same | 15m |
| Link to `docs/specs/threshold_grammar.md` (or in-portal doc) | Same | 15m |

**Acceptance:** Authors can see threshold syntax help without leaving the editor.

### 2.2 Threshold validation on blur

| Task | Location | Effort |
|------|----------|--------|
| Use existing `validateThreshold()` in StepEditor; show error state and message when invalid | `portal/src/lib/components/StepEditor.svelte` | 30m |
| Align parser with canonical `@ols/schema` threshold-syntax if needed | `packages/ols-schema/threshold-syntax.js` | 30m |

**Acceptance:** Invalid threshold shows inline error; valid threshold clears error.

### 2.3 Threshold builder (optional)

| Task | Location | Effort |
|------|----------|--------|
| Add "Build expression" mode: sensor dropdown, operator dropdown, value input, unit dropdown | `portal/src/lib/components/StepEditor.svelte` | 2h |
| Output concatenated string (e.g. `accel.total > 2.5g`) into threshold field | Same | 30m |
| Toggle between "Type expression" and "Build expression" | Same | 15m |

**Acceptance:** Authors can build valid thresholds via dropdowns without memorizing syntax.

---

## Phase 3: Validation & Offline Support

**Goal:** Enable schema and threshold validation when hub is not configured.

### 3.1 Client-side validation path

| Task | Location | Effort |
|------|----------|--------|
| Create `portal/src/lib/validateLesson.ts` that imports `lessonSchema.validateLessonData` and threshold-syntax validator | New file | 1h |
| Use shared `lesson-schema` service; may require bundling schema + ajv for portal | `src/services/lesson-schema.js` | 1h |
| Call client-side validation when hub URL is empty; merge with preflight | `LessonEditorCore.svelte` | 45m |

**Acceptance:** Validate button works with full schema + threshold checks when hub is not configured.

### 3.2 Save without hub (export-only fallback)

| Task | Location | Effort |
|------|----------|--------|
| When hub not connected, "Save" could become "Export" with clear copy; or show "Configure hub to save" | `LessonEditorCore.svelte` | 30m |
| Ensure export produces valid OLS YAML that passes validation | Same | 15m |

**Acceptance:** Authors understand they can export locally when hub is unavailable.

---

## Phase 4: Live Preview & Sensor Simulation

**Goal:** Allow desktop testing of sensor-dependent steps.

### 4.1 Simulated sensor mode in LivePreview

| Task | Location | Effort |
|------|----------|--------|
| Add "Simulate sensors" toggle to LivePreview | `portal/src/lib/components/LivePreview.svelte` | 30m |
| When enabled: mock accel.total, freefall, steady, etc. with sliders or preset buttons | Same | 2h |
| Document that real sensor behavior differs; simulation is for content preview only | Same | 15m |

**Acceptance:** Authors can trigger hardware_trigger steps on desktop via simulation.

### 4.2 Time-based simulation presets

| Task | Location | Effort |
|------|----------|--------|
| Presets: "Hold steady 3s", "Freefall 0.5s", "Shake 2.5g" that auto-trigger after delay | `LivePreview.svelte` or shared mock | 1h |

**Acceptance:** One-click simulation of common sensor scenarios.

---

## Phase 5: Onboarding & Discoverability

**Goal:** Single "start here" path for new lesson creators.

### 5.1 Creator landing page

| Task | Location | Effort |
|------|----------|--------|
| Create `/author` landing with: "Create lesson" (→ new), "Edit existing", "Learn how" (→ LESSON-CREATORS.md), "CLI / VS Code" (→ docs) | `portal/src/routes/author/+page.svelte` | 1h |
| Links to templates, fork-and-translate tutorial, threshold grammar | Same | 30m |

**Acceptance:** New creators see clear paths for YAML vs portal vs AI.

### 5.2 Fix LESSON-CREATORS threshold link

| Task | Location | Effort |
|------|----------|--------|
| Ensure link to threshold grammar is correct (`docs/specs/threshold_grammar.md` or equivalent) | `docs/guides/LESSON-CREATORS.md` | 5m |

### 5.3 First-run hint for new lesson

| Task | Location | Effort |
|------|----------|--------|
| When steps are empty, show template picker prominently; optionally a "Quick start" checklist (meta → steps → validate → save) | `LessonEditorCore.svelte` | 30m |

**Acceptance:** New lessons guide authors toward templates and next steps.

---

## Phase 6: Skill Ontology & UTU Guidance

**Goal:** Reduce friction when editing ontology and UTU.

### 6.1 Skill ID autocomplete / picker

| Task | Location | Effort |
|------|----------|--------|
| Add datalist or combobox for `ontology.requires` and `ontology.provides` with common skill IDs from governance or static list | `portal/src/lib/components/OntologyEditor.svelte` | 2h |
| Allow free text for custom IDs; validate format (e.g. `ols:subject:skill_name`) | Same | 30m |

**Acceptance:** Authors can pick from suggested skill IDs or type custom ones.

### 6.2 UTU tooltips

| Task | Location | Effort |
|------|----------|--------|
| Add tooltips or popovers for Spine, Band, Protocol explaining meaning and link to `docs/specs/utu-architecture.md` | `LessonEditorCore.svelte` | 45m |

**Acceptance:** Hovering UTU fields shows short explanation.

---

## Phase 7: AI & Curriculum-Gen Integration

**Goal:** Connect AI-generated lessons and curriculum-gen output to the portal.

### 7.1 Load AI draft into portal from CLI

| Task | Location | Effort |
|------|----------|--------|
| `generate-lesson.js` gains `--portal` flag: outputs JSON to stdout for paste; or writes to temp and opens URL with ?import=path | `scripts/generate-lesson.js` | 1h |
| Portal: support `?import=<url or file>` to load lesson JSON from query param or file picker | `LessonEditorCore.svelte` / `+page.svelte` | 1h |

**Acceptance:** Authors can run `generate-lesson.js --portal`, copy output, paste into portal Import.

### 7.2 Curriculum-gen → portal import

| Task | Location | Effort |
|------|----------|--------|
| Add script or npm script: `node tools/curriculum-gen/import-to-portal.js <lesson-path>` that copies YAML to hub `data/yaml/` or triggers save API | `tools/curriculum-gen/` | 1h |
| Document in curriculum-gen README | `tools/curriculum-gen/README.md` | 15m |

**Acceptance:** Generated lessons can be imported into hub catalog with one command.

### 7.3 Portal AI generation iteration (optional)

| Task | Location | Effort |
|------|----------|--------|
| "Regenerate step" or "Expand section" buttons that call author generate with narrowed prompt | `LessonEditorCore.svelte` | 2h |

**Acceptance:** Authors can refine AI drafts step-by-step in the UI.

---

## Phase 8: Translation & Step Reorder UX

**Goal:** Smoother translation workflow and step reordering.

### 8.1 Duplicate and translate action

| Task | Location | Effort |
|------|----------|--------|
| Add "Duplicate and translate" button on edit page: duplicates lesson, sets language to "", prompts for target language | `portal/src/routes/author/[slug]/edit/+page.svelte` + `LessonEditorCore.svelte` | 1h |
| Clear content for translation; keep structure, thresholds, step IDs | Same | 30m |

**Acceptance:** One click creates a translation-ready copy.

### 8.2 Step drag-and-drop or move buttons

| Task | Location | Effort |
|------|----------|--------|
| Add "Move up" / "Move down" buttons per step in StepEditor | `portal/src/lib/components/StepEditor.svelte` | 30m |
| Optional: drag handle + sortable list (e.g. svelte-dnd-action or native HTML5 drag) | Same | 1h |

**Acceptance:** Authors can reorder steps without copy-paste.

---

## Regression Guards & Verification

| Check | Location | Purpose |
|-------|----------|---------|
| Unit test: cleanStep preserves fill_blank, matching, ordering | `portal/` or `tests/` | Phase 1 |
| Manual: create lesson with each step type, save, re-load | — | Phase 1 |
| Manual: validate without hub; validate with hub | — | Phase 3 |
| Manual: simulated sensor triggers hardware_trigger in preview | — | Phase 4 |

---

## Dependencies & Ordering

```
Phase 1 (cleanStep)     → must be first; unblocks correct round-trip
Phase 2 (threshold)     → independent
Phase 3 (validation)    → independent
Phase 4 (simulation)    → benefits from Phase 3 (validate before preview)
Phase 5 (onboarding)    → independent
Phase 6 (ontology/UTU)  → independent
Phase 7 (AI integration)→ requires Phase 1 for correct save
Phase 8 (translate/reorder) → independent
```

**Recommended sequence for a single developer:**
1. Phase 1 (critical fix)
2. Phase 2 (high-impact UX)
3. Phase 5 (low effort, high visibility)
4. Phase 3 (enables offline workflows)
5. Phase 8 (quick wins)
6. Phase 6 (reduces ontology/UTU friction)
7. Phase 4 (sensor simulation)
8. Phase 7 (AI integration)

---

## Out of Scope (Deferred)

- **Full offline authoring** — Portal would need local storage or IndexedDB persistence; hub is the source of truth today.
- **TipTap / rich-text WYSIWYG** — YEAR2-PREP chose form-based builder; current WysiwygEditor + StepEditor cover this.
- **Collaborative editing** — Multi-user real-time editing is not planned.
- **Approval workflow UX** — "Pending approval" notice exists; full workflow (request, approve, publish) is governance scope.
