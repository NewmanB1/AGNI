# Codebase Index — Where to Find Things

Quick reference for humans and AI tools. Canonical implementations live in `packages/`; `src/` re-exports for backward compatibility.

---

## Lesson compilation

| What | Where |
|------|-------|
| Compiler (YAML → IR) | `packages/ols-compiler/`, `src/compiler/` (re-export) |
| HTML builder | `packages/ols-compiler/builders/html.js` |
| Native builder | `packages/ols-compiler/builders/native.js` or `src/builders/native.js` |
| YAML-packet builder | `packages/ols-compiler/builders/yaml-packet.js` |
| Markdown pipeline | `packages/ols-compiler/markdown-pipeline.js` |
| Lesson assembly | `packages/ols-compiler/services/lesson-assembly.js` |

---

## Runtime (browser)

| What | Where |
|------|-------|
| Player | `packages/agni-runtime/` (player.js, ui/player.js) |
| Shared runtime | `packages/agni-runtime/shared-runtime.js` |
| Sensor bridge | `packages/agni-runtime/sensor-bridge.js` |
| Polyfills | `packages/agni-runtime/polyfills.js` |
| SVG stage / factories | `packages/agni-runtime/svg-stage.js`, svg-factories*.js |
| Binary utils | `packages/agni-runtime/binary-utils.js` |

---

## LMS engine

| What | Where |
|------|-------|
| Rasch, Thompson, embeddings, PageRank | `packages/agni-engine/` |
| Federation | `packages/agni-engine/federation.js` |
| Migrations | `packages/agni-engine/migrations.js` |

---

## Hub and server

| What | Where |
|------|-------|
| Hub transform (on-demand PWA) | `server/hub-transform.js` |
| Theta (lesson ordering) | `hub-tools/theta.js` |
| @agni/hub package | `packages/agni-hub/` — facade that re-exports theta, hubTransform, etc. Canonical logic remains in `server/` and `hub-tools/`.
| Service worker | `server/sw.js` |
| PWA shell | `server/pwa/shell.html` |

---

## Schemas and types

| What | Where |
|------|-------|
| OLS schema | `schemas/ols.schema.json` |
| Archetypes, graph weights | `schemas/*.schema.json` |
| TypeScript definitions | `src/types/index.d.ts` |
| Engine .d.ts | `src/engine/*.d.ts` |

---

## Utilities

| What | Where |
|------|-------|
| Utils (logging, crypto, I/O, etc.) | `packages/agni-utils/`, `src/utils/` (re-export) |
| Feature inference | `src/utils/featureInference.js` |
| Runtime manifest | `src/utils/runtimeManifest.js` |

---

## Governance

| What | Where |
|------|-------|
| Policy, compliance, catalog | `packages/agni-governance/` |

---

## Entry points

| Entry | Path |
|-------|------|
| CLI | `src/cli.js` |
| Hub API | `hub-tools/theta.js` → `theta.startApi()` |
| Portal | `portal/` (SvelteKit) |
