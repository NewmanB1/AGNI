# Consolidated Roadmap

Single ordered list of remaining improvement work, merged from HUB-IMPROVEMENT-PLAN, HUB-CANONICAL-MIGRATION-PLAN, SERVICES-IMPROVEMENT-PLAN, PACKAGES-IMPROVEMENT-PLAN, RUNTIME-IMPROVEMENT-PLAN, BACKLOG-REMEDIATION-PLAN, and SVG-TOOLS-IMPROVEMENT-PLAN.

---

## Completed (Skip)

| Plan | Phase | Status |
|------|-------|--------|
| HUB-IMPROVEMENT | 1–5 | Done (lint, docs, types, test-targets, stale comments) |
| HUB-CANONICAL | 0–4 | Done (hub has no src/ imports; verify-canonical passes) |
| PACKAGES | Phase 1 | Done (@agni/lesson-gen exists; check-hub-no-scripts) |
| SERVICES | Phase 1 | Done (author uses @agni/lesson-gen) |
| BACKLOG | A, B, C | Done (Sentry, Sensor Toolkit, Accessibility) |
| SVG-TOOLS | 1.1–4.1 | Done (except 2.3 Registry sync deferred) |
| OPPORTUNISTIC-PRECACHE | All | Done |
| GOVERNANCE-IMPROVEMENT | All | Done |
| LESSON-CREATOR | Phases 1–8 | Done |
| SPRINT-PLAN | Sprints 1–6, L1 | Done |

---

## Remaining Work (Optimally Ordered)

### Tier 1: Foundation & Package Hygiene (Do First)

| # | Task | Source | Effort | Dependencies |
|---|------|--------|--------|--------------|
| 1 | **Fix generate-lesson.test.js** | SERVICES | 15m | — |
| | Tests require `../../scripts/generate-lesson`; should use `@agni/lesson-gen` | | | |
| 2 | **RUNTIME Phase 1: File headers** | RUNTIME | 1h | — |
| | Replace `// src/runtime/` with `// packages/agni-runtime/` in runtime files | | | |
| | Add `check-runtime-headers.js` if not present; wire into verify:all | | | |
| 3 | **RUNTIME Phase 2: README** | RUNTIME | 30m | — |
| | Update packages/agni-runtime README: canonical paths, sensor/factory flow | | | |

### Tier 2: Services & Package Polish

| # | Task | Source | Effort | Dependencies |
|---|------|--------|--------|--------------|
| 4 | **SERVICES Phase 2: Test targets** | SERVICES | 30m | — |
| | Ensure `check-services-test-targets` passes; tests use @agni/services | | | |
| 5 | **SERVICES Phase 3: Docs** | SERVICES | 30m | — |
| | verify:hub-docs / grep confirms @agni/services in docs | | | |
| 6 | **SERVICES Phase 6: Lint** | SERVICES | 30m | — |
| | `npm run lint` passes for packages/agni-services | | | |
| 7 | **PACKAGES Phase 2: verify-canonical** | PACKAGES | 15m | — |
| | Confirm all packages in PACKAGES_TO_CHECK; add any missing | | | |

### Tier 3: Optional / Lower Priority (8–11 Done)

| # | Task | Source | Status |
|---|------|--------|--------|
| 8 | **SERVICES Phase 4: Types** | SERVICES | Done — typecheck:services |
| 9 | **SERVICES Phase 5: Config injection** | SERVICES | Done — config-injection.test.js |
| 10 | **RUNTIME Phase 6: Types** | RUNTIME | Done — index.d.ts exists |
| 11 | **RUNTIME Phase 7: ESLint scope** | RUNTIME | Done — verify:runtime-lint in verify:all |
| 12 | **RUNTIME Phase 3/4: SVG registry, export** | RUNTIME | Deferred | — |
| | Portal catalog sync; stage.export() | | | |
| 13 | **BACKLOG Phase E: Deferred** | BACKLOG | Manual | — |
| | E1–E5: Base45/QR, log aggregator, Android test, SVG 2.3, export | | | |

### Tier 4: Feature / Spec Work (14–15 Done)

| # | Task | Source | Status |
|---|------|--------|--------|
| 14 | **LESSON-CREATOR-IMPROVEMENT** | LESSON-CREATOR | Done — Phases 1–8 (WYSIWYG, generate-lesson --portal, curriculum-gen import-to-hub) |
| 15 | **SPRINT-PLAN follow-on** | SPRINT | Done — Sprints 1–6, L1 v1.0.0 tag, remediation complete |

---

## Execution Order (Recommended)

1. **1 → 2 → 3** (Tier 1 in order) ✓
2. **4, 5, 6, 7** (Tier 2) ✓
3. **8–13** (Tier 3; 8–11 done; 12–13 deferred)
4. **14–15** (Tier 4) ✓ — All tiers complete

---

## Quick Start

To start with Tier 1:

```bash
# 1. Fix generate-lesson test
# In tests/unit/generate-lesson.test.js: require('@agni/lesson-gen') instead of scripts

# 2. Runtime headers
npm run verify:runtime-headers  # Check current state
# Fix any src/runtime/ in packages/agni-runtime/**/*.js

# 3. Runtime README
# Edit packages/agni-runtime/README.md
```

---

## Execution Plan with Regression Guards

See **`docs/REMAINING-IMPROVEMENTS-PLAN.md`** for a formal plan with regression guards per `.cursor/rules/sprint-verification.md`.

---

## References

- `docs/REMAINING-IMPROVEMENTS-PLAN.md` (formal plan + guards)
- `docs/HUB-IMPROVEMENT-PLAN.md`
- `docs/HUB-CANONICAL-MIGRATION-PLAN.md`
- `docs/SERVICES-IMPROVEMENT-PLAN.md`
- `docs/PACKAGES-IMPROVEMENT-PLAN.md`
- `docs/RUNTIME-IMPROVEMENT-PLAN.md`
- `docs/BACKLOG-REMEDIATION-PLAN.md`
- `docs/SVG-TOOLS-IMPROVEMENT-PLAN.md`
- `.cursor/rules/sprint-verification.md`
