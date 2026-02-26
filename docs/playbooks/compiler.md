# How to modify the Compiler

Use this when changing how lessons are compiled from YAML to IR or to HTML/native artifacts.

## Entry points

- **CLI:** `src/cli.js` parses args and calls `src/services/compiler.compileLessonFromYamlFile()`.
- **Service:** `src/services/compiler.js` — `compileLessonFromYamlFile()`, `parseLessonYaml()`, `validateLessonStructure()`. Use this from the CLI or from future authoring/hub code.
- **Barrel:** `src/compiler/index.js` re-exports `buildLessonIR` and `buildLessonSidecar`. Prefer requiring `../compiler` from builders/hub instead of `../compiler/buildLessonIR`.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Change IR shape or sidecar fields | `src/compiler/buildLessonIR.js` — keep `buildLessonSidecar()` in sync with `src/types/index.d.ts` and `docs/api-contract.md` (sidecar). |
| Add a new YAML meta field (e.g. author, UTU) | 1) `schemas/ols.schema.json` (meta.properties). 2) `src/types/index.d.ts` (LessonMeta, LessonSidecar). 3) `buildLessonSidecar()` to pass the field through. 4) Optionally `hub-tools/theta.js` when building the lesson index from sidecar. |
| Change Markdown or math pipeline | `src/config.js` — `processMarkdown()`. Used by `buildLessonIR` only. |
| Change what gets inferred (features, factories) | `src/utils/featureInference.js` — `inferFeatures()`, `FACTORY_LOAD_ORDER`, `FACTORY_FILE_MAP`. Keep in sync with `src/runtime/` filenames. |
| Change HTML output or signing | `src/builders/html.js` — shared runtime path, integrity globals, and `server/hub-transform.js` (PWA shell) should stay in sync; consider a shared lesson-assembly layer later. |
| Change native bundle layout | `src/builders/native.js`. |
| Change YAML packet layout | `src/builders/yaml-packet.js`. See also `docs/playbooks/thin-client-targets.md`. |

## Do not

- Put format-specific logic (e.g. HTML script tags, signing) inside `buildLessonIR.js`. IR is format-agnostic.
- Change `FACTORY_LOAD_ORDER` or add runtime files without updating `featureInference.js` and any hub whitelist (e.g. `ALLOWED_FACTORY_FILES` in hub-transform).

## Types

- `src/types/index.d.ts`: `LessonIR`, `LessonSidecar`, `LessonMeta`, `InferredFeatures`. Keep these aligned with `buildLessonIR` / `buildLessonSidecar` output.
