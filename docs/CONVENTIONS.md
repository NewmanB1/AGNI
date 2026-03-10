# AGNI coding conventions (LLM-friendly)

These rules keep the codebase navigable and safe to change with tooling and LLM assistance.

## Module layout

- **One clear role per module.** If a file grows beyond a single responsibility, split it (e.g. player → player/state, player/navigation).
- **Re-exports in `src/`:** When adding or editing a thin re-export file, use the standard format: `'use strict';` + `// Phase 1: Re-export from <package> (canonical ownership)` + `module.exports = require('...');`. See `.cursor/rules/canonical-ownership.md`.
- **Public API via index.** Each logical module (`src/compiler`, `src/engine`, `src/governance`, `@agni/services`) exposes a small surface via an `index.js`. New public functions should be exported from that index so they're discoverable; hide helpers inside the module.
- **Top-down entry points.** Callers (CLI, hub, portal) use the **services layer** (`@agni/services` canonical; `src/services/` are shims) or documented HTTP API; they do not require compiler/engine/governance internals directly.

## Functions and state

- **Prefer small, pure functions** with explicit parameters. Avoid hidden globals except the deliberate runtime globals (`AGNI_SHARED`, `LESSON_DATA`, etc.) in the browser.
- **No hidden globals in Node.** Configuration via function arguments, env vars, or injected options. Singleton state (e.g. LMS in-memory state) lives in the module that owns it and is accessed via the public API.

## Error return conventions

- **Service-layer functions** (called by route handlers or other services) return `{ error: string }` on failure and `{ data... }` on success. Callers check `.error` — no try/catch needed.
- **Internal pipeline functions** (used within a single module) may throw. The calling service function catches and converts to `{ error }`.
- **CLI entry points** may throw; the CLI wrapper prints the error and exits.
- Example: `runCompilePipeline()` returns `{ ir, sidecar }` or `{ error }`. `compileLessonFromYamlFile()` throws because the CLI wraps it in try/catch.

## Middleware wrappers (hub)

Route-level cross-cutting concerns use middleware factories in `packages/agni-hub/shared.js` and `packages/agni-hub/context/`:

- **`adminOnly(handler)`** — verifies admin session, injects `creator` into context, returns 401 on failure.
- **`requireLms(handler)`** — checks `lmsService.isAvailable()`, returns 503 if engine is down.
- **`withRateLimit(handler)`** — applies IP-based rate limiting via `checkAuthRateLimit`.
- **`requireParam(name)`** — validates a required query parameter, returns 400 if missing.

Wrap individual route handlers: `router.get('/path', adminOnly((req, res, ctx) => { ... }))`.

## YAML/IR schema versioning

When introducing a new schema version (e.g. in `schemas/ols.schema.json`), update `KNOWN_SCHEMA_VERSIONS` in `packages/ols-compiler/compiler/build-lesson-ir.js` so the compiler recognizes it. Offline hubs may receive YAML with new fields; unrecognized versions log a warning and continue with best-effort parse. Document version changes in release notes or `docs/CHANGELOG.md`.

## Schema-backed JSON persistence (governance)

Use `createSchemaStore(schemaPath, defaults, logger)` from `packages/agni-governance/schema-store.js` for any JSON file that has an associated JSON Schema. Returns `{ validate, load, save }` — encapsulates Ajv setup, validation on load/save, atomic writes, and fallback defaults.

Used by `policy.js` and `catalog.js`. Prefer this over manual Ajv + fs.readFile + fs.writeFile patterns.

## Shared runtime registration (ES5 browser modules)

Browser runtime modules register on `global.AGNI_*` namespaces. Shared utilities live in `packages/agni-runtime/shared-runtime.js` (registered as `AGNI_SHARED`).

When adding a new shared utility:
1. Add the function to `shared-runtime.js` inside the IIFE.
2. Attach it to the `AGNI_SHARED` export object.
3. In consuming modules, read via `var S = global.AGNI_SHARED; S.myFunction(...)`.
4. For robustness in test environments where load order is not guaranteed, provide a local fallback: `var fn = (S && S.myFunction) || function(...) { ... };`.
5. All runtime code must be ES5-compatible (no `let`/`const`, arrow functions, template literals, `class`, spread, or ES modules).

## Shared I/O utilities

`packages/agni-utils/io.js` provides reusable file and string helpers:

- **`ensureDir(dir)`** — recursive mkdir if missing.
- **`readFileSafe(path)`** — returns content or null on ENOENT.
- **`writeIfNewer(sourceMtimeMs, destPath, content)`** — skips write if dest is up-to-date.
- **`copyIfNewer(sourcePath, destPath)`** — copies only when source is newer.
- **`escapeHtml(str)`** — escape `& < > " '` for safe HTML embedding.

Use these instead of ad-hoc mtime checks or inline escape functions.

## Documentation

- **Header comment on every module.** At the top of each file, add a short block: what the file does, who uses it, and any cross-cutting contract (e.g. "Binding hash must match crypto.js and player.js").
- **JSDoc for public functions.** Parameters, return type, and one-line description. Use `@param` and `@returns`; for types from `src/types`, use `import('../types').TypeName` in JSDoc.

## Types and contracts

- **Shared types in `src/types/index.d.ts`.** IR, sidecar, LMS state, governance, and API payloads. When you add a new field to the IR or sidecar, update the type and the compiler/governance code together.
- **API contract in `docs/api-contract.md`.** Any new or changed hub HTTP endpoint must be documented there and reflected in `portal/js/api.js` if the portal uses it.

## Playbooks

- **"How to modify X" playbooks** live in `docs/playbooks/`: `compiler.md`, `runtime.md`, `lms.md`, `governance.md`. Use them to find the right files and avoid breaking contracts when changing behaviour.

## Lint and type checks

- **ESLint + Prettier** apply to `src/**/*.js` (and optionally `server/`, `hub-tools/`). Run `npm run lint` and `npm run format:check` before committing.
- **TypeScript:** `npm run typecheck` runs `tsc --noEmit` for `src/**/*.ts` (engine and any future TS modules). Fix type errors so that refactors don't silently break callers.
- New code in `src/services/` or `src/engine/` should satisfy lint and, if it's TypeScript, typecheck. Adding `.ts` under `src/` will include it in typecheck automatically.

## Summary for LLMs

1. Prefer small, pure functions; no hidden globals in Node.
2. Export new public API from the module's `index.js`.
3. Add a header comment and JSDoc for public functions.
4. Service-layer functions return `{ error }` on failure; internal functions throw.
5. Use middleware wrappers (`adminOnly`, `requireLms`, `withRateLimit`) for route guards.
6. Use `createSchemaStore` for schema-validated JSON persistence.
7. Add shared browser utilities to `AGNI_SHARED` in `shared-runtime.js` (ES5 only).
8. Use `src/utils/io.js` for file freshness checks and HTML escaping.
9. Update `src/types/index.d.ts` and `docs/api-contract.md` when changing data or HTTP contracts.
10. Use `docs/playbooks/*.md` to find where to change compiler, runtime, LMS, or governance.
11. Run `npm run lint`, `npm run format:check`, and `npm run typecheck` after edits.
