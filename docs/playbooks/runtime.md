# How to modify the Runtime

Use this when changing the browser-side lesson player, sensors, or SVG/visual system.

## Entry points

- **Loader:** Lesson HTML inlines `factory-loader.js`, which loads scripts from `LESSON_DATA.requires.factories` (order from `src/utils/featureInference.js`).
- **Player:** `src/runtime/player.js` — state machine, step navigation. Loaded after factories.
- **Backbone:** `src/runtime/shared-runtime.js` — `AGNI_SHARED` (pub/sub, device detection, visual lifecycle, module registry). Loaded first by the builder; not in the manifest.
- **Integrity:** `src/runtime/integrity.js` — `AGNI_INTEGRITY`. Runtime verification of OLS signatures and binding hashes.
- **Checkpoint:** `src/runtime/checkpoint.js` — `AGNI_CHECKPOINT`. Persists and restores lesson progress (step index, gate state).
- **Frustration:** `src/runtime/frustration.js` — `AGNI_FRUSTRATION`. Detects repeated failures / rage-taps and triggers adaptive hints or cooldowns.
- **Completion:** `src/runtime/completion.js` — `AGNI_COMPLETION`. Tracks step and lesson completion; emits summary events for the LMS.
- **Gates:** `src/runtime/gate-renderer.js` — `AGNI_GATES`. Renders gate UI (quiz prompts, retry timers, pass/fail feedback).
- **Accessibility:** `src/runtime/a11y.js` — `AGNI_A11Y`. Haptic intensity scaling, reduced-motion support, ARIA labelling utilities.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Add a new visual factory (e.g. new SVG type) | 1) Add implementation (e.g. `src/runtime/svg-factories-*.js` or register in existing factory file). 2) `src/utils/featureInference.js`: add to `FACTORY_FILE_MAP` and, if needed, `FACTORY_LOAD_ORDER` / `_buildFactoryManifest`. 3) `server/hub-transform.js`: add new filename to `ALLOWED_FACTORY_FILES` if served from hub. |
| Change sensor behaviour or add a sensor | `src/runtime/sensor-bridge.js` — publishes into `AGNI_SHARED`. Ensure any new runtime module that needs sensors subscribes via `AGNI_SHARED` and loads after `sensor-bridge.js`. See **`sensor-toolkit-improvement-plan.md`** for planned enhancements and verification requirements. |
| Change step navigation or gates | `src/runtime/player.js` for navigation; `src/runtime/gate-renderer.js` (`AGNI_GATES`) for gate UI, retry timers, and pass/fail feedback. |
| Change integrity verification | `src/runtime/integrity.js` (`AGNI_INTEGRITY`) and `src/utils/crypto.js` (signContent). Binding hash contract must stay identical on both sides. |
| Change checkpoint / resume behaviour | `src/runtime/checkpoint.js` (`AGNI_CHECKPOINT`) — persist and restore step index, gate state, scroll position. |
| Change frustration detection or adaptive hints | `src/runtime/frustration.js` (`AGNI_FRUSTRATION`) — repeated-failure heuristics, rage-tap detection, cooldown triggers. |
| Change completion tracking or LMS events | `src/runtime/completion.js` (`AGNI_COMPLETION`) — step/lesson completion signals, summary event emission. |
| Change accessibility / haptics | `src/runtime/a11y.js` (`AGNI_A11Y`) — haptic intensity, reduced-motion, ARIA labels. |
| Change global contract (e.g. new global) | Document in `src/runtime/README.md`. Update `player.js` and any code that reads/writes the global. |

## Do not

- Add a script that the loader must fetch without registering it in `featureInference.js` and the hub whitelist; otherwise it won’t be in the manifest or served.
- Break load order: `shared-runtime.js` → `sensor-bridge.js` → `svg-stage.js` → factories → `svg-registry.js` → `table-renderer.js`. See `src/runtime/README.md`.

## Types

- Runtime is JS only; types for IR/sidecar are in `src/types/index.d.ts`. For new globals or event payloads, add JSDoc or a small `.d.ts` in `src/runtime/` if needed.
