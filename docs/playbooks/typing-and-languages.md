# Typing and language mix

Use this when you need to know where TypeScript vs JavaScript is used and how types are maintained.

## Current state

- **LMS engine (`packages/agni-engine/`)** — **Plain JavaScript (ES5 syntax)**. No TypeScript; no compile step. The hub and theta load `@agni/engine` directly. Types are provided by JSDoc and `packages/types/index.d.ts`; keep these in sync when changing state or observation shapes.
- **Rest of core** — **JavaScript** (Node and browser). Types are provided by **`packages/types/index.d.ts`** (hand-maintained) and JSDoc where helpful. No TypeScript compilation for compiler, hub-tools, or runtime.
- **Portal** — Vanilla HTML/CSS/JS in `portal/`. No build step; static files served directly.

## Why the mix?

The engine uses ES5-only JavaScript to avoid a compile step and prevent stale-build bugs on the Raspberry Pi hub. The compiler and runtime are ES5-friendly; types are enforced via JSDoc + `checkJs` where applicable.

## Conventions

- When adding or changing **engine** APIs (e.g. `applyObservation`, `LMSState`), update `packages/types/index.d.ts` and `packages/agni-engine/*.js`. No build step — Node loads the `.js` files directly.
- When changing **IR or sidecar** shapes, update `packages/types/index.d.ts` (LessonIR, LessonSidecar, etc.) and the compiler/sidecar code. See `docs/playbooks/compiler.md`.
- Run `npm run typecheck` to validate JSDoc types across the repo.

## Typecheck scope

- **`npm run typecheck`** — Runs both `tsconfig.json` and `tsconfig.packages.json` (packages/).
- **`npm run typecheck:packages`** — Validates all packages with `checkJs: true`. Module resolution, `.d.ts` coherence, and JSDoc types are checked. Some runtime/PWA files use `@ts-nocheck` where global typing is complex (see `CHECK-JS-ENABLEMENT-PLAN.md`).
- **`npm run typecheck:services`** — Stricter check for `packages/agni-services/` only (full JSDoc validation).

## Single place for shared types

**`packages/types/index.d.ts`** — Lesson meta, IR, sidecar, LMS state, governance, etc. Canonical type definitions. Keep aligned with schemas (`schemas/ols.schema.json`, etc.) and with actual usage in compiler, engine, and hub. Do not add runtime code here.

## checkJs and hardware constraints

**checkJs has zero impact on edge devices or the Raspberry Pi hub.** Typecheck (`tsc --noEmit`) runs only on dev machines and CI. It produces no build artifacts and does not change any deployed code. Edge devices (Android Nougat) run the same JS files; only syntax is constrained by `test:es5`. Type annotations in JSDoc are stripped at runtime and do not affect bundle size or execution.

## checkJs status

Packages are type-checked with **`checkJs: true`**. Engine, hub, utils, and ols-* are checked. Some runtime/PWA files use `@ts-nocheck` where global typing (`LESSON_DATA`, `AGNI_*`, DOM) would require extensive augmentation. Full plan and remaining work: **`docs/playbooks/CHECK-JS-ENABLEMENT-PLAN.md`**.
