# Runtime (browser)

This directory contains the **browser runtime** for compiled OLS lessons. It is loaded by `factory-loader.js` and `player.js` based on the factory manifest produced at build time. Modules are not imported via Node `require` here; they are script tags or dynamic fetches in the browser.

## Public entry points (load order)

Load order is defined in `src/utils/featureInference.js` (`FACTORY_LOAD_ORDER`, `FACTORY_FILE_MAP`). High-level order:

1. **shared-runtime.js** — `AGNI_SHARED`: pub/sub, device detection, visual lifecycle, module registry. Prepended by the HTML builder; not in the manifest.
2. **sensor-bridge.js** — Device motion/orientation and Phyphox; publishes into `AGNI_SHARED`.
3. **svg-stage.js** — Spec-driven SVG stage and RAF loop.
4. **svg-factories.js**, **svg-factories-dynamic.js**, **svg-factories-geometry.js** — Factory implementations.
5. **svg-registry.js** — `AGNI_SVG.fromSpec()` dispatch.
6. **table-renderer.js** — Table rendering (when lesson has tables + visuals).
7. **factory-loader.js** — Inlined in lesson HTML; loads the above by manifest.
8. **player.js** — Inlined in lesson HTML; state machine, integrity check, step navigation.

## Other files

- **style.css** — Lesson UI styles.
- **navigator.js**, **threshold-evaluator.js**, **telemetry.js**, **math-renderer.js**, **export.js** — Supporting behaviour; see references from player or shared-runtime.
- **shell/** — Optional shell/layout assets.
- **sw.js** — Service worker (served from `server/` in production).

## Contracts

- Runtime modules register via `AGNI_SHARED.registerModule()`.
- Globals: `window.LESSON_DATA`, `window.OLS_SIGNATURE`, `window.OLS_PUBLIC_KEY`, `window.OLS_INTENDED_OWNER`, `window.AGNI_SHARED`, `window.AGNI_LOADER`, `window.OLS_NEXT`, `window.OLS_ROUTE`.
