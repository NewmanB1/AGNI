# SVG Tools Improvement Plan

This document outlines a phased plan to implement the improvements identified for AGNI's SVG tools. See the prior analysis for full context.

## Implementation Status (2026-03-04)

| Phase | Status | Notes |
|-------|--------|-------|
| 1.1 Shared helpers | ✅ Done | `svg-helpers.js` created; all factories use it |
| 1.2 Object.assign | ✅ Done | ES5-safe `assign()` in helpers |
| 1.3 Bar horizontal | ✅ Done | `opts.horizontal` now renders horizontal bars |
| 1.4 Pie donut | ✅ Done | Donut hole drawn once after slices |
| 2.1 Time graph | ✅ Done | Elapsed time base; sensor timestamps correct |
| 2.2 Gauge sizing | ✅ Done | Uses `stage.w`/`stage.h` when opts not set |
| 2.3 Registry sync | ⏸️ Deferred | Portal catalog remains separate |
| 3.1 ARIA | ✅ Done | `rootSvg` supports `ariaLabel` from title/description |
| 3.2 Axis fn | ✅ Done | `opts.fn` accepts string e.g. `"Math.sin(x)"` |
| 4.1 Legacy PWA | ✅ Done | shell-boot uses `svg_spec` + fromSpec when available |

**Scope:** `packages/agni-runtime/rendering/`, `portal/src/lib/`, `server/pwa/`, schemas.

### Regression Guards & Proof of Completion

- **Tests:** `tests/unit/svg-tools-regression.test.js` — unit tests for P1.1–P1.4, P3.1, P3.2, P4.1, gauge
- **Verification script:** `scripts/check-svg-tools.js` — CI gate (source checks for wiring, Object.assign, horizontal bar, donut, ARIA, axis fn, shell-boot, gauge)
- **CI:** `npm run verify:svg-tools` and `verify:all` both run `check-svg-tools.js`

---

## Phase 1: Foundation & Quick Wins (1–2 days)

### 1.1 Shared SVG Helpers Module
**Goal:** Remove duplicated helpers; single source of truth.

| Task | Location | Effort |
|------|----------|--------|
| Create `svg-helpers.js` with `el`, `txt`, `g`, `rootSvg`, `clamp`, `polar`, `arcPath`, `PALETTE`, `escapeAttr` | `packages/agni-runtime/rendering/` | 2h |
| Update `svg-factories.js` to require/use helpers | Same | 1h |
| Update `svg-factories-dynamic.js` to use helpers | Same | 1h |
| Update `svg-factories-geometry.js` to use helpers | Same | 1h |
| Add `svg-helpers.js` to `FACTORY_LOAD_ORDER` in feature-inference.js (load before factories) | `packages/agni-utils/feature-inference.js` | 30m |
| Add to hub whitelist if applicable | `server/hub-transform.js` | 15m |

**Acceptance:** All factories render identically; no duplicate helper code.

---

### 1.2 ES5 Compatibility: Replace Object.assign
**Goal:** Remove ES6+ usage from ES5 runtime.

| Task | Location | Effort |
|------|----------|--------|
| Add `function assign(target, src)` in svg-helpers or inline | All factory files using `Object.assign` | 30m |
| Replace `Object.assign({...}, attrs)` with assign equivalent | `txt()` and any other usages | 30m |

**Acceptance:** No `Object.assign` in runtime; Chrome 44 compatible.

---

### 1.3 Bar Graph: Implement Horizontal Mode
**Goal:** Honour `opts.horizontal`.

| Task | Location | Effort |
|------|----------|--------|
| When `horiz`, swap axes: categories on Y, values on X | `svg-factories.js` barGraph | 1h |
| Adjust bar dimensions, labels, value placement | Same | 1h |
| Add/update tests | `tests/unit/` or `tests/` | 30m |

**Acceptance:** `{ horizontal: true }` produces horizontal bars; registry schema already exposes it.

---

### 1.4 Pie Chart: Fix Donut Hole Rendering
**Goal:** Donut hole drawn once, correct z-order.

| Task | Location | Effort |
|------|----------|--------|
| Draw donut hole once after all slices (or as single mask) | `svg-factories.js` pieChart | 45m |
| Ensure hole does not cover slice labels | Same | 15m |

**Acceptance:** Donut charts render correctly; labels visible.

---

## Phase 2: Bugs & Consistency (1 day)

### 2.1 Time Graph: Fix Sensor Timestamp
**Goal:** Sensor readings use correct time.

| Task | Location | Effort |
|------|----------|--------|
| Use `performance.now() / 1000` or `Date.now() / 1000` in sensor callback when pushing data | `svg-factories-dynamic.js` timeGraph | 30m |
| Ensure `lastT` is initialised before first sensor push | Same | 15m |

**Acceptance:** Time graph x-axis reflects real timestamps.

---

### 2.2 Gauge: Use Stage Dimensions
**Goal:** Gauge layout respects stage size.

| Task | Location | Effort |
|------|----------|--------|
| Use `stage.w` and `stage.h` for gauge layout; allow opts override | `svg-factories-dynamic.js` gauge | 30m |
| Test in compose with non-default stage size | Manual / test | 15m |

**Acceptance:** Gauge fills stage correctly in composed layouts.

---

### 2.3 Registry / Portal Catalog Unification
**Goal:** Single source of truth for factory metadata.

| Task | Location | Effort |
|------|----------|--------|
| Export registry schemas from `@agni/runtime` or create `@agni/svg-schema` package | New or existing package | 2h |
| Portal imports from runtime/package instead of svg-catalog | `portal/src/lib/svg-catalog.js` | 1h |
| Remove duplicated FACTORIES/CATEGORIES from portal; re-export or adapt | Same | 1h |
| Keep portal-specific pieces (e.g. EXPERIMENT_PRESETS) in portal | Same | 30m |

**Acceptance:** Adding a factory in the registry updates portal; no schema drift.

---

## Phase 3: Accessibility & Serialization (1–2 days)

### 3.1 ARIA & Semantic SVG
**Goal:** SVGs usable by screen readers.

| Task | Location | Effort |
|------|----------|--------|
| Add `role="img"` and `aria-labelledby` to root SVG in `rootSvg()` | svg-helpers or svg-factories | 30m |
| Add `<title>` element from `opts.title` or `opts.description` | Same | 30m |
| Ensure `svg_spec.description` flows through for accessibility | Compiler/player if needed | 30m |
| Document a11y expectations in AGENTS.md or CONVENTIONS | `docs/` | 15m |

**Acceptance:** NVDA/VoiceOver can announce chart purpose; SVGs have titles.

---

### 3.2 Axis Factory: Serializable Function
**Goal:** `opts.fn` can be stored in YAML.

| Task | Location | Effort |
|------|----------|--------|
| Accept `opts.fn` as string (e.g. `"Math.sin(x)"`) | `svg-factories.js` axis | 45m |
| Use `new Function('x', 'return ' + fnStr)` with try/catch and fallback | Same | 30m |
| Update registry schema: `fn` type `string` with placeholder | svg-registry.js | 15m |
| Validate/sandbox: restrict to Math.* and basic ops (security review) | Same | 1h |

**Acceptance:** Lesson YAML can store `fn: "Math.sin(x)"`; axis plots correctly.

---

## Phase 4: Legacy & Polish (0.5–1 day)

### 4.1 Legacy PWA Shell Path
**Goal:** Align shell-boot with main player.

| Task | Location | Effort |
|------|----------|--------|
| In shell-boot, if `step.svg_spec` exists and `AGNI_SVG.fromSpec` available, use it | `server/pwa/shell-boot.js` | 1h |
| Fallback to `svgGenerators` only when `svg_spec` absent and legacy `svg_type` present | Same | 30m |
| Document deprecation of `svg_type`/`params` in schema or docs | `schemas/`, docs | 15m |

**Acceptance:** New lessons use svg_spec; old format still works where supported.

---

### 4.2 Optional: Export & Responsive
**Goal:** Basic export and aspect-ratio options.

| Task | Location | Effort |
|------|----------|--------|
| Add `stage.export(format)` for PNG (via canvas) and SVG (outerHTML) | svg-stage.js | 2h |
| Add `preserveAspectRatio` option to root SVG | svg-helpers | 30m |
| Expose export in player UI if desired | player.js / UI | 1h |

**Acceptance:** Callers can export visuals; aspect ratio configurable. *(Defer if time-constrained.)*

---

## Execution Order

```
Phase 1.1 (helpers) → 1.2 (Object.assign) → 1.3 (bar) → 1.4 (pie)
         ↓
Phase 2.1 (time graph) → 2.2 (gauge) → 2.3 (registry)
         ↓
Phase 3.1 (a11y) → 3.2 (axis fn)
         ↓
Phase 4.1 (legacy) → 4.2 (export, optional)
```

**Dependencies:**
- Phase 1.1 blocks other Phase 1 items (shared helpers used everywhere).
- Phase 2.3 can run in parallel with 2.1–2.2.
- Phase 3 and 4 are largely independent.

---

## Verification Checklist

After each phase, run:

- [ ] `npm run verify:all` (or equivalent CI)
- [ ] Build lesson HTML with svg steps; visual check in browser
- [ ] `lessons/examples/svg-gallery.yaml` renders correctly
- [ ] `lessons/examples/physics-lab.yaml` (sensor visuals) works
- [ ] Portal SvgSpecEditor and preview render
- [ ] No regressions on Chrome 44 / Android 6 WebView (if still supported)

---

## Rollback

- Phase 1.1: Revert helpers; restore inline helpers in each factory.
- Phases 1.3–1.4, 2.x: Revert specific factory changes.
- Phase 2.3: Restore portal svg-catalog if runtime import causes issues.
- Phase 3.2: Revert to function-only `fn`; document as non-serializable.

---

## Estimated Total

| Phase | Effort |
|-------|--------|
| Phase 1 | 1.5–2 days |
| Phase 2 | 1 day |
| Phase 3 | 1–2 days |
| Phase 4 | 0.5–1 day |
| **Total** | **4–6 days** |

Phase 4.2 (export) is optional; omitting it saves ~0.5 day.
