# runtimeManifest.js Improvement Plan

Plan to address gaps in `packages/agni-utils/runtimeManifest.js`: DRY refactor, API cleanup, documentation, defensive handling, test and playbook updates, and CI guards. Follows `docs/archive/SERVICES-IMPROVEMENT-PLAN.md`, `docs/archive/HUB-IMPROVEMENT-PLAN.md`, and `.cursor/rules/sprint-verification.md`.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | DRY: derive getOrderedFactoryFiles from FACTORY_LOAD_ORDER | Unit tests | `npm test` runtimeManifest, svg-tools; verify:svg-tools pass |
| **Phase 2** | API cleanup: remove unused specIds | Unit tests | Tests pass with new capability shape |
| **Phase 3** | Documentation and comments | Manual review | JSDoc, header comments, PATH_MAP vs LOAD_ORDER explained |
| **Phase 4** | Defensive resolveFactoryPath | Unit test | Test unknown filename fallback |
| **Phase 5** | Test import path + playbook updates | check-utils-test-targets (new) | Test uses @agni/utils; playbooks reference packages/agni-utils |
| **Phase 6** | CI cross-check: factory map / hub whitelist | check-runtime-manifest (new) | Script in verify:all; break-it fails |

---

## Regression Guards (Summary)

| Guard | Script / Test | Purpose |
|-------|---------------|---------|
| Unit tests | `tests/unit/runtimeManifest.test.js`, `svg-tools-regression.test.js` | Fail if getOrderedFactoryFiles order or capability flags change incorrectly |
| SVG tools | `scripts/check-svg-tools.js`, `verify:svg-tools` | Fail if FACTORY_PATH_MAP, load order, or gauge missing |
| Test targets | `scripts/check-utils-test-targets.js` (new) | Fail if runtimeManifest tests require src/utils instead of @agni/utils |
| Manifest consistency | `scripts/check-runtime-manifest.js` (new) | Fail if FACTORY_FILE_MAP files not in PATH_MAP, or hub ALLOWED_FACTORY_FILES out of sync |
| verify:all | Full chain | All gates must pass after each phase |

---

## Phase 1: DRY — Derive getOrderedFactoryFiles from FACTORY_LOAD_ORDER (High Priority)

**Problem:** `getOrderedFactoryFiles` duplicates the ordered list in its body. Adding or reordering a file requires edits in two places; risk of drift.

### RM1.1 Define optional-file metadata

| # | Task | File | Change |
|---|------|------|--------|
| RM1.1a | Add OPTIONAL_FILES config | `packages/agni-utils/runtimeManifest.js` | Define which files in FACTORY_LOAD_ORDER are optional and under which capability flag, e.g. `{ 'sensor-bridge.js': 'includeSensorBridge', 'svg-factories-dynamic.js': 'hasDynamic', ... }` |
| RM1.1b | Or: filter FACTORY_LOAD_ORDER | Same | Implement `getOrderedFactoryFiles` as: filter FACTORY_LOAD_ORDER by capabilities; core files always included, optional files included only when flag is true |

### RM1.2 Refactor getOrderedFactoryFiles

| # | Task | File | Change |
|---|------|------|--------|
| RM1.2 | Derive from FACTORY_LOAD_ORDER | `packages/agni-utils/runtimeManifest.js` | Replace hardcoded array with logic that iterates FACTORY_LOAD_ORDER and includes each file iff (always-included) or (optional && capabilities[flag]) |

### RM1.3 Regression guard

| # | Task | Change |
|---|------|--------|
| RM1.3 | Existing tests | `tests/unit/runtimeManifest.test.js` and `svg-tools-regression.test.js` must pass unchanged. Order assertions (stage before factories, sensor-bridge position) must hold. |

**Proof of completion:**
```bash
node --test tests/unit/runtimeManifest.test.js
# Exit 0; all tests pass

node --test tests/unit/svg-tools-regression.test.js
# Exit 0; svg-helpers, load order assertions pass

node scripts/check-svg-tools.js
# Exit 0

# Break-it: swap svg-stage and svg-factories in FACTORY_LOAD_ORDER → tests fail
```

---

## Phase 2: API Cleanup — Remove Unused specIds (Medium Priority)

**Problem:** `getOrderedFactoryFiles(capabilities)` accepts `specIds` but never uses it. Callers (feature-inference) pass it; it adds noise and can mislead future maintainers.

### RM2.1 Remove specIds from API

| # | Task | File | Change |
|---|------|------|--------|
| RM2.1a | Stop accepting specIds | `packages/agni-utils/runtimeManifest.js` | `getOrderedFactoryFiles` only uses `includeSensorBridge`, `hasDynamic`, `hasGeometry`, `includeTableRenderer`. Ignore or strip `specIds` if present (backward compat) or require callers to omit it. |
| RM2.1b | Update feature-inference | `packages/agni-utils/feature-inference.js` | Remove `specIds` from the object passed to `getOrderedFactoryFiles` |
| RM2.1c | Update tests | `tests/unit/runtimeManifest.test.js`, `scripts/check-svg-tools.js` | Pass capabilities without `specIds`, or with `specIds` and assert behavior unchanged |

### RM2.2 Regression guard

| # | Task | Change |
|---|------|--------|
| RM2.2 | Tests | All runtimeManifest and svg-tools tests pass. `feature-inference` continues to produce same factoryManifest for the same lesson inputs. |

**Proof of completion:**
```bash
node --test tests/unit/runtimeManifest.test.js
node --test tests/unit/svg-tools-regression.test.js
node scripts/check-svg-tools.js
# All exit 0

# Spot-check: build a lesson that uses sensors + dynamic visuals; assert factoryManifest matches pre-change
```

---

## Phase 3: Documentation and Comments (Medium Priority)

**Problem:** No JSDoc on exported functions; `capabilities` shape undocumented; relationship between FACTORY_PATH_MAP, FACTORY_LOAD_ORDER, and FACTORY_FILE_MAP unclear. Stale Backlog/ARCH reference.

### RM3.1 Add file header and map documentation

| # | Task | File | Change |
|---|------|------|--------|
| RM3.1a | File header | `packages/agni-utils/runtimeManifest.js` | Add 3–5 line summary: maps runtime capabilities to factory filenames and load order; used by feature-inference, html builder, hub-transform |
| RM3.1b | Map relationship | Same | Comment above FACTORY_PATH_MAP: "Bare filename → relative path under runtime root. Used by resolveFactoryPath." Comment above FACTORY_LOAD_ORDER: "Canonical order for on-demand factory files; getOrderedFactoryFiles filters this." Comment above FACTORY_FILE_MAP: "Visual factory ID (e.g. barGraph) → filename. Used by getFileForFactoryId." |
| RM3.1c | Backlog reference | Same | Update or remove "Backlog task 12 — ARCH §5.3" to current reference or delete if obsolete |

### RM3.2 Add JSDoc to exports

| # | Task | File | Change |
|---|------|------|--------|
| RM3.2a | resolveFactoryPath | `packages/agni-utils/runtimeManifest.js` | `@param {string} runtimeDir` `@param {string} filename` `@returns {string}` Full path; falls back to path.join(runtimeDir, filename) if filename not in FACTORY_PATH_MAP |
| RM3.2b | getFileForFactoryId | Same | `@param {string} id` Factory ID (e.g. 'barGraph') `@returns {string|undefined}` Filename or undefined |
| RM3.2c | getOrderedFactoryFiles | Same | `@param {{ includeSensorBridge?: boolean, hasDynamic?: boolean, hasGeometry?: boolean, includeTableRenderer?: boolean }} capabilities` `@returns {string[]}` Ordered list of factory filenames |

**Proof of completion:**
```bash
# Manual review: JSDoc present and accurate
# No functional change; tests still pass
```

---

## Phase 4: Defensive resolveFactoryPath (Low Priority)

**Problem:** When `filename` is not in FACTORY_PATH_MAP, `path.join(runtimeDir, undefined)` may behave unexpectedly on some platforms. Fallback should be explicit.

### RM4.1 Explicit fallback

| # | Task | File | Change |
|---|------|------|--------|
| RM4.1 | Explicit fallback | `packages/agni-utils/runtimeManifest.js` | `const rel = FACTORY_PATH_MAP[filename]; return rel ? path.join(runtimeDir, rel) : path.join(runtimeDir, filename);` (or equivalent) — document that unknown filenames resolve to runtimeDir/filename |

### RM4.2 Unit test for unknown filename

| # | Task | File | Change |
|---|------|------|--------|
| RM4.2 | Add test | `tests/unit/runtimeManifest.test.js` | `resolveFactoryPath('/tmp/runtime', 'unknown.js')` returns `path.join('/tmp/runtime', 'unknown.js')` |

**Proof of completion:**
```bash
node --test tests/unit/runtimeManifest.test.js
# New test passes; existing tests pass
```

---

## Phase 5: Test Import Path and Playbook Updates (Low Priority)

**Problem:** `tests/unit/runtimeManifest.test.js` uses `require('../../src/utils/runtimeManifest')` instead of `@agni/utils/runtimeManifest`. Playbooks reference `src/utils/featureInference.js` and `server/hub-transform.js`; canonical paths are `packages/agni-utils/` and `packages/agni-hub/`.

### RM5.1 Fix test import

| # | Task | File | Change |
|---|------|------|--------|
| RM5.1 | Use package path | `tests/unit/runtimeManifest.test.js` | `require('@agni/utils/runtimeManifest')` instead of `require('../../src/utils/runtimeManifest')` |

### RM5.2 Update playbooks

| # | Task | File | Change |
|---|------|------|--------|
| RM5.2a | compiler.md | `docs/playbooks/compiler.md` | "src/utils/featureInference.js" → "packages/agni-utils/feature-inference.js"; "FACTORY_LOAD_ORDER, FACTORY_FILE_MAP" → "runtimeManifest.js (FACTORY_LOAD_ORDER, FACTORY_FILE_MAP)" |
| RM5.2b | runtime.md | `docs/playbooks/runtime.md` | "server/hub-transform.js" → "packages/agni-hub/hub-transform.js" |
| RM5.2c | runtime.md | Same | "src/utils/featureInference.js" / feature inference → "packages/agni-utils/feature-inference.js" |

### RM5.3 Add check-utils-test-targets (optional)

| # | Task | File | Change |
|---|------|------|--------|
| RM5.3 | Create script | `scripts/check-utils-test-targets.js` | Grep runtimeManifest.test.js for `require\(['\"]\.\.\/\.\.\/src\/utils\/`; exit 1 if match. Wire into verify:all as `verify:utils-test-targets` if desired. |

**Proof of completion:**
```bash
node --test tests/unit/runtimeManifest.test.js
# Pass; test loads from @agni/utils

grep -E "packages/agni-utils|packages/agni-hub" docs/playbooks/compiler.md docs/playbooks/runtime.md
# Shows canonical paths
```

---

## Phase 6: CI Cross-Check — Factory Map and Hub Whitelist (Medium Priority)

**Problem:** Adding a new factory to FACTORY_FILE_MAP or FACTORY_LOAD_ORDER requires manually updating hub's ALLOWED_FACTORY_FILES. Drift can cause 403 or missing files when hub serves factories.

### RM6.1 Create check-runtime-manifest.js

| # | Task | File | Change |
|---|------|------|--------|
| RM6.1a | Create script | `scripts/check-runtime-manifest.js` | 1) Every value in FACTORY_FILE_MAP must be a key in FACTORY_PATH_MAP. 2) Every file in FACTORY_LOAD_ORDER must be in FACTORY_PATH_MAP. 3) Hub's ALLOWED_FACTORY_FILES (from hub-transform.js) must include all files that appear in FACTORY_LOAD_ORDER (or a documented subset). Parse hub-transform.js or require it and read ALLOWED_FACTORY_FILES; compare. Exit 1 if violations. |
| RM6.1b | Add verify:runtime-manifest | `package.json` | `"verify:runtime-manifest": "node scripts/check-runtime-manifest.js"` |
| RM6.1c | Wire into verify:all | `package.json` | Append `&& npm run verify:runtime-manifest` (or inline) |

### RM6.2 Break-it check

| # | Task | Change |
|---|------|--------|
| RM6.2 | Break-it | Add a new file to FACTORY_LOAD_ORDER without adding it to hub ALLOWED_FACTORY_FILES → script exits 1. Revert → script exits 0. |

**Proof of completion:**
```bash
node scripts/check-runtime-manifest.js
# Exit 0

# Break-it: add 'new-factory.js' to FACTORY_LOAD_ORDER only → exit 1
# Fix: add to hub ALLOWED_FACTORY_FILES (or to allowed subset) → exit 0
```

---

## Execution Order

1. **Phase 1** — DRY refactor (highest impact; foundation for others).
2. **Phase 2** — API cleanup (depends on Phase 1 for stable capability shape).
3. **Phase 3** — Documentation (can run in parallel with 1–2).
4. **Phase 4** — Defensive resolveFactoryPath (independent).
5. **Phase 5** — Test import + playbooks (independent).
6. **Phase 6** — CI cross-check (independent; high value for preventing drift).

Phases 3, 4, 5, 6 can be parallelized after Phase 1–2.

---

## Completion Checklist

- [x] RM1: getOrderedFactoryFiles derives from FACTORY_LOAD_ORDER
  - Proof: tests pass; check-svg-tools pass; break-it order change fails tests
- [x] RM2: specIds removed from getOrderedFactoryFiles API
  - Proof: feature-inference updated; tests pass
- [x] RM3: JSDoc and comments added; Backlog reference updated
  - Proof: manual review; no behavioral change
- [x] RM4: resolveFactoryPath explicit fallback + unit test
  - Proof: new test passes
- [x] RM5: Test uses @agni/utils; playbooks reference packages/agni-utils
  - Proof: grep confirms canonical paths
- [x] RM6: check-runtime-manifest.js in verify:all
  - Proof: script exit 0; break-it fails as expected
