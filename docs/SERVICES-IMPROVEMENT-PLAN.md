# @agni/services Improvement Plan

Plan to address gaps and technical debt in `packages/agni-services` after the initial migration from `src/services/`. Follows the structure of `docs/HUB-CANONICAL-MIGRATION-PLAN.md` and `.cursor/rules/sprint-verification.md`.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | Decouple from `scripts/generate-lesson` | CI gate + regression test | Script exit 0, test pass |
| **Phase 2** | Tests and CI | Test targets + verify:all | test:unit, test:integration, verify:all pass |
| **Phase 3** | Documentation | verify:hub-docs + grep check | Script pass; grep finds @agni/services in docs |
| **Phase 4** | Type definitions | typecheck | npm run typecheck pass |
| **Phase 5** | Config injection (optional) | Unit test | Test passes with alternate config |
| **Phase 6** | Style and polish | Lint | npm run lint pass |

**Dependencies:** Phase 1 is highest priority. Phases 2–3 can run in parallel. Phase 4–6 are lower priority.

---

## Regression Guards (Summary)

| Guard | Script / Test | Purpose |
|-------|---------------|---------|
| No scripts/ in @agni/services | `scripts/check-services-no-scripts.js` (new) | Fail if any `require` to `scripts/` in packages/agni-services |
| Services tests use @agni/services | `scripts/check-services-test-targets.js` (new) | Fail if unit tests require `src/services/` instead of `@agni/services` |
| Hub docs reference canonical services | `scripts/check-hub-docs.js` (extended) | Ensure hub playbook mentions @agni/services |
| Full suite | `verify:all`, `test:unit`, `test:integration` | Existing gates; must pass after each phase |

---

## Phase 1: Decouple from scripts/generate-lesson (High Priority)

**Problem:** `author.js` dynamically requires `scripts/generate-lesson.js`, tying the package to the monorepo root layout.

### S1.1 Extract or inject `generateLesson`

| # | Task | Change | Proof |
|---|------|--------|-------|
| S1.1a | Extract `generate-lesson` into a package | Create `packages/agni-lesson-gen/` (or add to `@agni/utils`/`@agni/hub`) with `generateLesson`. Add as dependency of `@agni/services`. | `generateForAuthor` works; no `require('../../scripts/...')` |
| S1.1b | Or: inject `generateLesson` as an option | Add optional `{ generateLesson }` to author service init or to `generateForAuthor` opts. Hub passes `require('scripts/generate-lesson').generateLesson` or similar. | Same behavior; package has no scripts/ dependency |

**Recommended:** S1.1a — extract to `@agni/lesson-gen` or `tools/lesson-gen` as a workspace package. Keeps services pure; scripts remain CLI-only.

### S1.2 Update author service

| # | Task | File | Change |
|---|------|------|--------|
| S1.2 | Use package or injected generator | `packages/agni-services/author.js` | Replace `require(scriptPath).generateLesson` with `require('@agni/lesson-gen').generateLesson` (or injected fn) |

### S1.3 Add CI gate: no scripts/ in @agni/services

| # | Task | File | Change |
|---|------|------|--------|
| S1.3 | Create check-services-no-scripts | `scripts/check-services-no-scripts.js` | Scan `packages/agni-services/*.js` for `require(` + path containing `scripts/`. Exit 1 if any match. |
| S1.3b | Wire into verify:all | `package.json` | Add `verify:services-no-scripts`; append to `verify:all` script |

**Regression guard:** CI gate fails if any `require('...scripts/...')` is reintroduced in @agni/services.

**Proof of completion:**
```bash
# Must return exit 0
node scripts/check-services-no-scripts.js

# Must return empty (no matches)
grep -rE "require\([^)]*scripts/" packages/agni-services/
```

### S1.4 Regression test: generateForAuthor

| # | Task | File | Change |
|---|------|------|--------|
| S1.4 | Add regression test | `tests/unit/author.test.js` or `tests/unit/regressions.test.js` | Test `generateForAuthor` when `AGNI_LLM_API_KEY` is set: calls generator, returns `{ ok, lesson }` or `{ error }`. Or mock: test that author service loads without requiring scripts/ (break-it: revert S1.2 → test fails). |

**Wiring:** `author.generateForAuthor` is invoked by hub route `POST /api/author/generate`. Wiring smoke: existing integration tests that hit author routes; add `POST /api/author/generate` to wiring-smoke if not covered.

---

## Phase 2: Tests and CI (Medium Priority)

**Problem:** Tests still target `src/services/*`; no direct tests for `@agni/services`.

### S2.1 Point unit tests at @agni/services

| # | Task | Files | Change |
|---|------|-------|--------|
| S2.1a | accounts.test.js | `tests/unit/accounts.test.js` | `require('@agni/services/accounts')` instead of `require('../../src/services/accounts')` |
| S2.1b | author.test.js | `tests/unit/author.test.js` | Same |
| S2.1c | lessonSchema.test.js | `tests/unit/lessonSchema.test.js` | `require('@agni/services/lesson-schema')` or `@ols/schema/lesson-schema` |
| S2.1d | compiler-service.test.js | `tests/unit/compiler-service.test.js` | `require('@agni/services/compiler')` or `@ols/compiler/services/compiler` |
| S2.1e | regressions.test.js, extended-coverage.test.js, theta-api.test.js | Various | Update `require.resolve` and `require` paths for cache purging to use `@agni/services/*` where appropriate |

### S2.2 Add CI gate: services test targets

| # | Task | File | Change |
|---|------|------|--------|
| S2.2 | Create check-services-test-targets | `scripts/check-services-test-targets.js` | Grep `tests/unit/accounts.test.js`, `author.test.js`, `lessonSchema.test.js`, `compiler-service.test.js` for `require\(['\"]\.\.\/\.\.\/src\/services\/`; exit 1 if any match. |
| S2.2b | Wire into verify:all | `package.json` | Add `verify:services-test-targets`; append to `verify:all` |

**Regression guard:** CI gate fails if unit tests are reverted to `src/services/`.

**Proof of completion:**
```bash
# Must return exit 0
node scripts/check-services-test-targets.js

npm run test:unit
npm run test:integration
npm run verify:all
# All pass
```

### S2.3 Break-it check

Before marking S2 complete: temporarily change `accounts.test.js` back to `require('../../src/services/accounts')`. Run `node scripts/check-services-test-targets.js` — must exit 1. Revert; script must exit 0.

---

## Phase 3: Documentation (Medium Priority)

**Problem:** Playbooks and migration plan still reference `src/services/` as the canonical layer.

### S3.1 Update hub playbook

| # | Task | File | Change |
|---|------|------|--------|
| S3.1 | Clarify services layer | `docs/playbooks/hub.md` | Change "Business logic: `src/services/` … or `@agni/*`" to "Business logic: `@agni/services` (canonical). `src/services/` are shims." |

### S3.2 Update HUB-CANONICAL-MIGRATION-PLAN

| # | Task | File | Change |
|---|------|------|--------|
| S3.2 | Mark services migration complete | `docs/HUB-CANONICAL-MIGRATION-PLAN.md` | Add completion note: "Phase 3 (services): @agni/services created. src/services/ are shims." |

### S3.3 Update CONVENTIONS

| # | Task | File | Change |
|---|------|------|--------|
| S3.3 | Reference @agni/services | `docs/CONVENTIONS.md` | Update "services layer" references to mention `@agni/services` as canonical |

### S3.4 Documentation regression guard

| # | Task | Change |
|---|------|--------|
| S3.4 | Extend verify:hub-docs or add grep check | Ensure `docs/playbooks/hub.md` contains string `@agni/services`. Option: add to `scripts/check-hub-docs.js` or a small `scripts/check-services-docs.js` that greps for `@agni/services` in hub.md and CONVENTIONS.md. |

**Proof of completion:**
```bash
npm run verify:hub-docs
# If new check added:
node scripts/check-services-docs.js   # exit 0

grep -l "@agni/services" docs/playbooks/hub.md docs/CONVENTIONS.md
# Both files listed
```

---

## Phase 4: Type Definitions (Low Priority)

**Problem:** No `.d.ts` for `@agni/services`; TypeScript consumers (e.g. portal) have no types.

### S4.1 Add types

| # | Task | Change |
|---|------|--------|
| S4.1a | Add index.d.ts | Create `packages/agni-services/index.d.ts` with module declaration and exported function signatures |
| S4.1b | Or generate from JSDoc | Add `// @ts-check` and JSDoc; run `tsc --declaration` to emit `.d.ts` |

### S4.2 Regression guard

| # | Task | Change |
|---|------|--------|
| S4.2 | typecheck includes @agni/services | Ensure `npm run typecheck` (or `tsc -p tsconfig.json`) compiles without error when portal or other TS code imports `@agni/services`. |

**Proof of completion:**
```bash
npm run typecheck
# Exit 0; no errors for @agni/services imports
```

---

## Phase 5: Config Injection (Low Priority, Optional)

**Problem:** Services read `envConfig` at load time; harder to test with alternate configs.

### S5.1 Optional config override

| # | Task | Change |
|---|------|--------|
| S5.1 | Add optional opts to service init or per-call | e.g. `accounts(opts?: { dataDir })` or a `createAccounts(config)` factory. Default to `envConfig` if not provided. |

**Scope:** Start with accounts/lesson-chain (DATA_DIR) if needed for tests; defer governance/author if no immediate need.

**Regression guard:** Unit test that creates accounts service with a temp `dataDir`, performs an operation, asserts outcome. Break-it: remove opts → test fails (wrong data dir).

---

## Phase 6: Style and Polish (Low Priority)

**Problem:** `accounts.js` uses ES5 style; other modules use ES6+.

### S6.1 Standardize style

| # | Task | Change |
|---|------|--------|
| S6.1 | Use ES6+ in server-side modules | Replace `function` with arrow functions where appropriate, use `const`/`let`, `includes` instead of `indexOf`, etc. |

**Note:** AGENTS.md ES5 rule applies to `packages/agni-runtime` only; server-side packages may use modern syntax.

**Regression guard:** `npm run lint` must pass. ESLint config should cover `packages/agni-services/`.

---

## Completion Checklist

- [x] S1: No `scripts/` dependency in @agni/services
  - Proof: `node scripts/check-services-no-scripts.js` exit 0
  - CI gate: `verify:services-no-scripts` in verify:all
- [x] S2: Unit tests require @agni/services; verify:all passes
  - Proof: `node scripts/check-services-test-targets.js` exit 0; test:unit, test:integration pass
  - CI gate: `verify:services-test-targets` in verify:all
- [x] S3: hub.md, HUB-CANONICAL-MIGRATION-PLAN, CONVENTIONS updated
  - Proof: `verify:services-docs` pass; hub.md and CONVENTIONS reference @agni/services
- [x] S4: Type definitions added (index.d.ts, types.d.ts, subpath .d.ts)
  - Proof: npm run typecheck pass
- [x] S5: Config injection (optional)
  - Proof: tests/unit/config-injection.test.js; createAccounts/createLessonChain with { dataDir }
- [x] S6: Style consistency (optional)
  - Proof: verify:services-lint; packages/agni-services in lint target; ES6+ (includes, startsWith, arrows)

---

## Execution Order

1. **Phase 1** — Remove scripts dependency (highest impact). Add CI gate S1.3 before or with S1.2 so gate passes only after fix.
2. **Phase 2** — Update tests and add gate S2.2. Run break-it check before marking complete.
3. **Phase 3** — Update docs; add doc check if desired.
4. **Phases 4–6** — As time permits.
