# @agni/governance Improvement Plan

Plan to improve testing, package isolation, documentation, and code quality for `packages/agni-governance`. Follows conventions from `docs/RUNTIME-IMPROVEMENT-PLAN.md` and `.cursor/rules/sprint-verification.md`.

**Reference:** Governance is used by `@agni/services/governance`, `packages/agni-hub/routes/governance.js`, and `packages/agni-hub/context/data-access.js` for policy, compliance, and catalog.

---

## Current State

| Area | State |
|------|-------|
| **Unit tests** | `tests/unit/governance.test.js` uses `require('../../src/governance/...')` — tests shims, not canonical package |
| **Paths** | `policy.js`, `catalog.js` use `path.join(__dirname, '../../schemas', ...)`; `evaluateLessonCompliance.js` uses `../../data/utu-constants.json` |
| **README** | Usage example has wrong argument order and result shape |
| **Theta** | `theta.js` imports `governanceService` but does not use it (ESLint warning) |
| **Package scripts** | No `test`, `lint`, or verify script in package.json |
| **Verify** | No governance-specific regression script |

---

## Goals

1. **Test the canonical package** — unit tests must require `@agni/governance`, not `src/governance`.
2. **Document accurately** — README usage and result shape must match implementation.
3. **Reduce path coupling** — schema and UTU paths configurable or injectable.
4. **Clean integration** — fix theta `governanceService` unused warning.
5. **Guard against regression** — add CI checks for governance invariants.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | Tests use @agni/governance | governance.test.js + verify | Tests require package; all pass |
| **Phase 2** | README accuracy | check-governance-docs (new) | Script grep; README matches API |
| **Phase 3** | Theta governanceService | ESLint | No unused vars in theta.js |
| **Phase 4** | Package scripts & verify | verify:all | governance.test in verify chain |
| **Phase 5** | Path isolation (optional) | verify:canonical | Configurable schema/utu paths |
| **Phase 6** | Regression script (optional) | check-governance-regression (new) | Script verifies exports, no src/ |

---

## Regression Guards (Summary)

| Guard | Script / Test | Purpose |
|-------|---------------|---------|
| Tests canonical | `tests/unit/governance.test.js` | Must require `@agni/governance`; fail if `src/governance` |
| README docs | `scripts/check-governance-docs.js` (new) | README usage example matches API; no wrong shapes |
| Theta clean | `eslint packages/agni-hub/` | No unused `governanceService` |
| Governance regression | `scripts/check-governance-regression.js` (new, optional) | Package exports correct; no src/ requires |
| verify:all | Full chain | All gates pass after each phase |

---

## Phase 1: Tests Use Canonical Package (High Priority)

**Problem:** `tests/unit/governance.test.js` requires `../../src/governance/policy`, `src/governance/evaluateLessonCompliance`, `src/governance/aggregateCohortCoverage`. Those are shims to the package; tests never exercise the canonical implementation directly.

### G1.1 Update governance.test.js

| # | Task | File | Change |
|---|------|------|--------|
| G1.1a | Switch requires | `tests/unit/governance.test.js` | Replace `require('../../src/governance/policy')` with `const gov = require('@agni/governance')`; use `gov.loadPolicy`, `gov.savePolicy`, `gov.validatePolicy`, `gov.evaluateLessonCompliance`, `gov.aggregateCohortCoverage`, `gov.MASTERY_THRESHOLD` |
| G1.1b | Policy tests | Same | `policy.loadPolicy` → `gov.loadPolicy`; `policy.savePolicy` → `gov.savePolicy`; `policy.validatePolicy` → `gov.validatePolicy` |
| G1.1c | Compliance tests | Same | `evaluateLessonCompliance` → `gov.evaluateLessonCompliance` |
| G1.1d | Coverage tests | Same | `aggregateCohortCoverage` → `gov.aggregateCohortCoverage`; `MASTERY_THRESHOLD` → `gov.MASTERY_THRESHOLD` |

### G1.2 Add check-governance-canonical script

| # | Task | File | Change |
|---|------|------|--------|
| G1.2a | Create script | `scripts/check-governance-canonical.js` | Grep `tests/unit/governance.test.js` for `src/governance` or `../../src/governance`; exit 1 if found. Grep for `@agni/governance`; exit 1 if not found. |
| G1.2b | Wire | `package.json` | `"verify:governance-canonical": "node scripts/check-governance-canonical.js"`; add to verify:all |

**Proof of completion:**
```bash
grep -E "src/governance|../../src/governance" tests/unit/governance.test.js
# Empty

grep "@agni/governance" tests/unit/governance.test.js
# At least one match

node scripts/check-governance-canonical.js
# Exit 0

npm test -- tests/unit/governance.test.js
# All tests pass
```

---

## Phase 2: README Accuracy (High Priority)

**Problem:** README Usage shows `evaluateLessonCompliance(policy, sidecar)` but actual signature is `(sidecar, policy)`. Result shape shows `{ compliant, violations, warnings }` but actual shape is `{ status: 'ok'|'warning'|'fail', issues: [{ message, severity }] }`.

### G2.1 Fix README

| # | Task | File | Change |
|---|------|------|--------|
| G2.1a | Usage example | `packages/agni-governance/README.md` | Change to `evaluateLessonCompliance(sidecar, policy)` |
| G2.1b | Result shape | Same | Change to `{ status, issues }`; `if (result.status !== 'ok')` and `result.issues` |
| G2.1c | Architecture diagram | Same | Update `(policy, lessonSidecar)` to `(sidecar, policy)` if present; update result shape in diagram |

### G2.2 Add check-governance-docs script

| # | Task | File | Change |
|---|------|------|--------|
| G2.2a | Create script | `scripts/check-governance-docs.js` | Grep README for `evaluateLessonCompliance(policy,` or `evaluateLessonCompliance(policy,` — fail if found (wrong order). Grep for `result.compliant` or `result.violations` — fail if found (wrong shape). Must contain `evaluateLessonCompliance(sidecar,` and `result.status` or `result.issues`. |
| G2.2b | Wire | `package.json` | `"verify:governance-docs": "node scripts/check-governance-docs.js"`; add to verify:all |

**Proof of completion:**
```bash
node scripts/check-governance-docs.js
# Exit 0

# Break-it: revert README usage to (policy, sidecar) → script exits 1
```

---

## Phase 3: Theta governanceService (Medium Priority)

**Problem:** `packages/agni-hub/theta.js` destructures `governanceService` from `ctx` but never uses it. ESLint reports `'governanceService' is assigned a value but never used`.

### G3.1 Fix theta.js

| # | Task | File | Change |
|---|------|------|--------|
| G3.1a | Remove unused | `packages/agni-hub/theta.js` | Remove `governanceService` from destructuring: `const { ..., thetaCache, accountsService } = ctx` (drop `governanceService`). Governance is used only via routes (`routes/governance.js`), not theta business logic. |

**Alternative (if governance needed in theta):** Document and use it (e.g. for catalog filtering in `getLessonsSortedByTheta`). Current design uses `loadApprovedCatalogAsync` from data-access, which calls `governanceService.loadCatalog` — so theta does not need direct access.

**Proof of completion:**
```bash
npx eslint packages/agni-hub/theta.js
# No "governanceService" unused warning

npm run verify:all
# Pass
```

---

## Phase 4: Package Scripts & Verify Chain (Medium Priority)

**Problem:** `packages/agni-governance/package.json` has no `test` or `lint` script. Governance tests are not explicitly in verify:all (they run via `npm test` which runs all unit tests, but verify:all only runs config-injection and theta-api).

### G4.1 Package scripts

| # | Task | File | Change |
|---|------|------|--------|
| G4.1a | Add test script | `packages/agni-governance/package.json` | `"test": "node --test ../../tests/unit/governance.test.js"` (or use workspace root test; governance has no internal tests yet) |
| G4.1b | Optional | Same | `"scripts": { "test": "node --test ../../tests/unit/governance.test.js" }` — only if running from package dir is desired. Root `npm test` already runs governance.test.js. |

### G4.2 Verify chain

| # | Task | File | Change |
|---|------|------|--------|
| G4.2a | Add governance test to verify:all | `package.json` | Append `node --test tests/unit/governance.test.js` to verify:all (or ensure it is covered — `npm test` runs `tests/unit/*.test.js` which includes governance). Verify:all currently runs `config-injection.test.js` and `theta-api.test.js` explicitly. Add `governance.test.js` for explicit coverage. |
| G4.2b | Add verify:governance | Same | `"verify:governance": "node scripts/check-governance-canonical.js && node scripts/check-governance-docs.js && node --test tests/unit/governance.test.js"` |

**Proof of completion:**
```bash
npm run verify:governance
# Exit 0

# Verify:all includes governance checks
npm run verify:all
# Pass
```

---

## Phase 5: Path Isolation

**Problem:** `policy.js` uses `path.join(__dirname, '../../schemas', 'governance-policy.schema.json')`; `catalog.js` uses `../../schemas/approved-catalog.schema.json`; `evaluateLessonCompliance.js` uses `../../data/utu-constants.json`. These tie the package to monorepo layout.

### G5.1 Design (when un-deferring)

| # | Task | Change |
|---|------|--------|
| G5.1a | Schema paths | Add `schemaPaths` option to policy/catalog or use `@agni/utils/env-config` paths. `envConfig` could expose `governancePolicySchema`, `approvedCatalogSchema`; or pass paths at init. |
| G5.1b | UTU constants | Add optional `utuConstants` param to `evaluateLessonCompliance(sidecar, policy, opts)` where `opts.utuConstants` overrides file load. Or use `envConfig.utuConstantsPath`. Default stays `../../data/utu-constants.json` for backward compat. |
| G5.1c | Allowlist | If governance must read from repo root, add allowlist in `verify-canonical-ownership.js` for `path.join(__dirname, '../../schemas'` — document that governance expects monorepo layout. |

**Proof of completion (when done):**
```bash
# Package can be tested with injected paths (if opts added)
# Or verify-canonical passes with allowlist
npm run verify:canonical
# Pass
```

---

## Phase 6: Regression Script (Optional)

**Problem:** No dedicated script ensures governance package invariants (correct exports, no src/ requires, README accuracy).

### G6.1 check-governance-regression.js

| # | Task | File | Change |
|---|------|------|--------|
| G6.1a | Create script | `scripts/check-governance-regression.js` | 1) Require `@agni/governance`; assert `loadPolicy`, `savePolicy`, `validatePolicy`, `loadCatalog`, `saveCatalog`, `updateCatalog`, `importCatalog`, `validateCatalog`, `evaluateLessonCompliance`, `aggregateCohortCoverage`, `MASTERY_THRESHOLD` exist. 2) Grep packages/agni-governance/*.js for `require.*src/`; exit 1 if found. 3) Optional: assert evaluateLessonCompliance(sidecar, policy) returns `{ status, issues }`. |
| G6.1b | Wire | `package.json` | `"verify:governance-regression": "node scripts/check-governance-regression.js"`; add to verify:all or verify:governance |

**Proof of completion:**
```bash
node scripts/check-governance-regression.js
# Exit 0

# Break-it: add require('../../src/foo') to a governance file → exit 1
```

---

## Execution Order

1. **Phase 1** — Switch tests to @agni/governance; add check-governance-canonical.
2. **Phase 2** — Fix README; add check-governance-docs.
3. **Phase 3** — Fix theta.js governanceService.
4. **Phase 4** — Add verify:governance; wire into verify:all.
5. **Phase 5** — (Optional) Path isolation.
6. **Phase 6** — (Optional) check-governance-regression.

---

## Completion Checklist

- [x] G1: Tests use @agni/governance; check-governance-canonical passes
- [x] G2: README accurate; check-governance-docs passes
- [x] G3: Theta has no unused governanceService
- [x] G4: verify:governance in place; governance tests in verify chain
- [x] G5: Path isolation (env-config schema/UTU paths; opts.utuConstants)
- [ ] G6: (Optional) check-governance-regression script
