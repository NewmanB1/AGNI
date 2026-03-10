# Plan: Enable checkJs for Packages Typecheck

This document outlines the plan to fix type mismatches so `checkJs: true` can be enabled in `tsconfig.packages.json`, eliminating the persistence of type bugs in JS implementation code.

**Goal:** `npm run typecheck:packages` passes with `checkJs: true` and strict mode enabled.

**Current state:** `checkJs` is **enabled**; typecheck passes. Engine, hub, utils, ols-* use targeted fixes; runtime uses @ts-nocheck on heavy files.

---

## Implementation Status (Partial)

**Completed:**
- **Phase 0:** `src/types/index.d.ts` — BanditSummary (hubId, exportSequence, posteriorVersion, trainingWindow), BanditState (exportSequence, hubHighWater), MarkovState (optional bigrams, dropouts, cooldowns), LMSSelectResult, HubCompileResult, LessonRequires.integrity
- **Phase 1:** `packages/agni-runtime/index.d.ts` — AgniShared, AgniSvgHelpers, Window globals, AgniStage.export Promise, AgniA11y.injectSettingsButton
- **Phase 2 (partial):** hub-transform JSDoc (compile return type, Error extension, http imports), validateSession/validateStudentSession types, slug array handling
- **@ts-nocheck:** pwa/shared.js, pwa/shell-boot.js, polyfills.js, svg-factories*.js
- **Other:** engine buildDefaultState (count/totalGain/avgGain), explainSelection LMSSelectResult, packages/types re-export, ambient.d.ts (Stage, GridObject, QRious)

**Completed (checkJs enabled):**
- engine: migrations.js (ensureObject cast, for-in types, state cast), pagerank.js (provides/requires guards, Record types), index.js (breakdown type)
- hub: theta.js (@ts-nocheck), sentry.js (Ajv/addFormats @ts-expect-error), routes/student.js (Date arithmetic)
- runtime: player, sensors, shared-runtime, rendering/*, navigator, threshold-evaluator, telemetry, checkpoint, factory-loader, library, svg-catalog (@ts-nocheck)
- utils: binary.js (Buffer.from ArrayBuffer), http-helpers.js (return paths, JSDoc), router.js (params type)
- ols-compiler: markdown-pipeline (rehype-katex @ts-expect-error)
- ols-schema: lesson-schema (Ajv/ajvFormats @ts-expect-error)

---

## Phase 0: Shared Type Declaration Fixes (Foundation)

**Location:** `src/types/index.d.ts`  
**Effort:** Low | **Blocking:** All later phases

### 0.1 LMS / Engine types out of sync

| Type | Missing fields | Used in |
|------|----------------|---------|
| `BanditSummary` | `hubId`, `exportSequence`, `posteriorVersion`, `trainingWindow` | federation.js, index.js |
| `BanditState` | `exportSequence`, `hubHighWater` | index.js |
| `MarkovState` | `buildDefaultState` creates partial object | index.js |
| `select` return | `candidates` | index.js |

**Fix:** Add missing optional fields to types in `src/types/index.d.ts` to match runtime usage. Mark new fields optional where they're added incrementally.

### 0.2 Compile result shape (hub-transform)

hub-transform returns `{ ir, sidecar, lessonIR }` but types expect `{ html, sidecar }`.

**Fix:** Introduce `CompileResult` (or similar) in types; update hub-transform .d.ts or inline JSDoc to use it.

---

## Phase 1: Browser / Window globals

**Location:** `packages/agni-runtime/`, `packages/agni-hub/pwa/`  
**Effort:** Medium | **Dependencies:** None

### 1.1 Window augmentation

Runtime and PWA code use globals not declared on `Window`:

- `LESSON_DATA`, `AGNI_SHARED`, `AGNI_LOADER`, `AGNI_INTEGRITY`, `AGNI_NAVIGATOR`, `AGNI_HUB`, `AGNI_CSP_NONCE`, `AGNI_EDGE_THETA`, `AGNI_FRUSTRATION`, `AGNI_CHECKPOINT`, `AGNI_TELEMETRY`, `AGNI_I18N`, `AGNI_NARRATION`, `AGNI_COMPLETION`, `AGNI_HUB_KEY`, `AGNI_LOAD_TIMEOUT`, `AGNI_RETRY_TIMEOUT`, `OLS_NEXT`, `OLS_ROUTE`, `OLS_BINARY`, `DEV_MODE`, `initPlayer`, `AGNI_SHARED_LOADED`

**Fix:** Add `packages/agni-runtime/global.d.ts` (or extend `src/types/`) with:

```ts
interface Window {
  LESSON_DATA?: unknown;
  AGNI_SHARED?: import('./shared-runtime').AgniShared;
  // ... etc
}
```

Ensure this file is included in tsconfig.packages.

### 1.2 AgniShared / AgniSvgHelpers augmentation

`AGNI_SHARED` has methods/props not declared: `device`, `sensorBridge`, `setSafeHtml`, `parseDurationMs`, `registerStepCleanup`, `mountStepVisual`, `currentStageHandle`, `clearSensorSubscriptions`, `loadLessonVibrationPatterns`, `_urlDevMode`, `mathRenderer`, `tableRenderer`.

`AgniSvgHelpers` missing: `txt`, `clamp`, `polar`, `PALETTE`, `g`, `arcPath`, `assign`.

**Fix:** Update `packages/agni-runtime/index.d.ts` (or shared-runtime types) to declare all runtime-attached properties. Use `[key: string]: unknown` sparingly if needed during transition.

---

## Phase 2: Node / Hub types

**Location:** `packages/agni-hub/`, `packages/agni-utils/`  
**Effort:** Medium | **Dependencies:** Phase 0

### 2.1 HTTP namespace

hub-transform uses `http.IncomingMessage`, `http.ServerResponse` etc. without `@types/node` http types in scope.

**Fix:** Ensure `types: ["node"]` in tsconfig.packages (already present). If errors persist, add explicit `/// <reference types="node" />` in affected files.

### 2.2 Error extensions

`Error` extended with `code`, `retryAfter`, `cycle` in hub-transform and theta.

**Fix:** Use typed error classes or interfaces:

```ts
interface HubError extends Error {
  code?: string;
  retryAfter?: number;
}
interface ThetaError extends Error {
  cycle?: string[];
}
```

Cast or use type guards where these are thrown/caught.

### 2.3 Auth context type

`context/auth.js` expects `role` on context; type has `creatorId`, `error` only.

**Fix:** Add `role?: string` to the context type in hub .d.ts.

### 2.4 theta.js module typing

`theta.js` references `getLessonsSortedByTheta`, `getEffectiveGraphWeights`, `applyRecommendationOverride` — these come from a dynamic require or different module shape.

**Fix:** Ensure theta's .d.ts or JSDoc reflects the actual exports from the theta module (or the module it requires). May require splitting theta into typed submodules.

### 2.5 Ajv constructor/callable

`sentry.js` and `ols-schema/lesson-schema.js` use `new Ajv()` and `addFormat()`. TypeScript reports "not constructable" / "not callable".

**Fix:** Ajv v8 exports differently. Use `import Ajv from 'ajv'` and ensure `esModuleInterop`; or add `// @ts-ignore` with a TODO to fix when Ajv types are corrected. Alternatively, use `Ajv.default` if default export is the constructor.

---

## Phase 3: Empty object / index signature

**Location:** `packages/agni-engine/`, `packages/agni-runtime/`  
**Effort:** Medium | **Dependencies:** Phase 0

### 3.1 `{}` not assignable to `Record<string, T>`

Examples: `markov.js`, `pagerank.js`, `migrations.js`, `navigator.js` — assignments like `var x = {}` later used as `Record<string, number>`.

**Fix:** Use `/** @type {Record<string, number>} */` or `as Record<string, number>` (JSDoc: `@type`) at assignment, or initialize with empty object cast: `/** @type {Record<string, number>} */ ({}).`

### 3.2 Partial MarkovState in buildDefaultState

`buildDefaultState` returns `{ transitions: {}, studentHistory: {} }` for markov; `MarkovState` expects `bigrams`, `dropouts`, `cooldowns`.

**Fix:** Either make those fields optional in `MarkovState`, or ensure `buildDefaultState` returns a complete object. Migration logic may already add them; align type with actual initialization.

---

## Phase 4: unknown / for-in / migrations

**Location:** `packages/agni-engine/migrations.js`  
**Effort:** Low | **Dependencies:** Phase 0

### 4.1 Object/unknown in migrations

- `ensureObject` returns `object`; needs `Record<string, unknown>`.
- `for...in` over `unknown`; needs type guard or assertion.
- `.length`, `.slice` on `unknown`; narrow type before use.

**Fix:** Add JSDoc `@param` / `@returns` with correct types; use `Array.isArray()` or `typeof` guards; add `/** @type {Record<string, unknown>} */` where appropriate.

### 4.2 pagerank.js ontology.provides

`provides` entries may be `{ skill: string }` or string; code accesses `.skill` on string.

**Fix:** Normalize to `LessonSkillRef` before use, or add type guard: `typeof x === 'string' ? x : x.skill`.

---

## Phase 5: Runtime SVG / rendering

**Location:** `packages/agni-runtime/rendering/`  
**Effort:** High | **Dependencies:** Phase 1

### 5.1 number vs string in SVG attributes

Many `cx`, `cy`, `r`, `x`, `y`, `width`, `height` etc. passed as numbers; DOM/SVG expects strings in some contexts.

**Fix:** Use `String(n)` or `'' + n` where DOM expects string; or broaden the helper signatures to accept `number | string` and coerce internally. Prefer fixing the types (SVG attributes accept numbers in many cases) rather than mass code changes.

### 5.2 Stage, GridObject, QRious

`Stage`, `GridObject` are global/browser objects; `QRious` is external.

**Fix:** Declare `Stage`, `GridObject` in global.d.ts or as `/** @type {any} */` where they come from external scripts. Add `@types/qrious` or declare `declare const QRious: any` in a .d.ts.

### 5.3 AgniStage return type

`svg-stage.js` returns `export: () => string | Promise<string>`; `AgniStage` expects `export: () => string`.

**Fix:** Update `AgniStage` to allow `Promise<string>` or ensure implementation always returns sync string.

### 5.4 Polyfills (NodeList, URLSearchParams)

polyfills.js patches `NodeList.forEach` and `URLSearchParams`; types conflict with DOM lib.

**Fix:** Use `// @ts-nocheck` for polyfills file (they mimic DOM in non-DOM envs), or add a minimal .d.ts that declares the polyfilled signatures. Polyfills are inherently type-unsafe.

---

## Phase 6: Other packages

**Location:** `packages/agni-cli/`, `packages/agni-utils/`, `packages/ols-compiler/`, `packages/ols-schema/`  
**Effort:** Low–Medium | **Dependencies:** Phase 0, 2

### 6.1 agni-cli

- `process`, `__dirname`, `require` — already covered by `@types/node`.
- Implicit `any` on callback params — add JSDoc `@param` types.
- `err: unknown` in catch — use `err instanceof Error` or `/** @type {Error} */ (err)`.

### 6.2 agni-utils

- `binary.js`: Buffer.from overload — use correct overload or explicit cast.
- `http-helpers.js`: not all code paths return — add explicit return or fix control flow.
- `router.js`: empty object to `Record<string, string>` — type the return.

### 6.3 ols-compiler markdown-pipeline

KaTeX options type mismatch — `renderToString` expects different options shape.

**Fix:** Align options object with `@types/katex` or use type assertion if API is correct.

### 6.4 threshold-evaluator invalid character

Line 272: `error TS1127: Invalid character` — likely a non-ASCII or template literal issue.

**Fix:** Inspect line 272; fix syntax or encoding.

### 6.5 student.js arithmetic

`routes/student.js` line 102: arithmetic on non-number types.

**Fix:** Ensure operands are numbers (parseInt/parseFloat) or add type assertion.

---

## Implementation Order

| Order | Phase | Est. effort | Rationale |
|-------|-------|-------------|-----------|
| 1 | Phase 0 | 0.5–1 day | Unblocks all other fixes |
| 2 | Phase 2.5 (Ajv) | 0.5 day | Quick wins, affects multiple packages |
| 3 | Phase 1 | 1–2 days | Big error count reduction |
| 4 | Phase 3 | 1 day | Mechanical fixes |
| 5 | Phase 4 | 0.5 day | Localized to migrations |
| 6 | Phase 2 (rest) | 1 day | Hub-specific |
| 7 | Phase 5 | 2–3 days | Many files, many errors |
| 8 | Phase 6 | 1 day | Scattered small fixes |

**Total estimate:** 7–10 days of focused work.

---

## Verification

After each phase:

1. Enable `checkJs: true` in `tsconfig.packages.json`.
2. Run `npm run typecheck:packages`.
3. Fix any new failures; commit per phase.
4. When clean: remove `noImplicitAny: false` and `strict: false` from packages config, fix remaining strict-mode errors.

---

## References

- **`docs/playbooks/CHECK-JS-FINISH-PLAN.md`** — detailed per-file plan for engine, hub, runtime, utils, ols-compiler, ols-schema
- `docs/playbooks/typing-and-languages.md` — current typing conventions
- `src/types/index.d.ts` — central type definitions
- `packages/agni-runtime/index.d.ts` — runtime types
- Typecheck errors captured via: `npx tsc -p tsconfig.packages.json --noEmit` with `checkJs: true`
