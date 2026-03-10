# Remaining Improvements Plan

Addresses items from `docs/CONSOLIDATED-ROADMAP.md` with **regression guards** and **proof of completion** per `.cursor/rules/sprint-verification.md`.

**Execution order:** Phase 1 → Phase 2 → Phase 3 (parallel OK within phase).

---

## Phase 1: Foundation & Package Hygiene

### 1.1 Fix generate-lesson.test.js — Use @agni/lesson-gen

**Problem:** `tests/unit/generate-lesson.test.js` requires `../../scripts/generate-lesson`, tying the test to repo-root layout. Package isolation requires tests to use `@agni/lesson-gen`.

| # | Task | File | Change |
|---|------|------|--------|
| 1.1a | Update test import | `tests/unit/generate-lesson.test.js` | `require('@agni/lesson-gen')` instead of `require('../../scripts/generate-lesson')` |
| 1.1b | Create regression guard | `scripts/check-lesson-gen-test-target.js` (new) | Fail if `generate-lesson.test.js` contains `require(` + path to `scripts/generate-lesson`. Exit 1 on match. |
| 1.1c | Wire guard | `package.json` | Add `verify:lesson-gen-test-target`; append to `verify:all` |

**Regression guard:** `check-lesson-gen-test-target.js` — fails if test reverts to scripts path.

**Proof of completion:**
```bash
node scripts/check-lesson-gen-test-target.js   # Exit 0
node --test tests/unit/generate-lesson.test.js # All pass
```

---

### 1.2 RUNTIME Phase 1 — File Headers (src/runtime → packages/agni-runtime)

**Problem:** Runtime files have `// src/runtime/...` in first-line comments. Canonical path is `packages/agni-runtime/`.

| # | Task | File | Change |
|---|------|------|--------|
| 1.2a | Fix headers | `packages/agni-runtime/**/*.js` | Replace `// src/runtime/` with `// packages/agni-runtime/` (match subpath) |
| 1.2b | Verify guard exists | — | `check-runtime-headers.js` and `verify:runtime-headers` already exist; confirm in verify:all |

**Regression guard:** `scripts/check-runtime-headers.js` (existing) — fails if any runtime file has stale `// src/runtime/` header.

**Proof of completion:**
```bash
npm run verify:runtime-headers  # Exit 0
grep -r "^// src/runtime" packages/agni-runtime/  # Empty
```

---

### 1.3 RUNTIME Phase 2 — README Canonical Paths

**Problem:** packages/agni-runtime README may reference `src/runtime`, `src/utils`, or non-canonical paths.

| # | Task | File | Change |
|---|------|------|--------|
| 1.3a | Update README | `packages/agni-runtime/README.md` | Use `packages/agni-runtime/`, `@agni/plugins`, `@agni/utils`; document sensor/factory flow |
| 1.3b | Create regression guard | `scripts/check-runtime-docs.js` (new) | Fail if README contains `src/runtime/` or `src/utils/` as canonical path. Exit 1 on match. |
| 1.3c | Wire guard | `package.json` | Add `verify:runtime-docs`; append to `verify:all` |

**Regression guard:** `check-runtime-docs.js` — fails if README reverts to src paths.

**Proof of completion:**
```bash
node scripts/check-runtime-docs.js  # Exit 0
grep -E "src/runtime|src/utils" packages/agni-runtime/README.md  # Empty (or only in migration context)
```

---

## Phase 2: Services & Package Polish

### 2.1 SERVICES — Test Targets

**Problem:** Ensure service tests use `@agni/services`, not `src/services/`.

| # | Task | Change |
|---|------|--------|
| 2.1a | Verify | `check-services-test-targets.js` exists and is in verify:all |
| 2.1b | Add generate-lesson to scope | Extend script to fail if any test requires `scripts/generate-lesson` (or rely on 1.1b) |

**Regression guard:** `check-services-test-targets.js` (existing). Optional: add `scripts/` pattern for test files.

**Proof:** `npm run verify:services-test-targets` exit 0.

---

### 2.2 SERVICES — Docs Canonical

**Problem:** Docs should reference `@agni/services`, not `src/services`.

| # | Task | Change |
|---|------|--------|
| 2.2a | Extend check-hub-docs | Add AGENTS.md and packages/agni-services/README.md scan; fail on `src/services/` as canonical |
| 2.2b | Or create check-services-docs | New script: fail if docs reference `src/services/` for package API |

**Regression guard:** Extend existing `check-hub-docs.js` or add `check-services-docs.js`.

**Proof:** Script exit 0; grep finds @agni/services in key docs.

---

### 2.3 SERVICES — Lint

**Problem:** packages/agni-services may have lint warnings.

| # | Task | Change |
|---|------|--------|
| 2.3a | Run `eslint packages/agni-services/` | Fix warnings until exit 0 |
| 2.3b | Verify | `verify:services-lint` in verify:all (already wired) |

**Regression guard:** `verify:services-lint` (eslint) — fails on new lint issues.

**Proof:** `npm run verify:services-lint` exit 0.

---

### 2.4 PACKAGES — verify-canonical Coverage

**Problem:** Ensure all packages are in PACKAGES_TO_CHECK.

| # | Task | Change |
|---|------|--------|
| 2.4a | Audit | Review `scripts/verify-canonical-ownership.js` PACKAGES_TO_CHECK |
| 2.4b | Add missing | Add any package under `packages/` that should not require from `src/` |

**Regression guard:** `verify-canonical` (existing) — fails if any checked package requires src/.

**Proof:** `npm run verify:canonical` exit 0.

---

## Phase 3: Optional / Lower Priority (Tier 3 Done)

### 3.1 SERVICES — Types (Optional) — Done

**Regression guard:** `npm run typecheck:services` — passes for packages/agni-services.  
Uses `tsconfig.services.json` (scoped, skipLibCheck). Full `typecheck` still has pre-existing failures in engine/compiler.

---

### 3.2 SERVICES — Config Injection (Optional)

**Regression guard:** Unit test with `{ dataDir: tempDir }` — break-it: remove opts → test fails.

---

### 3.3 RUNTIME — Types, ESLint (Optional) — Done

**Regression guard:** `verify:runtime-lint` (eslint packages/agni-runtime), wired into verify:all. ES5 override in eslint.config.js. index.d.ts already exists.

---

## Summary: New Regression Guards

| Guard | Script | Purpose |
|-------|--------|---------|
| Lesson-gen test target | `scripts/check-lesson-gen-test-target.js` | Fail if generate-lesson.test.js requires scripts/ |
| Runtime headers | `scripts/check-runtime-headers.js` | Existing — fail if runtime files have src/runtime/ header |
| Runtime docs | `scripts/check-runtime-docs.js` | Fail if runtime README has src/runtime or src/utils as canonical |
| Services test targets | `scripts/check-services-test-targets.js` | Existing — fail if tests require src/services/ |
| Services docs | Extend `check-hub-docs` or new `check-services-docs` | Fail if docs reference src/services/ for package API |
| Services lint | `verify:services-lint` | Existing — eslint packages/agni-services |
| Canonical ownership | `verify-canonical` | Existing — packages must not require src/ |

---

## Completion Checklist

- [x] 1.1: generate-lesson.test.js uses @agni/lesson-gen; check-lesson-gen-test-target in verify:all
- [x] 1.2: Runtime file headers canonical; verify:runtime-headers passes
- [x] 1.3: Runtime README canonical; check-runtime-docs in verify:all
- [x] 2.1: check-services-test-targets passes
- [x] 2.2: Services docs check (check-services-docs extended; agni-engine README fixed)
- [x] 2.3: verify:services-lint passes
- [x] 2.4: verify-canonical includes all packages

---

## References

- `docs/CONSOLIDATED-ROADMAP.md`
- `.cursor/rules/sprint-verification.md`
- `docs/archive/SERVICES-IMPROVEMENT-PLAN.md`
- `docs/archive/RUNTIME-IMPROVEMENT-PLAN.md`
