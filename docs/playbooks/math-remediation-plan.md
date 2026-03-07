# Math Module Remediation Plan

Fix bugs in `packages/agni-engine/math.js` with regression guards and unit tests.

**Reference:** Consolidated bug list from code review (cholesky, randn, forwardSub/backSub, identity, scaleVec/scaleMat, invertSPD, sparse/NaN handling, performance, CHOLESKY_EPSILON/JITTER).

**Canonical source:** `packages/agni-engine/math.js` (per AGENTS.md). Tests use `require('../../src/engine/math')` which re-exports from `@agni/engine/math`.

**Verification rule:** Per `.cursor/rules/sprint-verification.md`, each fix must have a regression test that **fails before** the fix and **passes after**. Run break-it checks before marking complete.

---

## Phase 1 — Critical (Correctness)

### P1.1 — `cholesky()` input validation

| Item | Detail |
|------|--------|
| **Bug** | No null/square/symmetry checks; non-square or non-symmetric input produces wrong results silently |
| **Fix** | Add guards: `A == null` → throw `[MATH] cholesky: matrix is null or undefined`. Validate square: `A[i].length !== n` for any row. Validate symmetry: `Math.abs(A[i][j] - A[j][i]) > 1e-12` for `i !== j` → throw `[MATH] cholesky: matrix is not symmetric` |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-1: cholesky rejects null, non-square, and non-symmetric input` |
| **Unit test** | `tests/unit/math.test.js` → extend cholesky describe block with: `throws for null`, `throws for non-square matrix`, `throws for non-symmetric matrix` |
| **Proof** | Run `node --test tests/unit/math.test.js tests/unit/regressions.test.js` — all pass. Revert fix → regression fails |
| **Completion** | `[x]` — tests pass |

---

### P1.2 — `randn()` purity: remove `_randnCache` or make it closure-local

| Item | Detail |
|------|--------|
| **Bug** | `_randnCache` is module-level state; breaks purity, test isolation, cross-call pairing |
| **Fix** | **Option A (recommended):** Remove caching. Each call generates one Box-Muller pair, returns first sample, discards second. Wastes one sample per call but restores purity. **Option B:** Return `createRandn()` factory that returns a closure-local `randn()` with its own cache. Engine/thompson/embeddings would call `createRandn()` once and use the returned function. Higher refactor cost. |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-2: randn has no module-level state — two fresh requires produce independent sequences` (require math twice in separate vm contexts or reset state; verify no cross-contamination). Alternative: `randn calls produce statistically independent samples regardless of call order` — call randn 100 times, verify mean/variance within tolerance regardless of whether run after another test that called randn odd times |
| **Unit test** | `tests/unit/math.test.js` → add `randn is isolated — running after odd-numbered randn calls does not consume cached value from prior test` (run in `after` or second `it` that calls randn; assert value is fresh, not deterministic from cache) |
| **Proof** | Test passes. Revert fix → test fails (flaky or deterministic failure) |
| **Completion** | `[ ]` → `[x]` |

---

### P1.3 — `randn()` fallback: fix degenerate sample

| Item | Detail |
|------|--------|
| **Bug** | When `lim` exhausted, `u = v = 1e-10` produces invalid pair (6.79, ~0) |
| **Fix** | Use distinct fallback values: `u = 1e-10`, `v = 0.5` so both samples are valid N(0,1). Or: throw `[MATH] randn: PRNG returned zero 1000 times` instead of returning. Prefer throw for fail-fast. |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-3: randn fallback does not produce degenerate u=v sample` — mock `Math.random` to always return 0, call randn, assert either (a) throws, or (b) if returns, value is finite and |value| < 10 (not extreme outlier 6.79 from u=v). With throw fix, assert.throws |
| **Unit test** | `tests/unit/math.test.js` → `randn throws when Math.random returns zero repeatedly` (mock, exhaust lim, expect throw) |
| **Proof** | Test passes. Revert fix → test fails |
| **Completion** | `[ ]` → `[x]` |

---

### P1.4 — `forwardSub()` and `backSub()` RHS length validation

| Item | Detail |
|------|--------|
| **Bug** | `b.length < L.length` → NaN; `b.length > L.length` → silent ignore |
| **Fix** | At start: `if (b == null) throw ...`; `if (b.length !== n) throw new Error('[MATH] forwardSub: dimension mismatch (L is ' + n + 'x' + n + ', b.length=' + b.length + ')')`. Same for backSub |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-4: forwardSub and backSub throw on RHS length mismatch` |
| **Unit test** | `tests/unit/math.test.js` → `forwardSub throws when b.length < L.length`, `forwardSub throws when b.length > L.length`, same for backSub |
| **Proof** | Tests pass. Revert → regression fails |
| **Completion** | `[ ]` → `[x]` |

---

## Phase 2 — Robustness (Validation)

### P2.1 — `identity(n)` validation

| Item | Detail |
|------|--------|
| **Bug** | `n` undefined → `[]`; `n` negative/NaN/non-integer → RangeError without `[MATH]` prefix |
| **Fix** | `if (n == null) throw new Error('[MATH] identity: n is null or undefined')`; `if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new Error('[MATH] identity: n must be non-negative integer, got ' + n)` |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-5: identity rejects invalid n` |
| **Unit test** | `tests/unit/math.test.js` → `throws for null/undefined`, `throws for negative n`, `throws for non-integer n` |
| **Completion** | `[ ]` → `[x]` |

---

### P2.2 — `scaleVec()` and `scaleMat()` scalar validation

| Item | Detail |
|------|--------|
| **Bug** | `s` undefined → NaN output |
| **Fix** | `if (typeof s !== 'number' || !isFinite(s)) throw new Error('[MATH] scaleVec: scalar must be finite number')` (and scaleMat analogue) |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-6: scaleVec and scaleMat reject invalid scalar` |
| **Unit test** | `tests/unit/math.test.js` → extend scaleVec/scaleMat with `throws for undefined scalar`, `throws for NaN scalar` |
| **Completion** | `[ ]` → `[x]` |

---

### P2.3 — `invertSPD()` null check

| Item | Detail |
|------|--------|
| **Bug** | `invertSPD(null)` throws on `A.length` |
| **Fix** | `if (A == null) throw new Error('[MATH] invertSPD: matrix is null or undefined')` |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-7: invertSPD throws for null input` |
| **Unit test** | `tests/unit/math.test.js` → `throws for null or undefined` in invertSPD describe |
| **Completion** | `[ ]` → `[x]` |

---

### P2.4 — Sparse array handling (optional / document)

| Item | Detail |
|------|--------|
| **Bug** | `dot`, `addVec`, `scaleVec` produce NaN for sparse arrays; inconsistent with `outer`/`scaleMat` which throw |
| **Fix** | **Option A:** Add sparse checks to dot, addVec, scaleVec (consistent with outer). **Option B:** Document that inputs must be dense; add optional `--strict` or debug assertion. Given Pi hot-path concern, prefer documenting. If adding checks, make them debug-only via `process.env.NODE_ENV === 'development'` or similar |
| **Regression test** | If Option A: `MATH-8: dot and addVec throw for sparse vectors` |
| **Completion** | `[ ]` — lower priority; defer or document-only |

---

## Phase 3 — Performance (Optional / Defer)

### P3.1 — Hot-path validation overhead

| Item | Detail |
|------|--------|
| **Bug** | `scaleMat` sparse check O(n²), `addMat` jagged check O(n), `outer` sparse check O(n) in hot path |
| **Fix** | Wrap in `if (process.env.AGNI_MATH_STRICT) { ... }` or remove for production; document. Or: one-time validation at bandit init |
| **Completion** | Defer unless Pi profiling shows bottleneck |

---

### P3.2 — matVec internal dot without redundant null checks

| Item | Detail |
|------|--------|
| **Bug** | matVec calls dot(row, x) which re-validates null on every row |
| **Fix** | Add internal `_dot(a, b)` without guards; matVec uses _dot; public dot keeps guards |
| **Completion** | Defer; trivial overhead for n=16 |

---

## Phase 4 — Documentation

### P4.1 — CHOLESKY_EPSILON vs JITTER

| Item | Detail |
|------|--------|
| **Bug** | Implicit constraint that JITTER > CHOLESKY_EPSILON; undocumented |
| **Fix** | Add JSDoc to `CHOLESKY_EPSILON`: "JITTER in thompson.js must be >= CHOLESKY_EPSILON for jitter retry to succeed." Add same to thompson JITTER constant |
| **Completion** | `[ ]` → `[x]` |

---

### P4.2 — Header comment accuracy

| Item | Detail |
|------|--------|
| **Bug** | Header says "All functions are pure (no side effects, no state)" but randn had state |
| **Fix** | After P1.2, ensure header is accurate. If randn remains impure for any reason, update: "All functions except randn are pure." |
| **Completion** | `[ ]` → `[x]` (post P1.2) |

---

## Test File Layout

### `tests/unit/math.test.js` (extend existing)

- **cholesky:** add `throws for null`, `throws for non-square matrix`, `throws for non-symmetric matrix`
- **forwardSub / backSub:** add `forwardSub throws when b.length !== L.length`, `backSub throws when y.length !== L.length`
- **identity:** add `throws for null/undefined n`, `throws for negative n`, `throws for non-integer n`
- **scaleVec / scaleMat:** add `throws for undefined scalar`, `throws for NaN scalar`
- **invertSPD:** add `throws for null or undefined input`
- **randn:** add `throws when Math.random returns zero repeatedly` (with mock), `randn is isolated from prior test cache` (if P1.2 removes cache, simplify to "returns finite numbers in sequence")

### `tests/unit/regressions.test.js` (add describe blocks)

```javascript
describe('MATH-1: cholesky rejects null, non-square, and non-symmetric input', () => { ... });
describe('MATH-2: randn has no module-level state', () => { ... });
describe('MATH-3: randn fallback does not produce degenerate u=v sample', () => { ... });
describe('MATH-4: forwardSub and backSub throw on RHS length mismatch', () => { ... });
describe('MATH-5: identity rejects invalid n', () => { ... });
describe('MATH-6: scaleVec and scaleMat reject invalid scalar', () => { ... });
describe('MATH-7: invertSPD throws for null input', () => { ... });
```

---

## Completion Checklist

Before marking any item `[x]`:

1. **Implement fix** in `packages/agni-engine/math.js`
2. **Add regression test** in `tests/unit/regressions.test.js` (named per MATH-N)
3. **Add/extend unit test** in `tests/unit/math.test.js`
4. **Run:** `npm run test` (or `node --test tests/unit/math.test.js tests/unit/regressions.test.js`)
5. **Break-it:** Temporarily revert fix; confirm regression test fails; restore fix
6. **Wire:** If new export or API, ensure callers (thompson, embeddings, federation, index) still work; run `npm run test` including engine tests

---

## CI / Verify Gates

- **Existing:** `npm run test` runs `tests/unit/*.test.js` including math.test.js. Regressions.test.js is in that glob.
- **No new script required** — math fixes are validated by unit + regression tests. `verify:all` does not currently run math tests explicitly; ensure `npm test` is part of PR validation (it is, per standard Node test flow).
- **Optional:** Add `verify:math` = `node --test tests/unit/math.test.js` and `node --test tests/unit/regressions.test.js` filtered to MATH-* if desired for faster iteration.

---

## Wiring (Post-Fix)

- **Who calls math?** thompson.js, embeddings.js, federation.js, packages/agni-engine/index.js
- **How loaded?** `require('./math')` or `require('@agni/engine/math')` from engine package
- **If math broken?** Cholesky/invertSPD failures in selectLesson, updateBandit; randn used for Thompson sampling and embedding init — failures would surface in `engine-thompson.test.js`, `engine-embeddings.test.js`, `engine-federation.test.js`, `select-best-lesson.test.js`
- **Wiring proof:** Run `npm run test` and `npm run test:integration` — all pass after fixes

---

## Execution Order

1. **P1.1** (cholesky validation) — no dependency
2. **P1.2** (randn purity) — do before P1.3; P1.3 may need to mock differently after cache removal
3. **P1.3** (randn fallback)
4. **P1.4** (forwardSub/backSub)
5. **P2.1** through **P2.3** (identity, scaleVec/scaleMat, invertSPD) — independent
6. **P4.1**, **P4.2** (docs) — after P1.2
