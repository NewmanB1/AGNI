# AGENTS.md — Guidance for AI Assistants

This document helps AI coding assistants (e.g. Cursor, Copilot) reason about the AGNI codebase.

---

## What AGNI Is

AGNI compiles human-readable YAML lessons (Open Lesson Standard) into single-file HTML bundles that run offline on resource-constrained devices. It includes a compiler, browser runtime, LMS engine (Rasch, Thompson bandit), and Village Hub server for on-demand lesson delivery.

---

## Monorepo Layout (Canonical Ownership)

**Canonical implementations live in `packages/`.** Shared types in `packages/types/` and `packages/agni-engine/*.d.ts`; sensor types in `packages/agni-runtime/sensors/sensorTypes.ts`.

| Package | Path | Role |
|---------|------|------|
| `@agni/cli` | `packages/agni-cli/` | CLI entry point: compile, validate, hub wizards |
| `@agni/utils` | `packages/agni-utils/` | Pure utilities: logging, config, crypto, I/O (leaf, no monorepo deps) |
| `@agni/runtime` | `packages/agni-runtime/` | Browser runtime: player, sensors, SVG factories (ES5, Chrome 51+) |
| `@ols/schema` | `packages/ols-schema/` | OLS JSON schema, validators, threshold grammar |
| `@agni/engine` | `packages/agni-engine/` | LMS engine: Rasch, Thompson, embeddings, PageRank, federation |
| `@ols/compiler` | `packages/ols-compiler/` | Lesson compiler: YAML → IR → HTML/native/YAML-packet |
| `@agni/governance` | `packages/agni-governance/` | Policy, compliance, catalog |
| `@agni/services` | `packages/agni-services/` | Top-down API: accounts, author, governance, LMS, lesson-chain |
| `@agni/hub` | `packages/agni-hub/` | Hub server: theta, accounts, telemetry |

**No src/ re-exports.** Tests and scripts use `@agni/*` and `@ols/*` directly. When inspecting or modifying behavior, work in the **package** (e.g. `packages/agni-engine/`, `packages/ols-compiler/`). `verify:canonical-imports` fails if tests/scripts require from `src/`.

---

## Where to Find Things

| Task | Location |
|------|----------|
| Lesson compilation (YAML → HTML) | `packages/ols-compiler/` |
| HTML builder | `packages/ols-compiler/builders/html.js` |
| CLI entry point | `packages/agni-cli/cli.js` |
| Browser player | `packages/agni-runtime/` (player.js, shared-runtime.js, sensor-bridge.js) |
| LMS engine (Rasch, bandit) | `packages/agni-engine/` |
| Hub server (on-demand PWA) | `packages/agni-hub/` (hub-transform.js, sw.js, pwa/) |
| Theta (lesson ordering) | `packages/agni-hub/theta.js` |
| Portal (teacher/admin UI) | `portal/` (vanilla HTML/CSS/JS, no build) |
| Schemas | `schemas/*.json`, `@ols/schema` |
| Shared types | `packages/types/index.d.ts` |
| API contract | `docs/api-contract.md` |
| Hub configuration (env, bootstrap) | `docs/CONFIGURATION.md` |
| Run environments | `docs/RUN-ENVIRONMENTS.md` (Edge=Android 7.0 Nougat/ES5, Hub=Pi) |

---

## Conventions (Summary)

1. **Canonical code in packages.** Edit `packages/*`, not `src/` re-exports.
2. **Public API via index.** Export new functions from the module's `index.js`.
3. **Service layer returns `{ error }` on failure**; internal functions may throw.
4. **Browser runtime is ES5** — Edge devices (Android 7.0 Nougat, Chrome 51) run `packages/agni-runtime/` and `packages/agni-hub/pwa/`, `sw.js`. Use `var`, `function`, `catch (e)`—no `let`/`const`, arrow functions, template literals, `class`, spread, optional catch. Guard: `npm run test:es5`. See `.cursor/rules/edge-device-es5.md`.
5. **Playbooks** in `docs/playbooks/` describe how to change compiler, runtime, LMS, governance.
6. **CI gates** in `scripts/`: `verify:all` runs core, runtime, hub, services, governance groups (see `docs/VERIFICATION-GUARDS.md`).

When writing scripts that inspect implementations (e.g. `check-dts-arity.js`, `check-factory-order.js`), inspect `packages/*` directly.

---

## Reference implementation

**Pure core vs edges:** Compiler, governance, theta, and LMS engine expose pure functions (input → output; no I/O). CLI, hub routes, and persistence are edges. See `docs/REFERENCE-IMPLEMENTATION-VISION.md` for boundaries and schema-driven design.

---

## Key Docs

- **Architecture:** `docs/ARCHITECTURE.md`
- **Configuration:** `docs/CONFIGURATION.md` (env vars, bootstrap order, hub-config)
- **Architectural remediation:** `docs/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md`, `docs/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md`
- **Concepts:** `docs/ONBOARDING-CONCEPTS.md`
- **Conventions:** `docs/CONVENTIONS.md`
- **Playbooks:** `docs/playbooks/` (compiler, runtime, lms, governance, etc.)
- **src/ deprecation:** `docs/SRC-DEPRECATION.md` (migration to packages/ complete)
- **Verification rules:** `.cursor/rules/sprint-verification.md`
- **Verification guards layout:** `docs/VERIFICATION-GUARDS.md`
