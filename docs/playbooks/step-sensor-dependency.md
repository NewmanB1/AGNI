# Step-level sensor dependency tracking

Use this when you need to know **which steps depend on which sensors** (for analytics, UI hints, or offline behaviour).

## Definition

- **Step-level sensor dependency:** For each lesson step, the set of sensors (if any) required for that step to function. This is derived from the OLS step schema and IR.

## Where it lives

| Step type            | Sensor dependency |
|----------------------|-------------------|
| `instruction`        | None. No sensor required. |
| `quiz`               | None. No sensor required. |
| `hardware_trigger`   | **`step.sensor`** (e.g. `accelerometer`) and **`step.threshold`** (e.g. expression or named threshold). The runtime uses `threshold-evaluator.js` and `sensor-bridge.js` to evaluate the condition. |

The lesson-level flag **`lesson.inferredFeatures.flags.has_sensors`** is true if any step is `hardware_trigger` (or otherwise uses sensors). The player uses this to decide whether to start the sensor bridge.

## How to read it in code

- **From compiled IR / LESSON_DATA:** For each `step` in `lesson.steps`:
  - If `step.type === 'hardware_trigger'`: the step depends on `step.sensor` and `step.threshold`. Use these for analytics (e.g. “step X requires accelerometer”) or to show a “sensor required” hint.
  - Otherwise: no sensor dependency for that step.

No separate “sensor dependency map” is stored; it is derived from the step type and optional `sensor` / `threshold` fields as defined in `schemas/ols.schema.json`.

## Phase 5

This playbook satisfies the “step-level sensor dependency tracking” item in Phase 5: the **tracking** is definitional and schema-driven (step type + `sensor`/`threshold`). The runtime already uses these fields for hardware_trigger steps; analytics or UI can use the same rule to list which steps require which sensors.

### Availability check (P2-19)

Before executing a `hardware_trigger` step, the runtime checks whether the **required sensor** is available via `getRequiredSensorIdForStep(step)` and `isSensorRequiredAvailable(sensorId)` on `AGNI_SHARED`. If the step needs light or mic and the device only has motion sensors, the fallback UI is shown immediately (tap-to-continue when `sensor_optional`, or emulator button when required).
