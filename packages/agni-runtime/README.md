# @agni/runtime

The AGNI browser runtime. This is what runs on the student's device — the lesson player, sensor bridge, SVG factory system, and all UI components.

**Important:** All files in this package must be **ES5-compatible** for Chrome 51 (Android 7.0 Nougat). No arrow functions, no let/const, no template literals. Run `npm run test:es5` to verify. See `docs/RUN-ENVIRONMENTS.md`.

## What's here

### Core
| File | Global | Purpose |
|------|--------|---------|
| `shared-runtime.js` | `AGNI_SHARED` | Pub/sub core: sensor subscriptions, step lifecycle, state management |
| `ui/player.js` | — | Lesson player: step rendering, navigation, gate evaluation |
| `engine/navigator.js` | — | Step sequencing, branching, adaptive reordering |

### Sensors
| File | Purpose |
|------|---------|
| `sensors/sensor-bridge.js` | Connects device hardware (accelerometer, gyroscope, orientation) + Phyphox bridge to `AGNI_SHARED.publishSensorReading()` |
| `sensors/threshold-evaluator.js` | Runtime threshold grammar evaluator: compiles `freefall > 0.35s` into stateful checker functions |

### SVG Factories
| File | Factories |
|------|-----------|
| `rendering/svg-stage.js` | Stage system: managed SVG container with RAF loop and sensor binding |
| `rendering/svg-factories.js` | Static: venn, barGraph, pieChart, numberLine, balanceScale, clockFace, flowMap, polygon, axis |
| `rendering/svg-factories-dynamic.js` | Dynamic: numberLineDynamic, clockFaceDynamic, timeGraph, arrowMap, gauge, compose |
| `rendering/svg-factories-geometry.js` | Geometry: polygonDynamic, cartesianGrid, unitCircle |
| `rendering/svg-registry.js` | Self-describing factory registry for the WYSIWYG editor |

### UI & Rendering
| File | Purpose |
|------|---------|
| `rendering/math-renderer.js` | KaTeX math rendering |
| `rendering/gate-renderer.js` | Gate/prerequisite check UI |
| `rendering/table-renderer.js` | Table formatting |
| `ui/a11y.js` | Accessibility: screen reader, high contrast, font sizing |
| `ui/i18n.js` | Internationalization |
| `ui/frustration.js` | Frustration detection from interaction patterns |
| `ui/export.js` | Certificate/progress export |
| `ui/factory-loader.js` | Dynamic factory script loading |

### Integrity & Telemetry
| File | Purpose |
|------|---------|
| `integrity/integrity.js` | Lesson content hash verification |
| `telemetry/telemetry.js` | Event capture and batching |
| `telemetry/checkpoint.js` | Progress checkpoint saving |
| `telemetry/completion.js` | Lesson completion recording |

## Architecture

All runtime files are **ES5 IIFEs** that communicate through globals:

```
┌─────────────────────┐
│   AGNI_SHARED       │  ← pub/sub core, sensor subscriptions
│   (shared-runtime)  │
├─────────────────────┤
│   AGNI_SVG          │  ← SVG factory system
│   (svg-*)           │
├─────────────────────┤
│   Player            │  ← step rendering, user interaction
│   (player.js)       │
└─────────────────────┘
```

No `require()` or `import` — the browser loads files via `<script>` tags in dependency order.

## Contributing

- **Adding an SVG factory:** Add the factory in the appropriate `rendering/svg-factories-*.js` file; register in `svg-registry.js`; add to `@agni/utils/runtimeManifest` (FACTORY_FILE_MAP, FACTORY_LOAD_ORDER if needed); add to `packages/agni-hub` ALLOWED_FACTORY_FILES; add to portal `svg-catalog` and validator. See `docs/playbooks/runtime.md`.
- **Adding a sensor:** Update `sensors/sensor-bridge.js`; register in `@agni/plugins/builtins/sensors.js`; extend threshold grammar in `@ols/schema` and `threshold-evaluator.js` if the sensor is a new threshold subject.
- **ES5 rule:** No exceptions. Run `npm run test:es5` before submitting.
