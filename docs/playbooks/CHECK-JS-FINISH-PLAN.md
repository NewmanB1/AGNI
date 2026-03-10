# Plan: Finish Enabling checkJs (Engine, Hub, Runtime, Utils, OLS)

This document is the **implementation plan** to finish enabling `checkJs: true` in `tsconfig.packages.json` for the packages listed below. It complements `CHECK-JS-ENABLEMENT-PLAN.md` and focuses on the remaining per-file fixes with specific line numbers and strategies.

**Scope:** engine, hub, runtime, utils, ols-compiler, ols-schema

**Verification:** After each package or phase, run `npm run typecheck:packages` with `checkJs: true`.

---

## Summary by Package

| Package      | Files affected | Est. effort | Priority |
|-------------|----------------|-------------|----------|
| agni-engine | 3              | 0.5 day     | 1        |
| agni-hub    | 3              | 0.5 day     | 2        |
| agni-utils  | 3              | 0.25 day    | 3        |
| ols-schema  | 1              | 0.1 day     | 4        |
| ols-compiler| 1              | 0.1 day     | 5        |
| agni-runtime| ~20            | 1.5 days    | 6        |

**Total:** ~5–6 days of focused work.

---

## 1. @agni/engine

### 1.1 migrations.js

| Line | Issue | Fix |
|------|-------|-----|
| 21   | `return o` — `object` not assignable to `Record<string, unknown>` | Add cast: `return /** @type {Record<string, unknown>} */ (o);` |
| 249–250 | `markovHistory[sid].length` / `.slice` — `markovHistory[sid]` may be unknown | After `markovHistory[sid] = []`, it’s an array; use `/** @type {Array} */ (markovHistory[sid])` before `.length`/`.slice` or narrow with `Array.isArray()` guard |
| 262   | `es` in for-in — inferred as unknown | Add `/** @type {Record<string, { count?: number }>} */` for `markovTransitions[k]` |
| 276   | Same pattern for `markovBigrams[k]` | Same JSDoc |
| 315   | `state.embedding.dim` / `state.bandit.featureDim` — LMSState vs typed shape | State is built from migrations; ensure `state` JSDoc or use `/** @type {import('../types').LMSState} */` before invariant check |

**Strategy:** Add JSDoc `@type` casts at the specific problematic expressions. Prefer type guards where they improve clarity.

### 1.2 pagerank.js

| Line | Issue | Fix |
|------|-------|-----|
| 102, 109 | `provides[p].skill` / `requires[r].skill` when entry is string | Already guarded: `typeof x === 'string' ? x : x.skill`; if `x` is `{ skill }`, add fallback: `(typeof x === 'object' && x && 'skill' in x) ? x.skill : String(x)` to satisfy strictness |
| 153   | `return { nodes, edges }` — `edges` is `{}` | Add `/** @type {Record<string, string[]>} */ (edges)` or declare `var edges = /** @type {Record<string, string[]>} */ ({});` at init |
| 199   | `nodeSet`, `edges`, `weights` — `{}` to index signatures | Declare with JSDoc: `/** @type {Record<string, boolean>} */ var nodeSet = {};` and similar for edges/weights |
| 273, 363, 431 | `var result = {}` returned as `Object.<string, number>` | Use `/** @type {Record<string, number>} */ (result)` at return, or declare `/** @type {Record<string, number>} */ var result = {};` |

**Strategy:** Initialize accumulators with `/** @type {Record<string, T>} */ ({})` or cast at return. Add guards for `provides`/`requires` entries.

### 1.3 index.js

| Line | Issue | Fix |
|------|-------|-----|
| 516  | `breakdown: breakdown` — `{}` vs `Record<string, unknown>` | Declare `var breakdown = /** @type {Record<string, unknown>} */ ({});` at line 476 |

---

## 2. @agni/hub

### 2.1 theta.js

| Line | Issue | Fix |
|------|-------|-----|
| 37   | `log.info(..., lmsEngine.getStatus())` — `log` may not have `info` | Ensure `log` is typed as `{ info: (msg: string, meta?: object) => void; warn: (...) => void; ... }` in shared or add `// @ts-expect-error` with comment if log shape varies |
| 139–140 | `err.code = 'SKILL_GRAPH_CYCLE'`; `err.cycle = cycle` | Extend Error: add `interface ThetaError extends Error { code?: string; cycle?: string[] }` in hub types; cast: `/** @type {ThetaError} */ (err)` before assigning |
| 463   | `ctx.getLessonsSortedByTheta = ...` — ctx shape | Add to shared context type: `getLessonsSortedByTheta?: ...`, `getEffectiveGraphWeights?: ...`, `applyRecommendationOverride?: ...` |
| 473–475 | `require('./routes/theta')` etc. — dynamic require | Types from require are fine; if `register` shape is wrong, add JSDoc to route modules |
| 568   | `server.address().port` — `address()` returns `string \| AddressInfo` | Use: `const addr = server.address(); const port = typeof addr === 'object' && addr ? addr.port : listenPort;` then `log.info('API listening', { port })` |

**Strategy:** Add `ThetaError` interface; fix `server.address()` handling; extend shared context type for injected functions.

### 2.2 sentry.js

| Line | Issue | Fix |
|------|-------|-----|
| 287–288 | `new Ajv()` / `addFormats(ajv)` — "not constructable" / module shape | Add `// @ts-expect-error — Ajv default export type does not match CJS usage` above `const ajv = new Ajv(...)` and `addFormats(ajv)` if needed. Alternative: `const Ajv = require('ajv').default || require('ajv');` |

**Strategy:** Use `@ts-expect-error` with a short comment; Ajv v8 CJS interop is known to be awkward.

### 2.3 routes/student.js

| Line | Issue | Fix |
|------|-------|-----|
| 102  | `new Date(a.completedAt) - new Date(b.completedAt)` — arithmetic on Date (coerced to number) | TypeScript may complain about `-` on non-number. Use `Number(new Date(a.completedAt)) - Number(new Date(b.completedAt))` or `+new Date(a.completedAt) - +new Date(b.completedAt)` |

**Strategy:** Explicit numeric coercion for Date subtraction.

---

## 3. @agni/utils

### 3.1 binary.js

| Line | Issue | Fix |
|------|-------|-----|
| 23   | `Buffer.from(bytes)` — overload for `ArrayBuffer`/`Uint8Array` | JSDoc says `Buffer|Uint8Array|ArrayBuffer`. Use: `Buffer.from(/** @type {Buffer|Uint8Array|ArrayBuffer} */ (bytes))` or ensure bytes is typed; `Buffer.from` accepts these. If error is about overload resolution, use `Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)` |

**Strategy:** Cast or narrow type so the correct `Buffer.from` overload is chosen.

### 3.2 http-helpers.js

| Line | Issue | Fix |
|------|-------|-----|
| 55   | Not all code paths return (in callback) | The callback in `zlib.gzip` doesn’t return; the outer `sendResponse` returns void. Add `return` before `res.writeHead`/`res.end` if the linter expects it, or add `return undefined` at end of callback. Actually the issue may be that `createResponseSender`’s inner function doesn’t return on all paths—it’s a void function, so ensure it’s typed as `(statusCode: number, payload: unknown) => void` |
| 112  | `@param qs` vs actual parameter `_qs` | Fix JSDoc: use `@param {Record<string, string>} _qs` or rename param to `qs` for consistency |

**Strategy:** Align JSDoc with implementation; ensure return type of `createResponseSender` is `void` and all branches are consistent.

### 3.3 router.js

| Line | Issue | Fix |
|------|-------|-----|
| 28   | `params = {}` — `{}` not assignable to `Record<string, string>` | Use `/** @type {Record<string, string>} */ var params = {};` in `matchPath` |

---

## 4. @ols/schema

### 4.1 lesson-schema.js

| Line | Issue | Fix |
|------|-------|-----|
| 39–40 | `new Ajv()` / `ajvFormats(ajv)` — same as sentry | Add `// @ts-expect-error — Ajv CJS constructor` above `new Ajv(...)` and `ajvFormats(ajv)` if needed |

---

## 5. @ols/compiler

### 5.1 markdown-pipeline.js

| Line | Issue | Fix |
|------|-------|-----|
| 23   | `rehypeKatex` options — type mismatch with `@types/katex` | Options `{ output: 'html', throwOnError: false, errorColor: '...' }` may not match expected shape. Add `/** @type {import('rehype-katex').Options} */` or `// @ts-expect-error — rehype-katex options` if types are incorrect |

---

## 6. @agni/runtime

Runtime has the largest number of errors (~120+). Patterns:

1. **Global usage:** `global.LESSON_DATA`, `global.AGNI_*` — `global` not augmented
2. **Union types:** `log` as `{ debug, warn } | undefined` — optional chaining or guards
3. **DOM types:** `Element` vs `HTMLElement`, `document.getElementById` return
4. **LESSON_DATA as unknown:** Property access on `lesson`, `steps`, etc.
5. **Callback types:** `Function` vs specific handler signatures
6. **DeviceMotionEvent.requestPermission:** May not exist in lib
7. **Svg/Stage:** External types (Stage, GridObject) and helper return types

### 6.1 Global augmentation

Add to `packages/agni-runtime/index.d.ts` or a `global.d.ts`:

```ts
declare global {
  var LESSON_DATA: unknown;
  var DEV_MODE: boolean;
  var AGNI_SHARED: import('./index').AgniShared | undefined;
  var AGNI_I18N: { t?: (key: string) => string } | undefined;
  var AGNI_NARRATION: { isEnabled: () => boolean; cancel: () => void; setLang: (l: string) => void; ... } | undefined;
  var AGNI_FRUSTRATION: unknown;
  var AGNI_CHECKPOINT: unknown;
  // ... other AGNI_* as needed
}
```

Ensure `global` is used where the code uses `global.X` (not `window.X`).

### 6.2 Per-file strategy

| File | Error count | Strategy |
|------|-------------|----------|
| player.js | ~60 | Extend Window/global; add JSDoc for `lesson`/`steps` from `LESSON_DATA`; optional chaining for `log`, `_narr`, `_ckpt`, `_frust`; type `getElementById` results as `HTMLElement \| null` |
| sensor-bridge.js | ~18 | Type `DeviceMotionEvent` with optional `requestPermission`; type sensor callback params; extend global if needed |
| shared-runtime.js | ~10 | Same global + `log` typing; LESSON_DATA access |
| svg-registry.js | ~6 | Stage/GridObject types; helper return types |
| svg-stage.js | ~1 | Export return type |
| table-renderer.js | ~6 | Similar to math-renderer |
| math-renderer.js | ~8 | KaTeX/options types; element types |
| navigator.js | ~3 | Callback/return types |
| threshold-evaluator.js | ~4 | Expr typing; line 272 invalid char (check encoding) |
| telemetry/*.js | ~15 | LESSON_DATA, log, types |
| checkpoint.js | ~4 | Types for checkpoint shape |
| factory-loader.js | ~2 | Factory types |
| shell/library.js | ~5 | Module/callback types |
| svg-catalog.js | ~1 | Import/export type |

### 6.3 Option: @ts-nocheck for heaviest files

If fixing player.js and sensor-bridge.js completely is too costly:

- Add `// @ts-nocheck` at top of `player.js`, `sensor-bridge.js`, and optionally `shared-runtime.js`
- Fix the remaining runtime files (rendering, telemetry, etc.) for a partial win

Recommendation: Prefer targeted fixes (global augmentation + key JSDoc) over nocheck to retain type safety in critical paths.

---

## Implementation Order

1. **Engine** (migrations, pagerank, index) — unblocks nothing but is small and isolated
2. **Utils** (binary, http-helpers, router) — quick wins
3. **ols-schema, ols-compiler** — single-file each
4. **Hub** (theta, sentry, student) — moderate, well-scoped
5. **Runtime** — global augmentation first, then player/sensors/rendering/telemetry

---

## Verification Checklist

- [x] Set `checkJs: true` in `tsconfig.packages.json`
- [x] Run `npm run typecheck:packages` — zero errors
- [ ] Run `verify:all` or equivalent CI
- [ ] Smoke-test: hub starts, lesson loads in browser, LMS/theta work
- [ ] Update `CHECK-JS-ENABLEMENT-PLAN.md` status when complete

---

## References

- `docs/playbooks/CHECK-JS-ENABLEMENT-PLAN.md` — original plan, Phase 0–6
- `src/types/index.d.ts` — shared types
- `packages/agni-runtime/index.d.ts` — runtime/Window globals
