# Packages Improvement Plan

Plan to address gaps across @agni/services, @agni/hub, and unverified packages. Follows `docs/SERVICES-IMPROVEMENT-PLAN.md` and `.cursor/rules/sprint-verification.md`.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | Extract generate-lesson to @agni/lesson-gen | check-hub-no-scripts | Script exit 0, wiring smoke |
| **Phase 2** | Add remaining packages to verify-canonical | verify-canonical | All packages checked; exit 0 |
| **Phase 3** | @agni/services: types, config, style | typecheck, unit test, lint | Per sub-phase |
| **Phase 4** | Stale docs cleanup | verify:hub-docs, check-docs script | Script pass; grep confirms |

---

## Regression Guards (Summary)

| Guard | Script / Test | Purpose |
|-------|---------------|---------|
| No scripts/ in @agni/hub | `scripts/check-hub-no-scripts.js` (new) | Fail if hub requires scripts/ |
| All packages canonical | `scripts/verify-canonical-ownership.js` (extended) | Fail if any package requires src/ |
| Types valid | `npm run typecheck` | TS consumers can import @agni/services |
| Config injection | Unit test with temp dataDir | Break-it: remove opts → test fails |
| Style | `npm run lint` | Lint covers packages/agni-services |
| Docs canonical | `scripts/check-packages-docs.js` (new, optional) | Fail if AGENTS.md/READMEs reference old paths |

---

## Phase 1: Extract generate-lesson (High Priority)

**Problem:** Hub routes/author.js requires `scripts/generate-lesson.js`. The hub (a package) depends on repo-root scripts, which breaks package isolation.

### P1.1 Create @agni/lesson-gen

| # | Task | Change |
|---|------|--------|
| P1.1a | Create packages/agni-lesson-gen/ | Extract `generateLesson` and dependencies from scripts/generate-lesson.js. Dependencies: docs/prompts, src/utils/lesson-validator (or move validator to @ols/schema). |
| P1.1b | package.json | `{ "name": "@agni/lesson-gen", "dependencies": { "@ols/schema", "js-yaml", ... } }` |
| P1.1c | scripts/generate-lesson.js | Becomes thin CLI that requires @agni/lesson-gen and calls generateLesson |

### P1.2 Update hub and services

| # | Task | Change |
|---|------|--------|
| P1.2a | @agni/services/author | If caller omits generateLesson, require('@agni/lesson-gen').generateLesson; else keep inject-only (hub passes it) |
| P1.2b | @agni/hub/routes/author | `require('@agni/lesson-gen').generateLesson` instead of scripts/ path |

### P1.3 CI gate: hub must not require scripts/

| # | Task | File | Change |
|---|------|------|--------|
| P1.3 | Create check-hub-no-scripts | `scripts/check-hub-no-scripts.js` | Scan packages/agni-hub/*.js for `require(` + path containing `scripts/`. Exit 1 if any match. Same pattern as check-services-no-scripts. |
| P1.3b | Wire into verify:all | `package.json` | Add `verify:hub-no-scripts`; append to verify:all |

**Regression guard:** CI gate fails if hub reintroduces `require('...scripts/...')`.

**Proof of completion:**
```bash
# Must return exit 0
node scripts/check-hub-no-scripts.js

# Must return empty (no require of scripts)
grep -rE "require\s*\(\s*[^)]*scripts[/\\]" packages/agni-hub/
```

### P1.4 Break-it check

Before marking P1 complete: temporarily add `require('../../scripts/generate-lesson')` to a hub file. Run `node scripts/check-hub-no-scripts.js` — must exit 1. Revert; script must exit 0.

### P1.5 Wiring proof

| # | Task | Change |
|---|------|--------|
| P1.5 | Integration smoke | Ensure `POST /api/author/generate` is covered in wiring-smoke or theta-api tests. If not, add assertion that route returns 400 when generateLesson fails or 200 when successful (with mock). |

---

## Phase 2: Extend verify-canonical to all packages (Medium Priority)

**Problem:** @agni/runtime, @agni/engine, @agni/governance, @ols/schema, @agni/plugins are not in PACKAGES_TO_CHECK. A src/ require added there would not be caught.

### P2.1 Add packages to verify-canonical-ownership

| # | Task | File | Change |
|---|------|------|--------|
| P2.1 | Extend PACKAGES_TO_CHECK | scripts/verify-canonical-ownership.js | Add: `{ name: '@agni/runtime', dir: 'packages/agni-runtime' }`, agni-engine, agni-governance, ols-schema, agni-plugins |

### P2.2 Fix any existing src/ imports

| # | Task | Action |
|---|------|--------|
| P2.2 | Audit new packages | Run verify:canonical after P2.1; fix any violations (replace src/ with package deps). Most packages already use @agni/utils; may need allowlist for runtime (loads prompts/assets from repo root) — document in script if so. |

**Regression guard:** verify-canonical now covers all packages; any new src/ require in any package will fail CI.

**Proof of completion:**
```bash
npm run verify:canonical
# Exit 0; all packages in PACKAGES_TO_CHECK
```

### P2.3 Break-it check

Before marking P2 complete: add a throwaway `require('../../src/utils/logger')` to packages/agni-engine/index.js. Run `npm run verify:canonical` — must exit 1. Revert; must exit 0.

---

## Phase 3: @agni/services Phase 4–6 (Low Priority)

Per `docs/SERVICES-IMPROVEMENT-PLAN.md`:

### P3.1 Type definitions (S4)

| # | Task | Change |
|---|------|--------|
| P3.1a | Add index.d.ts | Create packages/agni-services/index.d.ts with module declaration and exported function signatures |
| P3.1b | Verify typecheck | Ensure portal/other TS code imports @agni/services without errors |

**Regression guard:** `npm run typecheck` must pass. Add `verify:typecheck` to verify:all if not already present.

**Proof of completion:**
```bash
npm run typecheck
# Exit 0; no errors for @agni/services
```

### P3.2 Config injection (S5)

| # | Task | Change |
|---|------|--------|
| P3.2a | Optional opts | accounts, lesson-chain: accept `{ dataDir }` or factory `createAccounts(config)` |
| P3.2b | Unit test | Test that creates service with temp dataDir, performs op, asserts outcome |

**Regression guard:** Unit test that uses alternate dataDir; break-it: remove opts support → test fails (wrong dir or missing files).

**Proof of completion:**
```bash
npm run test:unit
# Test passes; accounts/lesson-chain accept config override
```

### P3.3 Style consistency (S6)

| # | Task | Change |
|---|------|--------|
| P3.3 | ES6+ in server modules | accounts.js: arrow fns, const/let, Array.includes; ensure lint pass |

**Regression guard:** `npm run lint` must pass. ESLint config should include packages/agni-services.

**Proof of completion:**
```bash
npm run lint
# Exit 0; no lint errors in packages/agni-services
```

---

## Phase 4: Documentation cleanup (Low Priority)

**Problem:** AGENTS.md and READMEs reference outdated paths (server/hub-transform.js, hub-tools/theta.js, src/services/lms.js).

### P4.1 Update AGENTS.md

| # | Task | Change |
|---|------|--------|
| P4.1 | Hub server location | "Hub server" row: `server/hub-transform.js` → `packages/agni-hub/` |
| P4.1b | Theta location | `hub-tools/theta.js` → `packages/agni-hub/theta.js` |

### P4.2 Update package READMEs

| # | Task | Change |
|---|------|--------|
| P4.2a | @agni/engine README | "src/services/lms.js" → "@agni/services/lms" |
| P4.2b | Others | Scan for src/ paths; update to package paths |

### P4.3 Documentation regression guard (optional)

| # | Task | Change |
|---|------|--------|
| P4.3 | Add check-packages-docs | Script that greps AGENTS.md for `packages/agni-hub` (not server/hub-transform), and READMEs for absence of stale `src/services/` references. Exit 1 if violations. |

**Proof of completion:**
```bash
grep "packages/agni-hub" docs/AGENTS.md
grep -L "src/services/lms" packages/agni-engine/README.md  # or similar check
# verify:hub-docs if extended
```

---

## Execution Order

1. **Phase 1** — Extract @agni/lesson-gen; add check-hub-no-scripts gate. Add gate before or with fix so gate passes only after completion.
2. **Phase 2** — Extend verify-canonical; run break-it check before marking complete.
3. **Phase 3** — Services polish (types, config, style) as time permits.
4. **Phase 4** — Doc cleanup; add doc check if desired.

---

## Completion Checklist

- [x] P1: @agni/lesson-gen created; hub uses it; check-hub-no-scripts gate
  - Proof: `node scripts/check-hub-no-scripts.js` exit 0
  - CI gate: `verify:hub-no-scripts` in verify:all
  - Break-it: reintroduce scripts/ require → gate fails
- [x] P2: All packages in verify-canonical; no src/ imports
  - Proof: `npm run verify:canonical` exit 0 with expanded list
  - Break-it: add src/ require to engine → verify fails
- [x] P3.1: @agni/services types (index.d.ts, types.d.ts, subpath .d.ts)
  - Proof: typecheck, test:unit, lint pass
- [ ] P4: AGENTS.md and READMEs updated
  - Proof: grep confirms packages/ paths; no stale src/services in READMEs
