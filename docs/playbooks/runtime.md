# How to modify the Runtime

Use this when changing the browser-side lesson player, sensors, or SVG/visual system.

## Entry points

- **Loader:** Lesson HTML inlines `factory-loader.js`, which loads scripts from `LESSON_DATA.requires.factories` (order from `packages/agni-utils/feature-inference.js` and `runtimeManifest.js`).
- **Player:** `packages/agni-runtime/ui/player.js` — state machine, step navigation. Loaded after factories.
- **Backbone:** `packages/agni-runtime/shared-runtime.js` — `AGNI_SHARED` (pub/sub, device detection, visual lifecycle, module registry). Loaded first by the builder; not in the manifest.
- **Integrity:** `packages/agni-runtime/integrity/integrity.js` — `AGNI_INTEGRITY`. Runtime verification of OLS signatures and binding hashes.
- **Checkpoint:** `packages/agni-runtime/telemetry/checkpoint.js` — `AGNI_CHECKPOINT`. Persists and restores lesson progress (step index, gate state).
- **Frustration:** `packages/agni-runtime/ui/frustration.js` — `AGNI_FRUSTRATION`. Detects repeated failures / rage-taps and triggers adaptive hints or cooldowns.
- **Completion:** `packages/agni-runtime/telemetry/completion.js` — `AGNI_COMPLETION`. Tracks step and lesson completion; emits summary events for the LMS.
- **Gates:** `packages/agni-runtime/rendering/gate-renderer.js` — `AGNI_GATES`. Renders gate UI (quiz prompts, retry timers, pass/fail feedback).
- **Accessibility:** `packages/agni-runtime/ui/a11y.js` — `AGNI_A11Y`. Haptic intensity scaling, reduced-motion support, ARIA labelling utilities.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Add a new visual factory (e.g. new SVG type) | 1) Add implementation (e.g. `packages/agni-runtime/rendering/svg-factories-*.js` or register in existing factory file). 2) `packages/agni-utils/runtimeManifest.js`: add to `FACTORY_FILE_MAP` and, if needed, `FACTORY_LOAD_ORDER`. 3) `packages/agni-hub/hub-transform.js`: add new filename to `ALLOWED_FACTORY_FILES` if served from hub. |
| Change sensor behaviour or add a sensor | `packages/agni-runtime/sensors/sensor-bridge.js` — publishes into `AGNI_SHARED`. DeviceMotion/orientation are throttled to 100 ms to avoid event-loop exhaustion on Chrome 51. `threshold-evaluator.watch()` accepts `{ timeoutMs, onTimeout }` — if no sensor data within 5s (broken hardware), player shows emulator fallback ("Shake" button) so students are never blocked. See **`sensor-toolkit-improvement-plan.md`** for planned enhancements. |
| Change step navigation or gates | `packages/agni-runtime/ui/player.js` for navigation; `packages/agni-runtime/rendering/gate-renderer.js` (`AGNI_GATES`) for gate UI, retry timers, and pass/fail feedback. |
| Change integrity verification | `packages/agni-runtime/integrity/integrity.js` (`AGNI_INTEGRITY`) and `packages/agni-utils/crypto.js` (signContent). Verification is deferred (`setTimeout(0)`) to avoid blocking the main thread; player shows "Verifying…" spinner. Binding hash contract must stay identical on both sides. |
| Change checkpoint / resume behaviour | `packages/agni-runtime/telemetry/checkpoint.js` (`AGNI_CHECKPOINT`) — persist and restore step index, gate state, scroll position. |
| Change frustration detection or adaptive hints | `packages/agni-runtime/ui/frustration.js` (`AGNI_FRUSTRATION`) — repeated-failure heuristics, rage-tap detection, cooldown triggers. |
| Change completion tracking or LMS events | `packages/agni-runtime/telemetry/completion.js` (`AGNI_COMPLETION`) — step/lesson completion signals, summary event emission. |
| Change accessibility / haptics | `packages/agni-runtime/ui/a11y.js` (`AGNI_A11Y`) — haptic intensity, reduced-motion, ARIA labels. |
| Change global contract (e.g. new global) | Document in `packages/agni-runtime/README.md`. Update `player.js` and any code that reads/writes the global. |

## Do not

- Add a script that the loader must fetch without registering it in `packages/agni-utils/runtimeManifest.js` / `feature-inference.js` and the hub whitelist; otherwise it won’t be in the manifest or served.
- Break load order: `shared-runtime.js` → `sensor-bridge.js` → `svg-stage.js` → factories → `svg-registry.js` → `table-renderer.js`. See `packages/agni-runtime/README.md`.

## Types

- Runtime is JS only; types for IR/sidecar are in `src/types/index.d.ts`. For new globals or event payloads, add JSDoc or a small `.d.ts` in `packages/agni-runtime/` if needed.
