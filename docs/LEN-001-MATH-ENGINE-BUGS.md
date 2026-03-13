# LEN-001: Math Engine Bug Remediation

**Status:** Draft  
**Created:** 2025-03-07  
**Component:** `packages/agni-engine/math.js`  
**Reference:** `docs/playbooks/math-remediation-plan.md` (consolidated bug list)

---

## Summary

Address 18 identified bugs, logic errors, edge cases, and unsafe assumptions in the AGNI math module. The module is used by Thompson sampling, embeddings, federation, and bandit selection — failures propagate to lesson selection and HTTP handlers, with particular impact on Pi deployments (60+ students, hot-path sensitivity).

---

## Scope

| Scope | Detail |
|-------|--------|
| **Canonical source** | `packages/agni-engine/math.js` (per AGENTS.md) |
| **Callers** | thompson.js, embeddings.js, federation.js, index.js |
| **Target** | Node.js 14+, CommonJS, ES5-compatible browser runtime |

---

## Priority Tiers

### P0 — Critical (fix first)

| ID | Bug | Fix | Regression |
|----|-----|-----|------------|
| 1 | randn() throws on PRNG failure → unhandled crash in selectBestLesson | Log fatal, return 0; do NOT throw | Done — randn returns 0 when Math.random mocks 0 |
| 3 | cholesky `\|\| 0` masks NaN; misleading "not SPD" error | Explicit non-finite check; throw non-numeric (diag/entry) | Done — cholesky throws "non-numeric" for NaN/Inf |
| 13 | Symmetry tolerance 1e-12 too tight post-federation JSON round-trip | Re-symmetrize merged precision at merge boundary, or relax to 1e-8 | federation merge → selectBestLesson does not throw |

### P1 — High (correctness)

| ID | Bug | Fix | Regression |
|----|-----|-----|------------|
| 9 | forwardSub/backSub don't validate L | Add L null/square check; [MATH] prefix on error | Done — Array.isArray(L), non-empty; forwardSub(null,b) throws [MATH] |
| 14 | addVec/addMat `+` concatenates strings | Coerce to number or throw on non-numeric | Done — Number() coercion; addVec(["1"],[2]) returns [3] |
| 15 | dot/addVec/scaleVec NaN for sparse; inconsistent with outer/scaleMat | Sparse checks or document; prefer debug-only for hot path | Done — all fail fast; JSDoc + DESIGN NOTES document contract |

### P2 — Medium (performance, robustness)

| ID | Bug | Fix | Regression |
|----|-----|-----|------------|
| 2 | randn discards sin sample; 2× PRNG/transcendentals per sample | Document (Option A) or makeRandnStream (Option B) | Documented or stream test |
| 4 | Symmetry check O(n²) on every invertSPD | Move to load/migrations; or AGNI_MATH_STRICT gate | — |
| 12 | scaleMat O(n²) sparse check in updateBandit hot path | Move to load/migrations | — |
| 16 | scaleVec/matVec no array type check | Array.isArray guard; [MATH] error | Done — already present |

### P3 — Low (micro-opt, maintainability)

| ID | Bug | Fix |
|----|-----|-----|
| 5 | Cholesky square check separate pass | Merge into factorization loop |
| 6 | outer() reuses loop var i | `for (var j = 0; ...)` or declare at top |
| 7 | addMat row 0 validated twice | Loop start at i = 1 |
| 8 | matVec/addMat validation inconsistency | Document or align |
| 10 | identity(0) / federation zero-dim path | Reject n=0 or handle at merge boundary |
| 17 | invertSPD diagonal not symmetrized | Optional symmetrization |
| 18 | randn can return Infinity for tiny u | JSDoc; optional clamp |

### P4 — No action

| ID | Bug | Note |
|----|-----|------|
| 11 | dot() naive summation FP error | Negligible at n ≤ 256 |

---

## Acceptance Criteria

1. **P0 bugs fixed** — No unhandled throw from randn; cholesky rejects NaN with clear error; federation merge does not crash selectBestLesson.
2. **Regression tests** — Each fix has a test that fails before and passes after (per sprint-verification.md).
3. **All existing tests pass** — `npm run test` including math.test.js, regressions.test.js, engine-*.test.js.
4. **Pi hot path unchanged or improved** — No new O(n²) validation in sampleThetaForScoring, updateBandit, invertSPD.

---

## Dependencies

- **BUG 13** fix may require changes in `packages/agni-engine/index.js` (mergeBanditSummaries) or `packages/agni-engine/federation.js`, not just math.js.
- **BUG 1** fix requires `@agni/utils/logger` for fatal log; math.js is currently dependency-free — consider optional logger injection or console.error as fallback.

---

## References

- Consolidated bug list: `docs/playbooks/math-remediation-plan.md`
- Verification rule: `.cursor/rules/sprint-verification.md`
- Architecture: `docs/ARCHITECTURE.md`
