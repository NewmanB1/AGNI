# @agni/runtime Improvement Plan

Plan to address documentation gaps, stale paths, SVG registry/export options, accessibility follow-up, and package tooling in `packages/agni-runtime`. Follows `RUNTIME-MANIFEST-IMPROVEMENT-PLAN.md`, `HUB-IMPROVEMENT-PLAN.md`, and `.cursor/rules/sprint-verification.md`.

**Reference:** Sensor toolkit (STK-1.1–3.3) and SVG tools (P1.1–4.1) are already complete per `sensor-toolkit-improvement-plan.md` and `SVG-TOOLS-IMPROVEMENT-PLAN.md`.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | File headers: src/runtime → packages/agni-runtime | check-runtime-headers (new) | Script exit 0; grep finds no src/runtime in headers |
| **Phase 2** | README: canonical paths, sensor/factory flow | Manual + grep | README references @agni/plugins, packages/agni-utils |
| **Phase 3** | SVG registry sync (optional, deferred) | verify:svg-tools | Portal catalog imports from runtime; no drift |
| **Phase 4** | SVG export & responsive (optional) | Unit test | stage.export(), preserveAspectRatio; test passes |
| **Phase 5** | Accessibility / haptic refinement (manual) | INTENSITY-SETTINGS | Session log filled; recommendations documented |
| **Phase 6** | TypeScript types (optional) | typecheck | npm run typecheck pass for @agni/runtime imports |
| **Phase 7** | ESLint scope for runtime | verify:runtime-lint (new) | ESLint runs on packages/agni-runtime with ES5 override |

---

## Regression Guards (Summary)

| Guard | Script / Test | Purpose |
|-------|---------------|---------|
| Runtime headers | `scripts/check-runtime-headers.js` (new) | Fail if any .js in packages/agni-runtime has first-line comment `// src/runtime/` |
| README canonical | Manual / grep | No src/utils, src/runtime in Contributing paths |
| verify:svg-tools | `scripts/check-svg-tools.js` | Existing; must pass after SVG changes |
| test:es5 | `npm run test:es5` | No ES6+ in runtime; Chrome 44 compat |
| verify:all | Full chain | All gates must pass after each phase |

---

## Phase 1: File Headers — src/runtime → packages/agni-runtime (High Priority)

**Problem:** Many runtime files have `// src/runtime/...` in the first line. Canonical path is `packages/agni-runtime/`. Causes confusion and inconsistent ownership signals.

### R1.1 Create check-runtime-headers.js

| # | Task | File | Change |
|---|------|------|--------|
| R1.1a | Create script | `scripts/check-runtime-headers.js` | Scan `packages/agni-runtime/**/*.js`; read first non-empty line; fail if it matches `// src/runtime/` (stale path). Pass if all files have `// packages/agni-runtime/` or equivalent. |
| R1.1b | Add verify:runtime-headers | `package.json` | `"verify:runtime-headers": "node scripts/check-runtime-headers.js"` |
| R1.1c | Wire into verify:all | `package.json` | Append to verify:all chain |

### R1.2 Fix all file headers

| # | Task | File | Change |
|---|------|------|--------|
| R1.2 | Update each .js | `packages/agni-runtime/**/*.js` | Replace `// src/runtime/...` with `// packages/agni-runtime/...` (match actual subpath, e.g. `packages/agni-runtime/sensors/sensor-bridge.js`) |

**Proof of completion:**
```bash
node scripts/check-runtime-headers.js
# Exit 0

grep -r "^// src/runtime" packages/agni-runtime/
# Empty

# Break-it: revert one header to src/runtime → script exits 1
```

---

## Phase 2: README — Canonical Paths and Flow (High Priority)

**Problem:** README "Adding a sensor" points to `KNOWN_SENSORS set in lesson-validator.js`; sensors are now in `@agni/plugins/builtins/sensors.js`. "Adding an SVG factory" references `portal/src/lib/svg-catalog.js` and `src/utils/lesson-validator.js` — use package paths.

### R2.1 Update Contributing section

| # | Task | File | Change |
|---|------|------|--------|
| R2.1a | Sensor flow | `packages/agni-runtime/README.md` | "Adding a sensor: Update sensor-bridge.js; register in @agni/plugins/builtins/sensors.js; add to threshold grammar if new subject." |
| R2.1b | SVG factory flow | Same | "Adding an SVG factory: Add implementation in rendering/svg-factories*.js; register in svg-registry.js; add to @agni/utils/runtimeManifest FACTORY_FILE_MAP; add to packages/agni-hub ALLOWED_FACTORY_FILES; add to portal svg-catalog and validator." (Use package names, not src paths.) |

### R2.2 Optional: check-runtime-docs script

| # | Task | File | Change |
|---|------|------|--------|
| R2.2 | Add script | `scripts/check-runtime-docs.js` | Grep packages/agni-runtime/README.md for `src/utils/`, `src/runtime/`, `lesson-validator` (without @ols/schema); exit 1 if found. Wire as verify:runtime-docs. |

**Proof of completion:**
```bash
grep -E "src/utils|src/runtime|lesson-validator\.js" packages/agni-runtime/README.md
# Empty (or only in "legacy" context if any)

# Manual review: Contributing section reads correctly
```

---

## Phase 3: SVG Registry Sync (Optional, Deferred)

**Problem:** Portal has `portal/src/lib/svg-catalog.js`; runtime has `svg-registry.js`. Adding a factory requires edits in both; risk of drift. Per SVG-TOOLS-IMPROVEMENT-PLAN 2.3, "Portal catalog remains separate."

### R3.1 Design (when un-deferring)

| # | Task | Change |
|---|------|--------|
| R3.1a | Export registry schemas | Export FACTORIES/CATEGORIES from @agni/runtime or new @agni/svg-schema |
| R3.1b | Portal import | Portal imports from runtime/package instead of maintaining duplicate catalog |
| R3.1c | Keep portal-specific | EXPERIMENT_PRESETS and similar stay in portal |

**Regression guard:** verify:svg-tools; npm run build; portal preview renders.

**Proof of completion:** (when implemented)
```bash
npm run verify:svg-tools
# Exit 0

# Add new factory in runtime only → portal picks it up (no portal edit)
```

---

## Phase 4: SVG Export & Responsive (Optional)

**Problem:** Per SVG-TOOLS-IMPROVEMENT-PLAN 4.2, optional features: stage.export(format) for PNG/SVG, preserveAspectRatio, expose in player UI.

### R4.1 Implement (when prioritised)

| # | Task | File | Change |
|---|------|------|--------|
| R4.1a | stage.export | `packages/agni-runtime/rendering/svg-stage.js` | Add export(format) for PNG (canvas) and SVG (outerHTML) |
| R4.1b | preserveAspectRatio | svg-helpers | Add option to rootSvg |
| R4.1c | Regression test | `tests/unit/svg-tools-regression.test.js` or new | Assert export returns string; preserveAspectRatio applied |

**Proof of completion:** (when implemented)
```bash
node --test tests/unit/svg-tools-regression.test.js
# New export test passes
```

---

## Phase 5: Accessibility / Haptic Refinement (Manual)

**Problem:** INTENSITY-SETTINGS.md has unchecked "Other: _________________" for post-B3.1 refinement. HAPTIC-TESTING-TEMPLATE exists but sessions may not have been run.

### R5.1 Haptic testing sessions

| # | Task | Change |
|---|------|--------|
| R5.1 | Run sessions | Per HAPTIC-TESTING-TEMPLATE.md: recruit 3–5 neurodivergent volunteers, run gravity.yaml and ShakeRhythm, document findings |
| R5.2 | Document recommendations | Fill "Refinement Notes (for B3.2)" in template; update INTENSITY-SETTINGS.md "Other" with concrete items |

**Proof of completion:** Session log(s) filled; INTENSITY-SETTINGS.md "Other" has actionable items or "N/A — no changes recommended."

---

## Phase 6: TypeScript Types (Optional)

**Problem:** @agni/runtime has no .d.ts; TypeScript consumers (e.g. portal) get no types for globals or exports.

### R6.1 Add index.d.ts

| # | Task | File | Change |
|---|------|------|--------|
| R6.1a | Create types | `packages/agni-runtime/index.d.ts` | Declare AGNI_SHARED, AGNI_SVG, AGNI_GATES, AGNI_A11Y, etc. as globals; document IIFE structure |
| R6.1b | Add types field | `packages/agni-runtime/package.json` | `"types": "index.d.ts"` |
| R6.1c | Regression | typecheck | `npm run typecheck` pass when portal/TS code references runtime globals |

**Proof of completion:** (when implemented)
```bash
npm run typecheck
# Exit 0; no errors for @agni/runtime
```

---

## Phase 7: ESLint Scope for Runtime (Low Priority)

**Problem:** Runtime files must stay ES5; if ESLint runs on packages/agni-runtime, it needs an override for no-var, prefer-const, etc. (like hub pwa/).

### R7.1 Add runtime override

| # | Task | File | Change |
|---|------|------|--------|
| R7.1a | ESLint override | `eslint.config.js` | Add `{ files: ['packages/agni-runtime/**/*.js'], rules: { 'no-var': 'off', 'prefer-const': 'off' }, ... }` if lint targets runtime |
| R7.1b | Add verify:runtime-lint | `package.json` | `"verify:runtime-lint": "eslint packages/agni-runtime/"` if desired |
| R7.1c | Wire | Same | Append to verify:all (optional; runtime may be excluded from lint today) |

**Proof of completion:**
```bash
npm run verify:runtime-lint
# Exit 0 (or confirm runtime is intentionally excluded)
```

---

## Execution Order

1. **Phase 1** — File headers (foundation; enables header check script).
2. **Phase 2** — README (quick win; no code change).
3. **Phases 3, 4** — Optional; implement when prioritised.
4. **Phase 5** — Manual; schedule with volunteers.
5. **Phases 6, 7** — Optional; can run in parallel with each other.

---

## Completion Checklist

- [x] R1: File headers updated; check-runtime-headers in verify:all
  - Proof: `node scripts/check-runtime-headers.js` exit 0; grep finds no src/runtime in headers
- [x] R2: README Contributing uses canonical paths
  - Proof: grep finds no src/utils, src/runtime in Contributing
- [x] R3: SVG registry sync (optional, deferred)
  - Proof: Portal imports FACTORIES/CATEGORIES from @agni/runtime/svg-catalog; svg-registry.js is single source
- [x] R4: SVG export & responsive (optional)
  - Proof: stage.export test; preserveAspectRatio in rootSvg
- [ ] R5: Haptic refinement (manual)
  - Proof: Session log filled; INTENSITY-SETTINGS "Other" updated
- [x] R6: TypeScript types (optional)
  - Proof: index.d.ts; typecheck pass
- [x] R7: ESLint scope (optional)
  - Proof: verify:runtime-lint in verify:all
