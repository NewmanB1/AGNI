# How to modify the Runtime

Use this when changing the browser-side lesson player, sensors, or SVG/visual system.

## Entry points

- **Loader:** Lesson HTML inlines `factory-loader.js`, which loads scripts from `LESSON_DATA.requires.factories` (order from `src/utils/featureInference.js`).
- **Player:** `src/runtime/player.js` — state machine, integrity check, step navigation. Loaded after factories.
- **Backbone:** `src/runtime/shared-runtime.js` — `AGNI_SHARED` (pub/sub, device detection, visual lifecycle, module registry). Loaded first by the builder; not in the manifest.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Add a new visual factory (e.g. new SVG type) | 1) Add implementation (e.g. `src/runtime/svg-factories-*.js` or register in existing factory file). 2) `src/utils/featureInference.js`: add to `FACTORY_FILE_MAP` and, if needed, `FACTORY_LOAD_ORDER` / `_buildFactoryManifest`. 3) `server/hub-transform.js`: add new filename to `ALLOWED_FACTORY_FILES` if served from hub. |
| Change sensor behaviour or add a sensor | `src/runtime/sensor-bridge.js` — publishes into `AGNI_SHARED`. Ensure any new runtime module that needs sensors subscribes via `AGNI_SHARED` and loads after `sensor-bridge.js`. |
| Change step navigation or gates | `src/runtime/player.js` (and possibly `threshold-evaluator.js`, `navigator.js`). |
| Change integrity verification | `src/runtime/player.js` (verifyIntegrity) and `src/utils/crypto.js` (signContent). Binding hash contract must stay identical on both sides. |
| Change global contract (e.g. new global) | Document in `src/runtime/README.md`. Update `player.js` and any code that reads/writes the global. |

## Do not

- Add a script that the loader must fetch without registering it in `featureInference.js` and the hub whitelist; otherwise it won’t be in the manifest or served.
- Break load order: `shared-runtime.js` → `sensor-bridge.js` → `svg-stage.js` → factories → `svg-registry.js` → `table-renderer.js`. See `src/runtime/README.md`.

## Types

- Runtime is JS only; types for IR/sidecar are in `src/types/index.d.ts`. For new globals or event payloads, add JSDoc or a small `.d.ts` in `src/runtime/` if needed.
