# How to modify the Compiler

Use this when changing how lessons are compiled from YAML to IR or to HTML/native artifacts.

## Entry points

- **CLI:** `packages/agni-cli/cli.js` parses args and calls `@ols/compiler/services/compiler` `compileLessonFromYamlFile()`.
- **Service:** `packages/agni-services/compiler.js` → `@ols/compiler/services/compiler`. Exposes `compileLessonFromYamlFile()`, `parseLessonYaml()`, `validateLessonStructure()`.
- **IR:** Canonical IR: `packages/ols-compiler/compiler/build-lesson-ir.js`.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Change IR shape or sidecar fields | `packages/ols-compiler/compiler/build-lesson-ir.js` — keep `buildLessonSidecar()` in sync with `packages/types/index.d.ts` and `docs/api-contract.md` (sidecar). |
| Add a new YAML meta field (e.g. author, UTU) | 1) `schemas/ols.schema.json` (meta.properties). 2) `packages/types/index.d.ts` (LessonMeta, LessonSidecar). 3) `buildLessonSidecar()` to pass the field through. 4) Optionally `packages/agni-hub/theta.js` when building the lesson index from sidecar. |
| Change Markdown or math pipeline | `packages/ols-compiler/markdown-pipeline.js` — `processMarkdown()`. Used by `buildLessonIR` only. |
| Change what gets inferred (features, factories) | `packages/agni-utils/feature-inference.js` — `inferFeatures()`. Factory list and order: `packages/agni-utils/runtimeManifest.js` (FACTORY_LOAD_ORDER, FACTORY_FILE_MAP). Keep in sync with `packages/agni-runtime/` filenames. |
| Change step-type validation (P2-18) | `packages/ols-schema/lesson-schema.js` — `validateSemantics()`. Per-type: quiz, fill_blank, matching, ordering, hardware_trigger, svg. |
| Change HTML output or signing | `packages/ols-compiler/builders/html.js` — shared runtime path, integrity globals, and `packages/agni-hub/hub-transform.js` (PWA shell) should stay in sync; `packages/ols-compiler/services/lesson-assembly.js` is shared. |
| Change native bundle layout | `packages/ols-compiler/builders/native.js`. |
| Change YAML packet layout | `packages/ols-compiler/builders/yaml-packet.js`. See also `docs/playbooks/thin-client-targets.md`. |

## Do not

- Put format-specific logic (e.g. HTML script tags, signing) inside `buildLessonIR.js`. IR is format-agnostic.
- Change `FACTORY_LOAD_ORDER` or add runtime files without updating `packages/agni-utils/runtimeManifest.js` and `feature-inference.js`. Hub `ALLOWED_FACTORY_FILES` is derived from `FACTORY_LOAD_ORDER` automatically.

## Types

- `packages/types/index.d.ts`: `LessonIR`, `LessonSidecar`, `LessonMeta`, `InferredFeatures`. Keep these aligned with `buildLessonIR` / `buildLessonSidecar` output.
