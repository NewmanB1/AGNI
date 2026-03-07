# Document Review — March 2025

Thorough review of docs against actual code. Issues found and corrected.

---

## 1. ARCHITECTURE.md

### Inaccuracies found

| Location | Doc says | Actual code |
|----------|----------|-------------|
| §3.1 Modular Structure | `src/compiler/buildLessonIR.js` | Canonical: `packages/ols-compiler/compiler/build-lesson-ir.js` (hyphen, different path) |
| §3.1 | `src/config.js` — processMarkdown | Markdown pipeline: `packages/ols-compiler/markdown-pipeline.js` (no src/config.js) |
| §3.1 | `src/utils/featureInference.js` | `packages/agni-utils/feature-inference.js` (hyphen) |
| §3.1 | `src/utils/runtimeManifest.js` | `packages/agni-utils/runtimeManifest.js` |
| §3.1 | `server/` contains hub-transform, pwa/, sw.js | hub-transform and sw.js live in `packages/agni-hub/`; server/ is a shim |
| §3.1 | theta.js in hub-tools/ | hub-tools/theta.js is a wrapper; real theta is `packages/agni-hub/theta.js` |
| §7.2 Table | `rasch.ts`, `embeddings.ts`, `thompson.ts`, `federation.ts` | All are `.js` (plain JavaScript, no TypeScript in engine) |
| §7.2 | Engine in `src/engine/` | Canonical: `packages/agni-engine/` |

### Status

Corrections applied to ARCHITECTURE.md.

---

## 2. docs/playbooks/compiler.md

### Inaccuracies found

| Location | Doc says | Actual |
|----------|----------|--------|
| Change Markdown pipeline | `src/config.js` — processMarkdown() | `packages/ols-compiler/markdown-pipeline.js` |
| Change IR shape | `src/compiler/buildLessonIR.js` | `packages/ols-compiler/compiler/build-lesson-ir.js` |
| Change HTML output | `src/builders/html.js` and `server/hub-transform.js` | Canonical: `packages/ols-compiler/builders/html.js`, `packages/agni-hub/hub-transform.js` |

### Status

Corrections applied.

---

## 3. docs/playbooks/runtime.md

### Inaccuracies found

| Location | Doc says | Actual |
|----------|----------|--------|
| Entry points | `src/runtime/player.js`, `src/runtime/shared-runtime.js`, etc. | Canonical: `packages/agni-runtime/ui/player.js`, `packages/agni-runtime/shared-runtime.js`, etc. |
| Loader | `packages/agni-utils/feature-inference.js` | Correct (feature-inference, with hyphen) |
| Integrity | `src/runtime/integrity.js` | `packages/agni-runtime/integrity/integrity.js` |
| Change sensor | `src/runtime/sensor-bridge.js` | `packages/agni-runtime/sensors/sensor-bridge.js` |

### Status

Corrections applied to use canonical packages/agni-runtime paths.

---

## 4. docs/playbooks/lms.md

### Inaccuracies found

| Location | Doc says | Actual |
|----------|----------|--------|
| Change ability, vectors, bandit, federation, math | `src/engine/rasch.js`, etc. | Canonical: `packages/agni-engine/rasch.js`, etc. |

### Status

Corrections applied.

---

## 5. docs/CONVENTIONS.md

### Inaccuracies found

| Location | Doc says | Actual |
|----------|----------|--------|
| createSchemaStore | `src/governance/schema-store.js` | Canonical: `packages/agni-governance/schema-store.js` |
| Shared runtime | `src/runtime/shared-runtime.js` | Canonical: `packages/agni-runtime/shared-runtime.js` |
| API contract | `portal/src/lib/api.ts` | Portal uses `portal/js/api.js` (no .ts) |

### Status

Corrections applied.

---

## 6. docs/ONBOARDING-CONCEPTS.md

### Inaccuracies found

| Location | Doc says | Actual |
|----------|----------|--------|
| Rasch | `src/engine/rasch.js` | `packages/agni-engine/rasch.js` |
| Thompson | `src/engine/thompson.js` | `packages/agni-engine/thompson.js` |
| hub-transform | `server/hub-transform.js` | `packages/agni-hub/hub-transform.js` (server/ is shim) |

### Status

Corrections applied.

---

## 7. RUN-ENVIRONMENTS.md

### Verification

- Edge paths, hub paths, and verification commands checked against code. **Accurate.**
- packages/agni-services correctly lists compiler, lesson-chain, lesson-schema (from index.js).

### Status

No changes needed.

---

## 8. Code bug: Village Library shell

### Bug

`src/runtime/shell/index.html` has `id="lesson-grid"` on the container div, but `packages/agni-runtime/shell/library.js` calls `document.getElementById('lesson-list')`. The element is null, so `listEl.innerHTML = ''` throws.

### Fix

Change the HTML to use `id="lesson-list"` so it matches library.js, or add a wrapper with that id. The grid div is the container; library appends cards to it. Correct fix: use `id="lesson-list"` on the grid div (library expects the parent of the cards).

### Status

Fix applied.

---

## 9. .cursor/rules/sprint-verification.md

### Updates

- ES5 gate label updated: now "ES5 compliance (runtime + hub sw/pwa)" to reflect `check-es5.js` scope.
- Run-environments gate added: `scripts/check-run-environments.js` / `verify:run-environments`.

---

## Summary

- **ARCHITECTURE.md:** 8 corrections (paths, file names, .ts→.js)
- **compiler.md:** 3 corrections
- **runtime.md:** 4 corrections  
- **lms.md:** 1 correction (paths to packages/agni-engine)
- **CONVENTIONS.md:** 3 corrections
- **ONBOARDING-CONCEPTS.md:** 3 corrections
- **Code:** 1 fix (shell lesson-list/lesson-grid mismatch)
