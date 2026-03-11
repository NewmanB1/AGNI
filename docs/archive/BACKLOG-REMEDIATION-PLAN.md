# Backlog Remediation Plan

Plan to address all remaining technical backlog items with **regression guards** and **proof of completion** per `.cursor/rules/sprint-verification.md`.

**Scope:** Sentry hardening, Sensor toolkit, Accessibility refinements, Deferred/Manual items.

**Excluded:** Lesson Creator (separate project), Launch/Announce (release tag, publish Manifesto, v1.0 spec, community onboarding), Curriculum generation (handled elsewhere).

---

## Verification Rule (Mandatory)

Before marking any item `[x]`:
1. **Regression guard** — Test or CI gate fails without the fix, passes with it.
2. **Proof** — Add `Proof:` line in this doc linking to test or gate.
3. **Wiring** — If new file/middleware/loader: document who calls it, how it loads, and what breaks if removed.

---

## Phase A: Sentry Hardening

**Reference:** `docs/SPRINT-SENTRY-IMPROVEMENTS.md` (detailed spec).

**Execution order:** A1 → (A2, A3, A4 in parallel) → A5 → A6 → A7 → A8 → (A9, A10 in parallel).

| # | Task | Regression Guard | Proof of Completion |
|---|------|------------------|---------------------|
| **A1** | S1.1 Sentry unit tests | `tests/unit/sentry.test.js` in CI | Proof: `node --test tests/unit/sentry.test.js` (24 cases) |
| **A2** | S1.2 Event validation (string/object skillsProvided) | S1.1 tests | Proof: sentry.test.js validates both shapes |
| **A3** | S1.3 Configurable thresholds (envConfig) | S1.1 tests | Proof: envConfig in sentry.js; env override in tests |
| **A4** | S1.4 Output validation against graph_weights schema | S1.1 output test | Proof: getGraphWeightsValidator() in sentry-analysis.js |
| **A5** | S2.1 Forward hub telemetry to Sentry | Theta unchanged when disabled | Proof: packages/agni-hub/routes/telemetry.js forwardToSentry() |
| **A6** | S2.2 Document telemetry data flow | — | Proof: docs/playbooks/sentry.md |
| **A7** | S3.1 Flush retry on failure | S1.1 retry test | Proof: sentry.js flush retry (3 attempts, 1s delay) |
| **A8** | S3.2 Graceful shutdown | Manual | Proof: SIGTERM/SIGINT handlers in sentry.js |
| **A9** | S3.3 Health endpoint | — | Proof: GET /health, GET /api/sentry/status |
| **A10** | S4.1 Honor analyseCron | — | Proof: checkCronAndRunAnalysis(), setInterval in sentry.js |

**Final verification:** `npm test`, `npm run verify:all`, R16 C2.1/C2.2/C3.2 regressions pass.

---

## Phase B: Sensor Toolkit

**Reference:** `sensor-toolkit-improvement-plan.md` (detailed spec; archived).

**Execution order:** B1 → B2; B3, B4 (parallel); B5, B6, B7 (parallel); B8 → B9.

| # | Task | Regression Guard | Proof of Completion |
|---|------|------------------|---------------------|
| **B1** | STK-1.1 Add `orientation` virtual sensor | runtimeManifest, wiring-smoke | Proof: orientation in sensor-bridge, plugins |
| **B2** | STK-1.2 `orientation` in threshold grammar | threshold-syntax.test.js | Proof: threshold_grammar.md, evaluator |
| **B3** | STK-1.3 Phyphox `sound` mapping | — | Proof: PHYPHOX_MAP sound/sound.level |
| **B4** | STK-1.4 Doc light/mic as Phyphox-only | — | Proof: threshold_grammar.md § Sensor availability |
| **B5** | STK-2.1 Optional accel smoothing | test:es5 | Proof: sensor-bridge _smooth, LESSON_DATA.sensorSmoothing |
| **B6** | STK-2.2 `shake` virtual sensor | — | Proof: shake in bridge and plugins |
| **B7** | STK-2.3 Sensor-optional fallback | player.js | Proof: sensor_optional in schema; player sensorOptional |
| **B8** | STK-3.1 Adaptive evaluation cadence | — | Proof: threshold-evaluator.js isLowEnd throttling |
| **B9** | STK-3.2 / STK-3.3 CI gate + integration smoke | verify:sensors, wiring-smoke | Proof: check-known-sensors.js; GET /lessons/sensor-smoke-test |

**Final verification:** `npm test`, `npm run validate`, `npm run test:es5`, `npm run verify:sensors`, integration tests pass.

---

## Phase C: Accessibility Refinements

**Reference:** `docs/accessibility/INTENSITY-SETTINGS.md`.

| # | Task | Regression Guard | Proof of Completion |
|---|------|------------------|---------------------|
| **C1** | Schema: add feedback pattern enum | `npm run validate` | `ols.schema.json` accepts enum; existing lessons validate |
| **C2** | UI: sensory-friendly preset (0.25) | `tests/unit/a11y.test.js` | Preset applies; persisted in localStorage |

**Proof of completion:**
- [x] C1: Schema enum `feedback_pattern` added; existing lessons validate; Proof: `npm run validate`
- [x] C2: Gear panel has Sensory friendly preset (0.25); test asserts behaviour; Proof: tests/unit/a11y.test.js

---

## Phase E: Deferred / Manual

Items deferred or requiring manual validation. No automated guards; document when completed.

| # | Task | Type | Notes |
|---|------|------|-------|
| **E1** | Base45/QR encoding for sneakernet | Deferred | Phase 2 optional; separate epic |
| **E2** | Log aggregator / telemetry ingestion | Optional | Phase 3 optional |
| **E3** | Android 6.0 device test (Airplane Mode) | Manual | Run gravity.html offline; document results |
| **E4** | SVG 2.3 Registry sync | Deferred | Portal catalog separate |
| **E5** | SVG 4.2 Export & Responsive | Optional | If implemented: regression test for export |

---

## Checklist Summary

### Phase A (Sentry)
- [x] A1 S1.1 Sentry unit tests
- [x] A2 S1.2 Event validation consistency
- [x] A3 S1.3 Configurable thresholds
- [x] A4 S1.4 Output schema validation
- [x] A5 S2.1 Forward telemetry to Sentry
- [x] A6 S2.2 Document data flow
- [x] A7 S3.1 Flush retry
- [x] A8 S3.2 Graceful shutdown
- [x] A9 S3.3 Health endpoint
- [x] A10 S4.1 analyseCron

### Phase B (Sensor Toolkit)
- [x] B1 STK-1.1 orientation sensor
- [x] B2 STK-1.2 orientation in grammar
- [x] B3 STK-1.3 Phyphox sound mapping
- [x] B4 STK-1.4 Doc light/mic Phyphox-only
- [x] B5 STK-2.1 Accel smoothing
- [x] B6 STK-2.2 shake sensor
- [x] B7 STK-2.3 Sensor-optional fallback
- [x] B8 STK-3.1 Adaptive cadence
- [x] B9 STK-3.2 / STK-3.3 CI + smoke

### Phase C (Accessibility)
- [x] C1 Feedback pattern enum
- [x] C2 Sensory-friendly preset

### Phase E (Deferred)
- [ ] E1–E5 Document when addressed

---

## Dependency Graph

```
A1 ──┬──► A2, A3, A4
     ├──► A5 ──► A6
     └──► A7 ──► A8

B1 ──► B2
B3, B4
B5, B6, B7
B8 ──► B9

C1, C2 (independent)
```

---

## References

- **Sprint verification:** `.cursor/rules/sprint-verification.md`
- **Sentry detail:** `docs/SPRINT-SENTRY-IMPROVEMENTS.md`
- **Sensor detail:** `sensor-toolkit-improvement-plan.md`
- **Accessibility:** `docs/accessibility/INTENSITY-SETTINGS.md`, `HAPTIC-TESTING-TEMPLATE.md`
