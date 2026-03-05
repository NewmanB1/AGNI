# Haptic Testing Template (Neurodivergent Volunteers)

This document provides a template for documenting haptic (vibration) feedback testing with neurodivergent volunteers. It supports **ROADMAP Phase 3 (B3.1)** and informs refinement of Intensity schema settings (B3.2).

---

## Purpose

- Validate that OLS haptic feedback patterns (e.g. `vibration:short`, `vibration:success_pattern`) are usable and not overstimulating for neurodivergent learners.
- Gather feedback to refine `hapticIntensity` settings, reduced-motion behavior, and optional "haptic off" defaults.

---

## Current Implementation

- **Location:** `packages/agni-runtime/ui/a11y.js`, `shared-runtime.js`
- **Settings:** `agni_haptic_intensity` in localStorage: `0` (off) to `1` (full). Gear icon opens settings panel.
- **Patterns:** `vibration:short` (~200ms), `vibration:success_pattern` (success rhythm). Duration is scaled by `hapticIntensity`.

---

## Testing Checklist

Use this template when conducting sessions. Fill in dates, participant IDs (anonymized), and findings.

| # | Task | Notes |
|---|------|-------|
| 1 | Recruit 3–5 neurodivergent volunteers (e.g. autistic, ADHD, sensory processing differences) | Ensure informed consent; anonymize data |
| 2 | Run lessons: `gravity.yaml`, `ShakeRhythm.yaml` (hardware_trigger steps with haptics) | |
| 3 | Test default intensity (100%) | Too strong? Too weak? |
| 4 | Test reduced intensity (50%, 25%) via gear icon | Comfortable? Still noticeable? |
| 5 | Test haptic off (0%) | Any residual triggers? Clear feedback that haptics are disabled? |
| 6 | Test reduced-motion (OS preference + AGNI toggle) | Does it affect haptics? Expected? |
| 7 | Document verbatim quotes (with permission) | |
| 8 | Summarize recommendations | Schema/UI changes for B3.2 |

---

## Session Log Template

```
Date: YYYY-MM-DD
Participant ID: P1 (anonymized)
Context: [device, environment, session length]

Findings:
- Default intensity: [feedback]
- Reduced intensity: [feedback]
- Haptic off: [feedback]
- Other: [notable observations]

Recommendations:
-
```

---

## Refinement Notes (for B3.2)

After testing, document schema/UI changes here. Examples:

- Add `hapticIntensity` default of 0.5 for "sensitive" profile?
- Add `prefers-reduced-motion` → auto-set haptic to 0?
- Broader range (e.g. 0–0.5–1) vs current 0–1?
- Per-lesson override for authors (e.g. "this lesson uses strong haptics")?

---

## References

- [OLS Threshold Grammar](../specs/threshold_grammar.md) — sensor semantics
- [Runtime playbook](../playbooks/runtime.md) — a11y.js, haptic wiring
- [Intensity settings](INTENSITY-SETTINGS.md) — current schema documentation
