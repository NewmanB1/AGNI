# Typing and language mix

Use this when you need to know where TypeScript vs JavaScript is used and how types are maintained.

## Current state

- **LMS engine (`packages/agni-engine/`, `src/engine/`)** — **Plain JavaScript (ES5 syntax)**. No TypeScript; no compile step. The hub and theta load `@agni/engine` directly. Types are provided by JSDoc and `src/types/index.d.ts`; keep these in sync when changing state or observation shapes.
- **Rest of core** — **JavaScript** (Node and browser). Types are provided by **`src/types/index.d.ts`** (hand-maintained) and JSDoc where helpful. No TypeScript compilation for compiler, hub-tools, or runtime.
- **Portal** — Vanilla HTML/CSS/JS in `portal/`. No build step; static files served directly.

## Why the mix?

The engine uses ES5-only JavaScript to avoid a compile step and prevent stale-build bugs on the Raspberry Pi hub. The compiler and runtime are ES5-friendly; types are enforced via JSDoc + `checkJs` where applicable.

## Conventions

- When adding or changing **engine** APIs (e.g. `applyObservation`, `LMSState`), update `src/types/index.d.ts` and `packages/agni-engine/*.js`. No build step — Node loads the `.js` files directly.
- When changing **IR or sidecar** shapes, update `src/types/index.d.ts` (LessonIR, LessonSidecar, etc.) and the compiler/sidecar code. See `docs/playbooks/compiler.md`.
- Run `npm run typecheck` to validate JSDoc types across the repo.

## Typecheck scope

- **`npm run typecheck`** — Runs both `tsconfig.json` (src/) and `tsconfig.packages.json` (packages/).
- **`npm run typecheck:packages`** — Validates all packages: module resolution, `.d.ts` coherence. Uses relaxed settings (`checkJs: false`) so JS implementation is not type-checked; tighten over time by enabling `checkJs` and fixing type errors.
- **`npm run typecheck:services`** — Stricter check for `packages/agni-services/` only (full JSDoc validation).

## Single place for shared types

**`src/types/index.d.ts`** — Lesson meta, IR, sidecar, LMS state, governance, etc. Keep this aligned with schemas (`schemas/ols.schema.json`, etc.) and with actual usage in compiler, engine, and hub.

**`packages/types/`** — Re-exports `src/types` for packages that reference `../types` (e.g. `@agni/engine`). Do not add runtime code here.

## Enabling checkJs for packages

Packages are currently type-checked with `checkJs: false` (module resolution and `.d.ts` only). Partial implementation completed: shared types, runtime globals, hub-transform fixes, and `@ts-nocheck` on PWA/polyfills/svg-factories. Remaining work and full plan: **`docs/playbooks/CHECK-JS-ENABLEMENT-PLAN.md`**.
