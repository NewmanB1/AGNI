# Sensor Toolkit Improvement Plan

Implementation plan for sensor toolkit enhancements, with guards against regression and proof of completion. Aligns with hardware targets (Android 6.0+, Chrome 44 WebView, ES5) and `.cursor/rules/sprint-verification.md`.

**Reference:** Prior analysis in conversation; improvements derived from `docs/specs/threshold_grammar.md`, `packages/agni-runtime/sensors/sensor-bridge.js`, and `packages/agni-runtime/sensors/threshold-evaluator.js`.

---

## Summary

| Phase | Scope | Est. effort |
|-------|-------|-------------|
| **Phase 1** | `orientation` virtual sensor, Phyphox `sound` mapping, spec/docs updates | 1–2 days |
| **Phase 2** | Optional accel smoothing, `shake` virtual sensor, sensor-optional fallback | 2–3 days |
| **Phase 3** | Adaptive evaluation cadence, CI gates, integration smoke tests | 1–2 days |

---

## Phase 1: Low-Risk Enhancements

### STK-1.1: Add `orientation` virtual sensor

**Task:** Derive `flat` | `portrait` | `landscape` from `rotation.beta` and `rotation.gamma` in `_onOrientation` and publish as `orientation` sensor (string value or numeric enum).

**Deliverable:**
- In `sensor-bridge.js`, after publishing `rotation.*`, compute orientation and call `_pub('orientation', value, now)` where value is `'flat'` | `'portrait'` | `'landscape'` (or numeric: 0, 1, 2).
- Heuristics: `|beta|` and `|gamma|` near 0 → flat; one axis ~90, other small → portrait/landscape.

**Regression guard:**
- **Proof:** `tests/unit/sensor-bridge.test.js` (new file): with `setupGlobals()` and mock `AGNI_SHARED`, load sensor-bridge, simulate `deviceorientation` with known beta/gamma, assert `orientation` is published with correct value.
- **Break-it check:** Comment out `_pub('orientation', ...)` → test fails.
- **Wiring:** Player subscribes via `AGNI_SHARED.subscribeToSensor`; threshold-evaluator will accept `orientation` as sensorId. No load-order change.

**Proof of completion:**
- [ ] `npm test` includes `tests/unit/sensor-bridge.test.js` and it passes.
- [ ] Add `orientation` to `packages/agni-plugins/builtins/sensors.js` so validator accepts it.
- [ ] `npm run validate` passes on lessons that use `orientation` (if any added).

---

### STK-1.2: Add `orientation` to threshold grammar and evaluator

**Task:** Extend threshold-evaluator to support `orientation == flat`, `orientation == portrait`, `orientation == landscape`. For `==` and `!=` with string literals, compare sensor value to string.

**Deliverable:**
- In `threshold-evaluator.js`, handle sensorId `orientation` with string comparison when value is string.
- In `packages/ols-schema/threshold-syntax.js`, accept quoted strings for value (e.g. `orientation == "flat"`) or extend grammar for unquoted `flat`/`portrait`/`landscape`.
- Document in `docs/specs/threshold_grammar.md`.

**Regression guard:**
- **Proof:** `tests/unit/threshold-syntax.test.js`: add `it('parses orientation == flat')`, `it('validates orientation threshold')`.
- **Proof:** `tests/unit/sensor-toolkit-regression.test.js` (new): load threshold-evaluator under browser-globals, build evaluator for `orientation == flat`, feed `lastSensorValues` with `orientation: 'flat'` and `orientation: 'portrait'`, assert correct boolean.
- **Break-it check:** Remove orientation handling → tests fail.

**Proof of completion:**
- [ ] `npm run validate` passes.
- [ ] `npm test` passes.
- [ ] `docs/specs/threshold_grammar.md` documents `orientation` subject.

---

### STK-1.3: Phyphox `sound` / `sound.level` mapping

**Task:** Add `sound` and `sound.level` to `PHYPHOX_MAP` in sensor-bridge.js so Phyphox messages with `sensor: 'sound'` or `sensor: 'sound.level'` publish to `sound.level` (or `mic` if preferred).

**Deliverable:**
- Extend `PHYPHOX_MAP` with `'sound'` and `'sound.level'` handlers that call `_pub('sound.level', d.value || 0, ...)`.
- `packages/agni-plugins/builtins/sensors.js` already registers `sound.level`; ensure no duplicate.

**Regression guard:**
- **Proof:** `tests/unit/sensor-bridge.test.js`: simulate `postMessage` with `{ type: 'phyphox', sensor: 'sound', value: 75 }`, assert `lastSensorValues.get('sound.level') === 75`.
- **Break-it check:** Remove mapping → test fails.

**Proof of completion:**
- [ ] `npm test` passes.
- [ ] Phyphox bridge documentation (if any) updated.

---

### STK-1.4: Document light/mic as Phyphox-only

**Task:** Update `docs/specs/threshold_grammar.md` and any author-facing docs to state that `light` and `mic`/`sound.level` require Phyphox on most devices; native AmbientLightSensor and Web Audio have limited support on Chrome 44 / Android 6.

**Deliverable:**
- Add a "Sensor availability" subsection to the spec: which sensors are native vs Phyphox-only.
- No code change; documentation only.

**Proof of completion:**
- [ ] `docs/specs/threshold_grammar.md` contains the availability note.
- [ ] Manual review.

---

## Phase 2: Smoothing, Shake, Fallback

### STK-2.1: Optional low-pass smoothing for accel

**Task:** Add exponential moving average for `accel.total` (and optionally per-axis) when `!S.device.isLowEnd`. Make it configurable via `LESSON_DATA.sensorSmoothing` (default: true on non-low-end).

**Deliverable:**
- In `_onMotion`, before `_pub`, apply `smoothed = alpha * prev + (1 - alpha) * raw` with alpha ~0.8. Disable when `isLowEnd` or `LESSON_DATA.sensorSmoothing === false`.
- Store `_accelPrev` in closure. ES5-only.

**Regression guard:**
- **Proof:** `tests/unit/sensor-bridge.test.js`: with smoothing on, feed two motion events with different values, assert second published value is between first and second raw (smoothed).
- **Break-it check:** Disable smoothing in test → assertion would need adjustment; or test that smoothing reduces spike magnitude.
- **Wiring:** No new entry points; existing motion handler path.

**Proof of completion:**
- [ ] `npm run test:es5` passes (no ES6 introduced).
- [ ] `npm test` passes.
- [ ] No regression: gravity.html freefall step still triggers on device/simulation.

---

### STK-2.2: Add `shake` virtual sensor

**Task:** Implement lightweight shake detection: small ring buffer (5 samples) of `accel.total`, emit `shake` (1 or 0) when `max - min` over window exceeds threshold (e.g. 2.5g).

**Deliverable:**
- In `_onMotion`, maintain `_accelRing` (array of 5 numbers), push current `gmag` (from accel.total). Compute `max - min`. If >= 2.5 * 9.81 (m/s²), `_pub('shake', 1, now)`; else `_pub('shake', 0, now)`.
- Add `shake` to `packages/agni-plugins/builtins/sensors.js`.
- Extend threshold-evaluator: `shake > 0` or `shake >= 1` treated as "shake detected".

**Regression guard:**
- **Proof:** `tests/unit/sensor-bridge.test.js`: simulate 5 motion events with high variance (e.g. [1, 15, 2, 14, 3]), assert `shake` is 1 at some point; with low variance ([9.8, 9.9, 9.7, 9.8, 9.9]), assert `shake` stays 0.
- **Break-it check:** Remove shake logic → test fails.

**Proof of completion:**
- [ ] `npm test` passes.
- [ ] `npm run validate` passes.
- [ ] `docs/specs/threshold_grammar.md` documents `shake` virtual sensor.

---

### STK-2.3: Sensor-optional fallback for hardware_trigger

**Task:** When required sensor is unavailable (e.g. `!S.device.hasMotionEvents` for accelerometer steps), show "Sensors unavailable" message and a "Tap to continue" button if the lesson declares `sensor_optional: true` in meta or step.

**Deliverable:**
- In `player.js`, before starting sensor bridge for a hardware_trigger step, check sensor availability. If unavailable and step has `sensor_optional: true` (or `lesson.meta.sensor_optional`), render fallback UI instead of waiting forever.
- Schema: add optional `sensor_optional` to `hardware_trigger` step and/or `meta`.
- `featureInference.js`: pass through `sensor_optional` to IR.

**Regression guard:**
- **Proof:** `tests/unit/player-sensor-fallback.test.js` or extend `gate-renderer.test.js`: mock `hasMotionEvents: false`, load lesson with `sensor_optional: true` step, assert fallback UI is rendered (or routeStep receives a bypass signal).
- **Break-it check:** Remove fallback path → test fails when sensors unavailable.

**Proof of completion:**
- [ ] `npm test` passes.
- [ ] OLS schema and validator accept `sensor_optional`.
- [ ] Manual test: load gravity.html with DeviceMotion disabled (e.g. desktop), add `sensor_optional: true` to freefall step, confirm tap-to-continue appears.

---

## Phase 3: Performance and Verification Gates

### STK-3.1: Adaptive evaluation cadence for low-end

**Task:** On `S.device.isLowEnd`, throttle threshold evaluation to every 2nd or 3rd sensor tick to reduce main-thread work.

**Deliverable:**
- In `player.js` or the sensor subscription path, maintain a counter; only call the threshold evaluator when `counter % 2 === 0` (or 3) when `isLowEnd`.
- Alternatively: in shared-runtime `publishSensorReading`, skip notifying subscribers for some ticks when `isLowEnd`. Prefer evaluation-side throttle to avoid breaking other subscribers (e.g. SVG stage).

**Regression guard:**
- **Proof:** `tests/unit/sensor-toolkit-regression.test.js`: with mocked `isLowEnd: true`, verify evaluator is called less frequently than publish rate (mock and count invocations).
- **Break-it check:** Remove throttle → invocation count increases.

**Proof of completion:**
- [ ] `npm test` passes.
- [ ] No regression on non-low-end: gravity.html still works.
- [ ] `npm run test:es5` passes.

---

### STK-3.2: CI gate for known sensor IDs

**Task:** Add `scripts/check-known-sensors.js` that ensures every sensor ID used in `sensor-bridge.js` (published IDs) and `threshold-evaluator.js` (supported in grammar) exists in `packages/agni-plugins` `getKnownSensorIds()`.

**Deliverable:**
- Script parses or imports sensor IDs from bridge and evaluator, compares to `plugins.getKnownSensorIds()`.
- Fails if bridge publishes `foo` but plugins don't register it, or if evaluator accepts `bar` but plugins don't register it.
- Add to `package.json`: `"verify:sensors": "node scripts/check-known-sensors.js"`.
- Wire into `verify:all` or `validate.yml`.

**Regression guard:**
- **Proof:** Adding a new sensor without registering in plugins → `npm run verify:sensors` fails.
- **Wiring:** CI runs `verify:sensors` on every push.

**Proof of completion:**
- [ ] `npm run verify:sensors` passes with current codebase.
- [ ] `.github/workflows/validate.yml` (or equivalent) includes `verify:sensors` in the validation job.

---

### STK-3.3: Integration smoke test for sensor-enabled lesson

**Task:** Add a wiring smoke test that loads a lesson with `has_sensors: true`, fetches the compiled HTML, and asserts that `sensor-bridge.js` is in the required script list and the lesson runs without script errors (or at least that the factory manifest includes sensor-bridge).

**Deliverable:**
- In `tests/integration/wiring-smoke.test.js` or new `tests/integration/sensor-wiring.test.js`: compile gravity.yaml (or a minimal sensor lesson), fetch `/lessons/gravity` or equivalent, parse HTML for script tags, assert `sensor-bridge.js` is present when `has_sensors` is true.
- Per sprint-verification: integration smoke tests must make real HTTP requests.

**Regression guard:**
- **Proof:** Removing sensor-bridge from the manifest for sensor lessons → smoke test fails.
- **Wiring:** Same pattern as existing `GET /lessons/:slug` smoke test.

**Proof of completion:**
- [ ] `npm run test:integration` passes.
- [ ] Smoke test document references `sensor-bridge.js` inclusion for sensor lessons.

---

## Execution Order and Dependencies

```
Phase 1:
  STK-1.1 (orientation publish)  →  STK-1.2 (threshold support)
  STK-1.3 (Phyphox sound)        ← independent
  STK-1.4 (docs)                 ← independent, can run in parallel

Phase 2:
  STK-2.1 (smoothing)            ← independent
  STK-2.2 (shake)                ← independent
  STK-2.3 (sensor-optional)      ← independent

Phase 3:
  STK-3.1 (adaptive cadence)     ← after Phase 2 (touches player)
  STK-3.2 (CI gate)              ← after Phase 1+2 (new sensors)
  STK-3.3 (integration smoke)    ← can run anytime
```

---

## Test File Summary

| New/Modified test file | Purpose |
|------------------------|---------|
| `tests/unit/sensor-bridge.test.js` | STK-1.1, 1.3, 2.1, 2.2 — bridge behavior under browser-globals |
| `tests/unit/sensor-toolkit-regression.test.js` | STK-1.2, 3.1 — threshold evaluator, adaptive cadence |
| `tests/unit/threshold-syntax.test.js` | STK-1.2 — extend with orientation, shake |
| `tests/unit/player-sensor-fallback.test.js` or gate-renderer | STK-2.3 |
| `tests/integration/sensor-wiring.test.js` | STK-3.3 |

---

## Hardware Constraints Checklist

- [ ] No `let`/`const`, arrow functions, template literals, or `class` in runtime changes.
- [ ] `npm run test:es5` passes after all edits.
- [ ] Shake ring buffer size ≤ 8; smoothing uses simple scalar math.
- [ ] No new native APIs (AmbientLightSensor, Web Audio) in Phase 1–3.

---

## Implementation Status (2026-03)

| Item | Status | Proof |
|------|--------|-------|
| STK-1.1 orientation | Done | sensor-bridge.js publishes orientation; plugins register it |
| STK-1.2 orientation threshold | Done | threshold-syntax.test.js, sensor-toolkit-regression.test.js |
| STK-1.3 Phyphox sound | Done | PHYPHOX_MAP in sensor-bridge.js |
| STK-1.4 docs | Done | threshold_grammar.md §3.3 |
| STK-2.1 smoothing | Done | sensor-bridge.js _smooth, LESSON_DATA.sensorSmoothing |
| STK-2.2 shake | Done | sensor-bridge.js _accelRing, plugins register shake |
| STK-2.3 sensor-optional | Done | player.js fallback when !sensorsAvailable && sensorOptional |
| STK-3.1 adaptive cadence | Done | threshold-evaluator.js watch() skips odd ticks when isLowEnd |
| STK-3.2 verify:sensors | Done | scripts/check-known-sensors.js, npm run verify:sensors |
| STK-3.3 integration smoke | Done | wiring-smoke.test.js sensor-smoke-test |

---

## Definition of Done (per item)

Before marking any STK item complete:

1. **Code:** Implementation merged; no lint errors.
2. **Tests:** Named regression test exists, passes, and fails when fix is reverted (break-it check).
3. **Wiring:** If new code path, document "Who calls it? How is it loaded? What fails if removed?"
4. **CI:** If new gate, add to `verify:all` or `validate.yml`.
5. **Docs:** `threshold_grammar.md` and playbook updated for new sensors/behavior.
