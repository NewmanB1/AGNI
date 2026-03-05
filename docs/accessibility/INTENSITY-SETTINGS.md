# Intensity Settings (Schema & UI)

This document describes the current **Intensity**-related schema and UI settings in AGNI. It supports **ROADMAP Phase 3 (B3.2)** and should be updated after haptic testing with neurodivergent volunteers (B3.1).

---

## 1. Haptic Intensity (User Setting)

| Setting | Range | Storage | Default | Location |
|---------|-------|---------|---------|----------|
| `agni_haptic_intensity` | 0–1 (float) | localStorage | 0 if `prefers-reduced-motion: reduce`, else 1 | `packages/agni-runtime/ui/a11y.js` |

- **0** = haptics off (no vibration)
- **1** = full intensity; vibration duration scaled by this value (e.g. 200ms × 1 = 200ms)
- UI: Gear icon → "Haptic feedback" slider. Persists across sessions.

---

## 2. Threshold Grammar (Lesson Authoring)

Sensor thresholds use intensity-style checks for **physical values** (g, deg, db, lux). See [Threshold Grammar](../specs/threshold_grammar.md) §4.1.

| Subject | Unit | Example | Semantics |
|---------|------|---------|-----------|
| `accel.total` | g | `accel.total > 2.5g` | Instant pass when value crosses threshold |
| `mic` | db | `mic > 80db` | Instant pass |
| `light` | lux | `light < 10lux` | Instant pass |
| Duration | s, ms | `freefall > 0.2s` | Maintain state for duration |

These are **author-defined** in YAML. No user-facing intensity scaling for sensor thresholds.

---

## 3. Feedback Patterns (Lesson Authoring)

Lesson steps can specify feedback strings:

| Pattern | Effect | Notes |
|---------|--------|-------|
| `vibration:short` | ~200ms single pulse | Scaled by `hapticIntensity` |
| `vibration:success_pattern` | Success rhythm | Pattern defined in player |
| (future) | Custom patterns | Schema could support `pattern: [100,50,100]` |

Currently no schema enum for feedback patterns; they are parsed from the string in the runtime.

---

## 4. Refinement Notes (Post–B3.1)

*To be filled after haptic testing with neurodivergent volunteers.*

- [x] Default `hapticIntensity` to 0 when `prefers-reduced-motion: reduce` (implemented in a11y.js, shared-runtime.js, portal)
- [x] Schema: add explicit feedback pattern enum in `ols.schema.json` (optional `feedback_pattern` property)
- [x] UI: add "sensory-friendly" preset (0.25) in gear panel
- [ ] Other: _________________

---

## References

- [Haptic Testing Template](HAPTIC-TESTING-TEMPLATE.md)
- [Threshold Grammar](../specs/threshold_grammar.md)
- [Runtime playbook](../playbooks/runtime.md) — a11y, vibrate wiring
