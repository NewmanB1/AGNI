# AGNI coding conventions (LLM-friendly)

These rules keep the codebase navigable and safe to change with tooling and LLM assistance.

## Module layout

- **One clear role per module.** If a file grows beyond a single responsibility, split it (e.g. player → player/state, player/navigation).
- **Public API via index.** Each logical module (`src/compiler`, `src/engine`, `src/governance`, `src/services`) exposes a small surface via an `index.js` (or `index.ts`). New public functions should be exported from that index so they’re discoverable; hide helpers inside the module.
- **Top-down entry points.** Callers (CLI, hub, portal) use the **services layer** (`src/services/*`) or documented HTTP API; they do not require compiler/engine/governance internals directly.

## Functions and state

- **Prefer small, pure functions** with explicit parameters. Avoid hidden globals except the deliberate runtime globals (`AGNI_SHARED`, `LESSON_DATA`, etc.) in the browser.
- **No hidden globals in Node.** Configuration via function arguments, env vars, or injected options. Singleton state (e.g. LMS in-memory state) lives in the module that owns it and is accessed via the public API.

## Documentation

- **Header comment on every module.** At the top of each file, add a short block: what the file does, who uses it, and any cross-cutting contract (e.g. “Binding hash must match crypto.js and player.js”).
- **JSDoc for public functions.** Parameters, return type, and one-line description. Use `@param` and `@returns`; for types from `src/types`, use `import('../types').TypeName` in JSDoc.

## Types and contracts

- **Shared types in `src/types/index.d.ts`.** IR, sidecar, LMS state, governance, and API payloads. When you add a new field to the IR or sidecar, update the type and the compiler/governance code together.
- **API contract in `docs/api-contract.md`.** Any new or changed hub HTTP endpoint must be documented there and reflected in `portal/src/lib/api.ts` if the portal uses it.

## Playbooks

- **“How to modify X” playbooks** live in `docs/playbooks/`: `compiler.md`, `runtime.md`, `lms.md`, `governance.md`. Use them to find the right files and avoid breaking contracts when changing behaviour.

## Lint and type checks

- **ESLint + Prettier** apply to `src/**/*.js` (and optionally `server/`, `hub-tools/`). Run `npm run lint` and `npm run format:check` before committing.
- **TypeScript:** `npm run typecheck` runs `tsc --noEmit` for `src/**/*.ts` (engine and any future TS modules). Fix type errors so that refactors don’t silently break callers.
- New code in `src/services/` or `src/engine/` should satisfy lint and, if it’s TypeScript, typecheck. Adding `.ts` under `src/` will include it in typecheck automatically.

## Summary for LLMs

1. Prefer small, pure functions; no hidden globals in Node.
2. Export new public API from the module’s `index.js` / `index.ts`.
3. Add a header comment and JSDoc for public functions.
4. Update `src/types/index.d.ts` and `docs/api-contract.md` when changing data or HTTP contracts.
5. Use `docs/playbooks/*.md` to find where to change compiler, runtime, LMS, or governance.
6. Run `npm run lint`, `npm run format:check`, and `npm run typecheck` after edits.
