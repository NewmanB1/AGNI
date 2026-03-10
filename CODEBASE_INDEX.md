# Codebase Index — Where to Find Things

Quick reference for humans and AI tools. Canonical implementations live in `packages/`. See `docs/SRC-DEPRECATION.md` for the completed migration from `src/`.

---

## Lesson compilation

| What | Where |
|------|-------|
| Compiler (YAML → IR) | `packages/ols-compiler/` |
| HTML builder | `packages/ols-compiler/builders/html.js` |
| Native builder | `packages/ols-compiler/builders/native.js` |
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
| Hub transform (on-demand PWA) | `packages/agni-hub/hub-transform.js` |
| Theta (lesson ordering) | `packages/agni-hub/theta.js` |
| @agni/hub package | `packages/agni-hub/` — canonical hub: theta, sentry, routes, hub-transform, PWA. Run via `node hub-tools/theta.js` (wrapper). |
| Service worker | `packages/agni-hub/sw.js` |
| PWA shell | `packages/agni-hub/pwa/shell.html` |

---

## Schemas and types

| What | Where |
|------|-------|
| OLS schema | `schemas/ols.schema.json` |
| Archetypes, graph weights | `schemas/*.schema.json` |
| TypeScript definitions | `packages/types/index.d.ts` |
| Engine .d.ts | `packages/agni-engine/*.d.ts` |

---

## Utilities

| What | Where |
|------|-------|
| Utils (logging, crypto, I/O, etc.) | `packages/agni-utils/` |
| Feature inference | `packages/agni-utils/feature-inference.js` |
| Runtime manifest | `packages/agni-utils/runtimeManifest.js` |

---

## Governance

| What | Where |
|------|-------|
| Policy, compliance, catalog | `packages/agni-governance/` |

---

## Entry points

| Entry | Path |
|-------|------|
| CLI | `packages/agni-cli/cli.js` |
| Hub API | `packages/agni-hub/theta.js` or `node hub-tools/theta.js` → `theta.startApi()` |
| Portal | `portal/` (vanilla HTML/CSS/JS) |
