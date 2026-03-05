# Phase 3 Remediation Plan

Plan to fix all outstanding Phase 3 issues (hub migration + ROADMAP) with regression guards and proof of completion. Follows `docs/.cursor/rules/sprint-verification.md`.

---

## Scope

| Category | Items | Proof Type |
|----------|-------|------------|
| **Hub Migration Phase 3** | Tests and scripts use `@agni/hub`; docs updated; CI scripts point to canonical paths | Regression tests + CI gate |
| **ROADMAP Phase 3** | Remaining Governance & Adaptation tasks (optional + outreach) | Manual / acceptance criteria |
| **SPRINT-R16 Open Bugs** | File locking, sentry buffer, parent auth (deferred: separate plan) | — |

This plan focuses on **Hub Migration Phase 3** and **ROADMAP Phase 3** (governance/adaptation) with automated proof where applicable.

---

## Part A: Hub Migration Phase 3

### A1. Update Tests to Use `@agni/hub`

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| A1.1 | Replace `hub-tools/theta` with `@agni/hub` | `tests/unit/theta-api.test.js` | `require('@agni/hub').theta` | `npm test` includes theta-api; passes |
| A1.2 | Replace `hub-tools/theta.js` | `tests/graph-verification-test.js` | `require('@agni/hub').theta` | `npm run test:graph` passes |
| A1.3 | Replace `hub-tools/context/auth`, `hub-tools/context/services`, `hub-tools/theta`, `hub-tools/sentry.js`, `hub-tools/routes/*` | `tests/unit/regressions.test.js` | Use `@agni/hub` and `packages/agni-hub/` paths | `npm test` passes; regressions.test.js runs |

**Regression guard:** Existing `test:unit`, `test:contract`, `test:graph` in CI. No new test needed — change is path-only; tests prove wiring.

**Proof of completion:**
```bash
npm test && npm run test:contract && npm run test:graph
# All pass
```

---

### A2. Update Verification Scripts to Use Canonical Paths

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| A2.1 | Point route auth check to canonical routes | `scripts/check-unauthed-routes.js` | `ROUTES_DIR = packages/agni-hub/routes` | `npm run verify:unauthed-routes` passes |
| A2.2 | Point API contract auth to canonical routes | `scripts/check-api-contract-auth.js` | Update `ROUTES_DIR` to `packages/agni-hub/routes` | `npm run verify:api-contract-auth` passes |

**Regression guard:** CI already runs these scripts. Updating paths ensures they check the code that actually runs.

**Proof of completion:**
```bash
npm run verify:unauthed-routes
npm run verify:api-contract-auth
# Both pass
```

---

### A3. Update Lint/Format Scripts and CI Paths

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| A3.1 | Include `packages/agni-hub/` in lint scope | `package.json` | Add `packages/agni-hub/` to lint, format, format:check | `npm run lint` and `npm run format:check` pass |
| A3.2 | Include `packages/agni-hub/` in CI format check | `.github/workflows/validate.yml` | Add `packages/**/*.js` or `packages/agni-hub/**/*.js` to prettier paths | CI format step passes |
| A3.3 | Add `packages/**` to CI trigger paths | `.github/workflows/validate.yml` | Add `packages/**` to `paths` so package changes trigger CI | Push to packages/ triggers validate job |

**Regression guard:** CI runs lint and format. Changes ensure hub package is included.

**Proof of completion:** CI green on a commit that touches `packages/agni-hub/`.

---

### A4. Update Documentation

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| A4.1 | Hub playbook | `docs/playbooks/hub.md` | Replace `hub-tools/` with `packages/agni-hub/` and `@agni/hub` | Manual review |
| A4.2 | Sentry playbook | `docs/playbooks/sentry.md` | Update paths to `packages/agni-hub/` | Manual review |
| A4.3 | Federation playbook | `docs/playbooks/federation.md` | Update sync/theta paths; note `node hub-tools/sync.js` still valid (wrapper) | Manual review |
| A4.4 | Deployment | `docs/DEPLOYMENT.md` | Document `node hub-tools/theta.js` (wrapper) or `node packages/agni-hub/theta.js` as canonical | Manual review |
| A4.5 | Developers guide | `docs/guides/DEVELOPERS.md` | Update hub-tools references; state `@agni/hub` is canonical | Manual review |
| A4.6 | Field tech guide | `docs/guides/FIELD-TECH.md` | Same | Manual review |
| A4.7 | Onboarding concepts | `docs/ONBOARDING-CONCEPTS.md` | "Implemented in packages/agni-hub/theta.js (@agni/hub)" | Manual review |
| A4.8 | API contract | `docs/api-contract.md` | "Served by @agni/hub (packages/agni-hub/theta.js)" | Manual review |
| A4.9 | Root README | `README.md` | `node hub-tools/theta.js` or add note: canonical is packages/agni-hub | Manual review |
| A4.10 | Portal README | `portal/README.md` | Same | Manual review |
| A4.11 | Package README | `packages/agni-hub/README.md` | Update hub-tools references to packages/agni-hub | Manual review |
| A4.12 | Compiler playbook | `docs/playbooks/compiler.md` | Update theta path reference | Manual review |
| A4.13 | Codebase index | `CODEBASE_INDEX.md` | "Canonical logic in packages/agni-hub" | Manual review |

**Regression guard:** Add `scripts/check-hub-docs.js` (optional) to grep for outdated `hub-tools/context/` or `hub-tools/routes/` in docs. See A6.

**Proof of completion:** Grep docs for `hub-tools/context` and `hub-tools/routes` — expect 0 matches (or only historical references in archive).

---

### A5. Add CI Gate: No hub-tools-Only Imports in Tests

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| A5.1 | Add `verify:hub-imports` script | `scripts/check-hub-imports.js` (new) | Fail if tests/ require `hub-tools/context` or `hub-tools/routes` | `npm run verify:hub-imports` passes |
| A5.2 | Wire into CI | `package.json`, `.github/workflows/validate.yml` | Add `verify:hub-imports` to verify:all and CI | CI runs gate |

**Gate logic (see Appendix):**
- **Fail:** `require('...hub-tools/context` or `require("...hub-tools/context` — context moved to packages/agni-hub
- **Fail:** `require('...hub-tools/routes` — routes live in packages/agni-hub/routes
- **Warn/Fail:** Tests using `hub-tools/theta` — prefer `@agni/hub`; hub-tools/theta.js is a thin wrapper

**Allow:** Scripts or docs referencing `node hub-tools/theta.js` (CLI entry point). Script only checks `tests/**/*.js`.

**Proof of completion:** `npm run verify:hub-imports` exits 0 after A1 changes.

---

### A6. Optional: Docs Consistency Gate

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| A6.1 | Add `verify:hub-docs` | `scripts/check-hub-docs.js` (new) | Warn or fail if docs reference `hub-tools/context` or `hub-tools/routes` (deleted paths) | `npm run verify:hub-docs` passes |

**Proof of completion:** Script passes after A4 doc updates.

---

## Part B: ROADMAP Phase 3 (Governance & Adaptation)

From `docs/ROADMAP.md` Days 51–75. Items with [ ] remaining:

### B1. Day 56–60 (Optional)

| # | Task | Description | Proof |
|---|------|--------------|-------|
| B1.1 | Log aggregator / telemetry ingestion | Optional. Full cohort-specific weight updates. | Out of scope for this plan; defer or create separate epic |

### B2. Day 66–70: Outreach & Pitch

| # | Task | Description | Proof |
|---|------|--------------|-------|
| B2.1 | Integration Guide for Learning Equality (Kolibri) | Create doc in `docs/guides/` or `docs/integrations/` | File exists; linked from README or CONTRIBUTING |
| B2.2 | Demo of OLS in iframe | Build minimal demo page | Manual: demo loads, runs lesson in iframe |

**Regression guard:** None (docs/demo). Acceptance: doc review; demo smoke test.

### B3. Day 71–75: Sensory & Accessibility Review

| # | Task | Description | Proof |
|---|------|--------------|-------|
| B3.1 | Test haptics with neurodivergent volunteers | User testing | Manual; document findings in `docs/accessibility/` |
| B3.2 | Refine Intensity schema settings | Schema/UI changes based on feedback | Schema validates; tests pass |

**Regression guard:** `npm run validate`; existing a11y tests. New tests only if schema changes.

---

## Part C: Implementation Order

```
A1 (tests) → A2 (scripts) → A5 (CI gate) → A3 (lint/format) → A4 (docs) → A6 (optional docs gate)
```

B items are independent; can run in parallel with A or after.

---

## Part D: Checklist Summary

### Must Complete (Hub Migration)

- [x] A1.1–A1.3: Tests use `@agni/hub`
- [x] A2.1–A2.2: Verification scripts use `packages/agni-hub/routes`
- [x] A3.1–A3.3: Lint/format/CI include packages
- [x] A5.1–A5.2: Add and wire `verify:hub-imports`

### Should Complete (Docs)

- [x] A4.1–A4.13: Update all hub-tools references in docs

### Optional

- [x] A6.1: `verify:hub-docs` script
- [x] B2.1–B2.2, B3.1–B3.2: ROADMAP Phase 3 outreach and a11y

---

## Part E: Final Verification

After all A items:

```bash
npm test
npm run test:contract
npm run test:graph
npm run verify:all
npm run verify:hub-imports   # after A5
npm run lint
npm run format:check
```

All must pass. CI must be green on `main`.

---

## Part F: SPRINT-R16 Open Bugs (Separate Plan)

From `docs/archive/SPRINT-R16-OPEN-BUGS.md`. These are known bugs; remediation is a separate sprint:

| ID | Issue | Location | Regression Proof |
|----|-------|----------|------------------|
| C1.1 | Add locking to groups routes | `packages/agni-hub/routes/groups.js` | Concurrent `POST /api/groups` test: 5 requests → 5 distinct groups |
| C1.2 | Add locking to parent routes | `packages/agni-hub/routes/parent.js` | Same pattern; regression test |
| C1.3 | Lock checkpoint save | `packages/agni-hub/routes/student.js` | `withLock` wraps load-compare-save; test concurrent checkpoints |
| C2.1 | Bound sentry event buffer | `packages/agni-hub/sentry.js` | Unit test: buffer cap; reject beyond limit |
| C2.2 | Fix sentry UTF-8 body parsing | `packages/agni-hub/sentry.js` | Test: emoji/CJK in `lessonId` round-trips |
| C3.2 | Sentry data retention | `packages/agni-hub/sentry.js` | `pruneOldEvents(90)`; test or CI gate |
| C3.4 | Parent auth (short-term: rate limit) | `packages/agni-hub/routes/parent.js` | Rate limit on parent GET endpoints; test 6th req → 429 |

Create `docs/SPRINT-R16-REMEDIATION.md` when addressing these.

---

## Appendix: `check-hub-imports.js` Specification

```js
// scripts/check-hub-imports.js
// Fails if tests/ require hub-tools/context or hub-tools/routes (deleted paths).
// Exit 0 pass, 1 fail.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');

const BAD_PATTERNS = [
  /require\s*\(\s*['"].*hub-tools\/context/,
  /require\s*\(\s*['"].*hub-tools\/routes/
];

// Optional: warn on hub-tools/theta in tests (prefer @agni/hub)
const WARN_PATTERN = /require\s*\(\s*['"].*hub-tools\/theta/;

function walkDir(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walkDir(full, out);
    else if (e.name.endsWith('.js')) out.push(full);
  }
}

const files = [];
walkDir(TESTS_DIR, files);
const violations = [];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  for (const pat of BAD_PATTERNS) {
    if (pat.test(content)) violations.push({ file: path.relative(ROOT, f), pattern: pat.toString() });
  }
}
if (violations.length > 0) {
  console.error('Tests must not require hub-tools/context or hub-tools/routes. Use @agni/hub.\n');
  violations.forEach(v => console.error('  ', v.file));
  process.exit(1);
}
console.log('check-hub-imports: OK');
process.exit(0);
```

---

## References

- `docs/.cursor/rules/sprint-verification.md` — Regression test and CI gate rules
- `docs/ROADMAP.md` — Phase 3 governance tasks
- `docs/AGENTS.md` — Canonical package layout
- `docs/api-contract.md` — API contract
