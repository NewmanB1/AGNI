# Typing and language mix

Use this when you need to know where TypeScript vs JavaScript is used and how types are maintained.

## Current state

- **LMS engine (`src/engine/`)** — Written in **TypeScript** (`.ts`). Compiled to `.js` via `npm run build:engine` (tsconfig.engine.json). The hub and theta load the compiled `src/engine/index.js`. Types are in the same repo; keep `src/types/index.d.ts` and engine types in sync when changing state or observation shapes.
- **Rest of core** — **JavaScript** (Node and browser). Types are provided by **`src/types/index.d.ts`** (hand-maintained) and JSDoc where helpful. No TypeScript compilation for compiler, hub-tools, or runtime.
- **Portal** — Vanilla HTML/CSS/JS in `portal/`. No build step; static files served directly.

## Why the mix?

The engine has numerical and stateful logic (Rasch, embeddings, bandit) where type safety pays off. The compiler and runtime are stable and ES5-friendly; adding TypeScript there would be a larger migration. The reference is: **engine = TypeScript; everything else = JavaScript + index.d.ts**.

## Conventions

- When adding or changing **engine** APIs (e.g. `applyObservation`, `LMSState`), update `src/types/index.d.ts` and the engine `.ts` files; run `npm run build:engine`.
- When changing **IR or sidecar** shapes, update `src/types/index.d.ts` (LessonIR, LessonSidecar, etc.) and the compiler/sidecar code. See `docs/playbooks/compiler.md`.
- CI runs `npm run build:engine` so engine TypeScript must compile. Optionally run `npm run typecheck` if the root tsconfig.json is set up for the rest of the repo.

## Single place for shared types

**`src/types/index.d.ts`** — Lesson meta, IR, sidecar, LMS state, governance, etc. Keep this aligned with schemas (`schemas/ols.schema.json`, etc.) and with actual usage in compiler, engine, and hub.
