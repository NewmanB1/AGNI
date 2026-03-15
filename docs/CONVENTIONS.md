# AGNI coding conventions (LLM-friendly)

These rules keep the codebase navigable and safe to change with tooling and LLM assistance.

## Module layout

- **One clear role per module.** If a file grows beyond a single responsibility, split it (e.g. player → player/state, player/navigation).
- **Public API via index.** Each logical module (`packages/ols-compiler/`, `packages/agni-engine/`, `packages/agni-governance/`, `@agni/services`) exposes a small surface via an `index.js`. New public functions should be exported from that index so they're discoverable; hide helpers inside the module. Prefer `require('@agni/package')` or `require('@agni/package/index')` over requiring deep internal paths (e.g. `@agni/package/lib/foo.js`). **Tests and scripts:** use package index imports where possible; `verify:canonical-imports` enforces that tests and scripts do not require from `src/` and prefer `@agni/*` / `@ols/*`. When adding new tests, require from the package index unless the test explicitly targets an internal path.
- **Top-down entry points.** Callers (CLI, hub, portal) use the **services layer** (`@agni/services`) or documented HTTP API; they do not require compiler/engine/governance internals directly.

## Functions and state

- **Prefer small, pure functions** with explicit parameters. Avoid hidden globals except the deliberate runtime globals (`AGNI_SHARED`, `LESSON_DATA`, etc.) in the browser.
- **No hidden globals in Node.** Configuration via function arguments, env vars, or injected options. Singleton state (e.g. LMS in-memory state) lives in the module that owns it and is accessed via the public API.

## Error return conventions

- **Service-layer functions** (called by route handlers or other services) return `{ error: string }` on failure and `{ data... }` on success. Callers check `.error` — no try/catch needed. This applies to all functions exported from `@agni/services` and to any function invoked by hub route handlers; consistent return shape keeps the codebase predictable and avoids uncaught throws in the request path.
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

Use **`createSchemaStore`** from `packages/agni-governance/schema-store.js` when you need a **persistent JSON file** that is validated on load and save (e.g. policy.json, catalog.json). It gives you `{ validate, load, save }`, Ajv compilation, atomic writes, and fallback defaults. Used by `policy.js` and `catalog.js`.

Use **direct Ajv** (e.g. `createSchemaValidator()` from `@agni/utils/schema-validator` plus `ajv.compile(schema)`) when you only need **one-off validation** with no load/save (e.g. validating a request body, a lesson IR in memory, or graph_weights in the telemetry engine). No need for a “store” or file path.

**Summary:** Persistent schema-validated JSON file → `createSchemaStore`. In-memory or request validation only → direct Ajv.

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

## Centralized shared patterns

Avoid duplicating logic that already has a canonical home. Use these instead of ad-hoc implementations:

| Need | Use | Avoid |
|------|-----|--------|
| File I/O, mtime, HTML escape | `@agni/utils/io` (ensureDir, readFileSafe, writeIfNewer, copyIfNewer, escapeHtml) | Inline fs + mtime checks, manual escape |
| Schema-validated JSON load/save | `createSchemaStore()` in `packages/agni-governance/schema-store.js` | Manual Ajv + readFile + writeFile |
| Route auth and guards | Hub middleware: `adminOnly`, `requireLms`, `withRateLimit`, `requireParam` in `packages/agni-hub/shared.js` and `context/` | Inline auth checks in handlers |
| Binary/base64 helpers | `@agni/utils/binary`, runtime binary-utils | Ad-hoc Buffer/encoding logic |

When adding new cross-cutting behavior, consider a shared module or middleware so it can be reused and tested once.

## Documentation

- **Header comment on every module.** At the top of each file, add a short block: what the file does, who uses it, and any cross-cutting contract (e.g. "Binding hash must match crypto.js and player.js").
- **JSDoc for public functions.** Parameters, return type, and one-line description. Use `@param` and `@returns`; for types from `@agni/types`, use `import('@agni/types').TypeName` in JSDoc.

## Types and contracts

- **Shared types in `packages/types/index.d.ts`.** IR, sidecar, LMS state, governance, and API payloads. IR and sidecar types are **schema-driven** — when you add a field to the IR or sidecar, update `schemas/lesson-ir.schema.json` or `schemas/lesson-sidecar.schema.json`, run `npm run codegen:types`, and update the compiler/governance code.
- **Schema-first workflow.** When adding or changing a field in IR, sidecar, or other schema-backed data: (1) update the JSON Schema in `schemas/` first, (2) run `npm run codegen:types` (and any codegen:validate-schemas), (3) then update compiler/engine/governance code. This keeps the reference implementation aligned with the spec and avoids drift. See `docs/playbooks/schema-to-types.md` for details.
- **API contract in `docs/api-contract.md`.** Any new or changed hub HTTP endpoint must be documented there and reflected in `portal/js/api.js` if the portal uses it. `verify:api-contract-routes` fails if a route exists in code but not in the contract.

## Playbooks

- **"How to modify X" playbooks** live in `docs/playbooks/`: `compiler.md`, `runtime.md`, `lms.md`, `governance.md`, `hub.md`, `services.md`, `portal.md`, `schema-to-types.md`, `lti.md`, `mesh-lora.md`. Use them to find the right files and avoid breaking contracts when changing behaviour.

## Top 10 maintainability practices

These practices keep the codebase easy to change and safe to refactor:

1. **Align tests and docs with the real API** — Contract tests, E2E, and portal should call the same routes and names as production. Avoid legacy aliases in tests.
2. **Automate contract checks** — Scripts (e.g. `verify:api-contract-routes`, `verify:portal-api-contract`) and CI catch missing or wrong endpoints before merge.
3. **Single source of truth for naming and API** — Canonical API paths and route names live in `docs/api-contract.md`; hub route table in `packages/agni-hub/README.md`. Other docs and playbooks reference these; fix naming in one place.
4. **Shrink allowlists; add real headers** — Prefer adding module headers and fixing structure over adding paths to allowlists (e.g. `check-module-headers`).
5. **Pre-push or pre-commit verification** — Run `verify:all` before push (see `scripts/pre-push-verify.sh` and CONTRIBUTING). Reduces last-minute fixes and broken main.
6. **Prefer package index in tests and scripts** — Use `require('@agni/package')` where possible; `verify:canonical-imports` forbids `src/`. New tests should use package index unless they target an internal path.
7. **Release and schema-change checklists** — CONTRIBUTING has a release checklist (CHANGELOG, version, codegen, tag, verify). Schema changes: edit schema → `codegen:types` → `verify:codegen-sync` → update callers (see `docs/playbooks/schema-to-types.md`).
8. **Playbooks for "how do I change X?"** — Each major subsystem (compiler, runtime, hub, LTI, schema-to-types, etc.) has a playbook under `docs/playbooks/` so changes stay consistent and onboarding is faster.
9. **Conventions for shared patterns** — Document when to use which pattern (e.g. `createSchemaStore` vs direct Ajv; service `{ error }` vs throw; hub middleware). See "Schema-backed JSON persistence" and "Centralized shared patterns" in this doc.
10. **Guardrails in CI** — Lint, typecheck, tests, and `verify:all` (dead files, DTS, api-contract, module headers, ES5, etc.) run in CI so main stays consistent and regressions are caught early. See `docs/VERIFICATION-GUARDS.md`.

## Deprecation policy

When deprecating an API, env var, or path:

1. **Log a warning** — Use `log.warn('deprecated: …')` (or equivalent) with a clear message: what is deprecated, replacement, and planned removal version (e.g. "will be removed in v0.3").
2. **Document the replacement** — Point callers to the new API or config (e.g. "Use `AGNI_PATHFINDER_PORT` instead").
3. **Document in a deprecation doc** — For large migrations (e.g. `src/` → `packages/`), add or update a doc (e.g. `docs/SRC-DEPRECATION.md`) with a summary table (old → new), what changed (CI, imports), and "if you see X, do Y."
4. **Remove in a later release** — Remove the deprecated path/API in a planned version and note it in the CHANGELOG.

See **`docs/SRC-DEPRECATION.md`** for the pattern used for the `src/` migration.

## Test file naming

- **Unit tests:** `tests/unit/*.test.js` (Mocha). **Integration:** `tests/integration/*.test.js`. **E2E:** `tests/e2e/*.spec.ts` (Playwright). **Verification** tests (regression/guard) live in `tests/unit/` with names like `*-verification.test.js` or `*-api.test.js` and are run via `verify:*`. See `docs/VERIFICATION-GUARDS.md` § Test file naming.

## Lint and type checks

- **ESLint + Prettier** apply to `packages/`, `hub-tools/`, `server/`, `tests/`. Run `npm run lint` and `npm run format:check` before committing.
- **TypeScript:** `npm run typecheck` runs `tsc --noEmit` for packages. Fix type errors so that refactors don't silently break callers.
- New code in `packages/agni-services/` or `packages/agni-engine/` should satisfy lint and, if it's TypeScript, typecheck. Adding `.ts` under `packages/` will include it in typecheck as configured.

## Package README checklist

Each package under `packages/` should have a README that includes:

- **What it is** — One or two sentences on the package’s role.
- **Who uses it** — Callers (e.g. hub, CLI, other packages).
- **Main entry points** — e.g. `index.js`, `pathfinder.js`, or the main exported API.
- **How to run its tests** — e.g. `npm run test` from repo root (or which test path exercises this package).

Existing guards: `verify:package-headers` and `verify:*-docs` (hub-docs, services-docs, governance-docs) enforce presence and some content; use this checklist when adding or updating a package README.

## Summary for LLMs

1. Prefer small, pure functions; no hidden globals in Node.
2. Export new public API from the module's `index.js`.
3. Add a header comment and JSDoc for public functions.
4. Service-layer functions return `{ error }` on failure; internal functions throw.
5. Use middleware wrappers (`adminOnly`, `requireLms`, `withRateLimit`) for route guards.
6. Use `createSchemaStore` for schema-validated JSON persistence.
7. Add shared browser utilities to `AGNI_SHARED` in `shared-runtime.js` (ES5 only).
8. Use `@agni/utils/io` (packages/agni-utils/io.js) for file freshness checks and HTML escaping.
9. Update `packages/types/index.d.ts` and `docs/api-contract.md` when changing data or HTTP contracts.
10. Use `docs/playbooks/*.md` to find where to change compiler, runtime, LMS, or governance.
11. Run `npm run lint`, `npm run format:check`, and `npm run typecheck` after edits.
