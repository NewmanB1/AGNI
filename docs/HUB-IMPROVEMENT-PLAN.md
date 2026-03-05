# @agni/hub Improvement Plan

Plan to address gaps in `packages/agni-hub`: lint, docs, types, CI guards, and consistency with @agni/services. Follows `docs/SERVICES-IMPROVEMENT-PLAN.md`, `docs/PACKAGES-IMPROVEMENT-PLAN.md`, and `.cursor/rules/sprint-verification.md`.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | Lint and ESLint config | verify:hub-lint | `npm run verify:hub-lint` exit 0 |
| **Phase 2** | Documentation cleanup | verify:hub-docs in verify:all | Grep confirms canonical paths |
| **Phase 3** | Type definitions | typecheck | `npm run typecheck` pass for hub imports |
| **Phase 4** | CI and test-target guards | verify:all | check-hub-test-targets, verify:hub-docs |
| **Phase 5** | Stale comments and README | verify:hub-docs | No hub-tools/server paths in hub files |

---

## Regression Guards (Summary)

| Guard | Script / Test | Purpose |
|-------|---------------|---------|
| Hub lint clean | `verify:hub-lint` (eslint packages/agni-hub/) | Fail if hub introduces lint errors |
| Hub docs canonical | `scripts/check-hub-docs.js` | Fail if docs reference hub-tools/context, hub-tools/routes |
| Hub test targets | `scripts/check-hub-test-targets.js` (new) | Fail if hub tests require hub-tools/ or server/ instead of packages/agni-hub |
| Types valid | `npm run typecheck` | TS consumers can import @agni/hub (when types added) |
| verify:all | Full chain | All hub gates must pass |

---

## Phase 1: Lint and ESLint Config (High Priority)

**Problem:** Hub has `var`, unused vars, useless escapes, and empty blocks. `pwa/` is browser/ES5; Node code should use ES6+.

### H1.1 ESLint override for browser files

| # | Task | File | Change |
|---|------|------|--------|
| H1.1a | Add pwa override | `eslint.config.js` | `{ files: ['packages/agni-hub/pwa/**', 'packages/agni-hub/sw.js'], rules: { 'no-var': 'off', 'prefer-const': 'off' }, languageOptions: { globals: { ...globals.browser } } }` |
| H1.1b | Add sw.js if needed | Same | Include `packages/agni-hub/sw.js` if it is browser/ES5 |

**Regression guard:** Lint passes on hub; browser files keep ES5 compliance.

### H1.2 Fix Node-side lint (hub-transform, routes)

| # | Task | File | Change |
|---|------|------|--------|
| H1.2a | var → let/const | `hub-transform.js`, `routes/parent.js` | Replace all `var` with `let` or `const` |
| H1.2b | Fix prefer-const | `sentry.js` | `startIdx` → const |
| H1.2c | Fix no-useless-escape | `hub-transform.js`, `sentry-analysis.js` | Remove unnecessary escapes |
| H1.2d | Fix no-empty | `sync.js`, `theta.js` | Add `// empty` or `void 0` in empty catch blocks |
| H1.2e | Fix no-unused-vars | Routes | Prefix with `_` or remove |

### H1.3 Add verify:hub-lint

| # | Task | File | Change |
|---|------|------|--------|
| H1.3a | Add script | `package.json` | `"verify:hub-lint": "eslint packages/agni-hub/"` |
| H1.3b | Wire into verify:all | `package.json` | Append `&& npm run verify:hub-lint` to verify:all (or inline `eslint packages/agni-hub/`) |

**Regression guard:** Any new lint error in hub fails CI.

**Proof of completion:**
```bash
npm run verify:hub-lint
# Exit 0; no errors, no warnings

# Break-it: add a stray `var x = 1;` to hub-transform.js → verify:hub-lint exits 1
```

---

## Phase 2: Documentation Cleanup (High Priority)

**Problem:** AGENTS.md references `server/hub-transform.js` and `hub-tools/theta.js`; canonical paths are `packages/agni-hub/`.

### H2.1 Update AGENTS.md

| # | Task | File | Change |
|---|------|------|--------|
| H2.1a | Hub server row | `AGENTS.md` | "Hub server (on-demand PWA)" → `packages/agni-hub/` |
| H2.1b | Theta row | `AGENTS.md` | "Theta (lesson ordering)" → `packages/agni-hub/theta.js` |

### H2.2 Wire verify:hub-docs into verify:all

| # | Task | File | Change |
|---|------|------|--------|
| H2.2 | Add to verify:all | `package.json` | Append `&& npm run verify:hub-docs` |

**Regression guard:** verify:hub-docs fails if docs reference hub-tools/context or hub-tools/routes.

**Proof of completion:**
```bash
npm run verify:hub-docs
# Exit 0

grep -E "packages/agni-hub|theta\.js" AGENTS.md
# Must show packages/agni-hub, not server/hub-transform or hub-tools/theta as primary
```

---

## Phase 3: Type Definitions (Medium Priority)

**Problem:** @agni/hub has no `.d.ts`; TypeScript consumers have no types.

### H3.1 Add index.d.ts

| # | Task | File | Change |
|---|------|------|--------|
| H3.1a | Create index.d.ts | `packages/agni-hub/index.d.ts` | Module declaration for main exports (theta, routes, context) |
| H3.1b | Add types field | `packages/agni-hub/package.json` | `"types": "index.d.ts"` |

**Regression guard:** `npm run typecheck` must pass when TS code imports @agni/hub.

**Proof of completion:**
```bash
npm run typecheck
# Exit 0; no errors for @agni/hub imports
```

---

## Phase 4: CI and Test-Target Guards (Medium Priority)

**Problem:** No check ensures hub tests use `packages/agni-hub` or `@agni/hub`; legacy `hub-tools/` or `server/` imports would not be caught.

### H4.1 Create check-hub-test-targets

| # | Task | File | Change |
|---|------|------|--------|
| H4.1 | Create script | `scripts/check-hub-test-targets.js` | Grep hub-related tests for `require(['\"]\.\.\/\.\.\/hub-tools\/` or `require(['\"]\.\.\/\.\.\/server\/`; exit 1 if match |
| H4.1b | Define scope | Same | Target: tests/unit/theta-api.test.js, hub-auth-regression.test.js, regressions.test.js, tests/integration/wiring-smoke.test.js, etc. |

### H4.2 Wire into verify:all

| # | Task | File | Change |
|---|------|------|--------|
| H4.2a | Add verify:hub-test-targets | `package.json` | `"verify:hub-test-targets": "node scripts/check-hub-test-targets.js"` |
| H4.2b | Append to verify:all | `package.json` | Add verify:hub-test-targets to chain |

**Regression guard:** Reverting tests to hub-tools/ or server/ fails CI.

**Proof of completion:**
```bash
node scripts/check-hub-test-targets.js
# Exit 0

# Break-it: change a hub test to require('../../hub-tools/theta') → script exits 1
```

---

## Phase 5: Stale Comments and README (Low Priority)

**Problem:** Comments in hub files and related scripts reference hub-tools/ or server/; README is slightly inaccurate.

### H5.1 Fix comments

| # | Task | File | Change |
|---|------|------|--------|
| H5.1a | shared.js | `packages/agni-hub/pwa/shared.js` | "hub-tools/context/" → "packages/agni-hub/context/" |
| H5.1b | check-factory-order | `scripts/check-factory-order.js` | Comments: "server/hub-transform.js" → "packages/agni-hub/hub-transform.js" |

### H5.2 Update README

| # | Task | File | Change |
|---|------|------|--------|
| H5.2a | Routes registration | `packages/agni-hub/README.md` | Clarify: routes are auto-loaded from routes/, not manually registered in theta.js |
| H5.2b | Types note | Same | Add note: no TypeScript types yet (or remove when Phase 3 done) |

### H5.3 Extend check-hub-docs (optional)

| # | Task | File | Change |
|---|------|------|--------|
| H5.3 | Grep for stale paths | `scripts/check-hub-docs.js` | Fail if packages/agni-hub/*.js contains "hub-tools/context" or "hub-tools/routes" in comments (or keep manual) |

**Proof of completion:**
```bash
grep -r "hub-tools/context\|server/hub-transform" packages/agni-hub/
# Should return empty or only in docs that explain migration
```

---

## Execution Order

1. **Phase 1** — Lint fixes + verify:hub-lint. Add gate before or with fixes.
2. **Phase 2** — AGENTS.md + verify:hub-docs in verify:all.
3. **Phase 3** — Type definitions (optional; can defer).
4. **Phase 4** — check-hub-test-targets + wire into verify:all.
5. **Phase 5** — Stale comments and README (optional).

---

## Completion Checklist

- [x] H1: Lint clean; verify:hub-lint; pwa/ ESLint override
  - Proof: `npm run verify:hub-lint` exit 0
  - Break-it: add `var x = 1` → fails
- [x] H2: AGENTS.md updated; verify:hub-docs in verify:all
  - Proof: `npm run verify:hub-docs` exit 0; grep shows packages/agni-hub
- [ ] H3: index.d.ts for @agni/hub (optional, cancelled for this pass)
  - Proof: typecheck pass
- [x] H4: check-hub-test-targets + verify:hub-test-targets in verify:all
  - Proof: script exit 0; break-it: require hub-tools → fails
- [x] H5: Stale comments fixed; README clarified (optional)
  - Proof: grep finds no hub-tools/context in hub package
