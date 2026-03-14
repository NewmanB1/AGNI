# Math Module Remediation Plan

Fix bugs in `packages/agni-engine/math.js` with regression guards and unit tests.

**Reference:** Consolidated bug list from code review (cholesky, randn, forwardSub/backSub, identity, scaleVec/scaleMat, invertSPD, sparse/NaN handling, performance, CHOLESKY_EPSILON/JITTER).

**LEN:** [LEN-001: Math Engine Bug Remediation](../LEN-001-MATH-ENGINE-BUGS.md) — actionable prioritization and acceptance criteria.

**Canonical source:** `packages/agni-engine/math.js` (per AGENTS.md). Tests use `require('@agni/engine/math')`.

**Verification rule:** Per `.cursor/rules/sprint-verification.md`, each fix must have a regression test that **fails before** the fix and **passes after**. Run break-it checks before marking complete.

---

## Consolidated Bug List

Merged from code audit and deep-dive analysis. Each bug includes severity, impact path, and fix guidance.

### BUG 1 — randn() throws on cosmologically impossible event (unrecoverable crash in Thompson sampling)

| Item | Detail |
|------|--------|
| **Severity** | Critical (operational) |
| **Code** | `if (--lim <= 0) { throw new Error('[MATH] randn: PRNG returned zero 1000 times'); }` |
| **Problem** | The v2 fallback (u = v = 1e-10) was rightly removed because it produced an extreme outlier. The replacement — throw — propagates uncaught through `sampleThetaForScoring` in index.js, which has no error handling around randn calls. If randn throws (probability (2^-53)^1000 — impossible in practice but present as a code path), selectBestLesson throws, propagating to the HTTP handler, crashing the lesson selection request. On a Pi with 60 students, this terminates an in-flight selection with no recovery. The throw is the wrong failure mode for an astronomically impossible event in a non-critical path. The 1000-iteration limit and throw are unreachable dead code on any correct PRNG, but create a latent crash path. |
| **Fix** | If the PRNG is genuinely broken, the responsible action is to log a fatal error and return a safe fallback (e.g. `return 0`), not throw into the selection hot path. No caller handles it. Alternatively, remove the loop/lim entirely and document that Math.random() ∈ [0,1) per spec — if it returns 0, that's a broken runtime. |
| **Call path** | `sampleThetaForScoring` → `for (i...) z.push(math.randn())` → selectBestLesson → HTTP handler |

---

### BUG 2 — randn() discards the sin sample (performance regression from v2)

| Item | Detail |
|------|--------|
| **Severity** | Medium (performance on Pi) |
| **Code** | `return r * Math.cos(2 * Math.PI * v);` — sin sample discarded |
| **Problem** | V2 introduced _randnCache to cache the sin sample. V3 removed the cache to restore purity. In doing so it reintroduces the waste: every randn() call discards r * Math.sin(2 * Math.PI * v). For featureDim = 16, that's 8 unnecessary PRNG calls and 8 unnecessary transcendental evaluations per sampleTheta call on the Pi. |
| **Fix** | **Option A:** Document explicitly: "Box-Muller generates two samples; this function returns one. Callers needing N samples should accept N/2 PRNG pairs." **Option B:** Export `makeRandnStream()` that returns a stateful iterator; state is encapsulated in the closure, not the module. Callers needing N samples call the stream N times. |
| **Call path** | Thompson sampling builds featureDim-length z vector; sampleTheta calls randn in loop |

---

### BUG 3 — cholesky() symmetry check uses A[i][j] \|\| 0 — masks NaN, produces misleading error

| Item | Detail |
|------|--------|
| **Severity** | High (correctness) |
| **Code** | `if (Math.abs((A[i][j] || 0) - (A[j][i] || 0)) > 1e-12)` |
| **Problem** | `A[i][j] || 0` evaluates to 0 when A[i][j] is 0, null, undefined, NaN, or false. For NaN: NaN \|\| 0 = 0, so a matrix with NaN off-diagonal entries passes the symmetry check. Proceeds into Cholesky loop where NaN causes diag = A[i][i] - NaN = NaN, then !isFinite(diag) fires — but with misleading "Matrix is not SPD" message rather than "matrix contains NaN." |
| **Fix** | Explicit type check: `var aij = A[i][j]; var aji = A[j][i]; if (typeof aij !== 'number' || typeof aji !== 'number') { throw new Error('[MATH] cholesky: non-numeric entry at [' + i + '][' + j + ']'); }` then `Math.abs(aij - aji) > 1e-12` for symmetry. |
| **Supersedes** | P1.1 symmetry check — must not use \|\| 0 |

---

### BUG 4 — cholesky() symmetry check O(n²) on every invertSPD call (hot path)

| Item | Detail |
|------|--------|
| **Severity** | Medium (performance on Pi) |
| **Code** | Full O(n²) symmetry loop before any Cholesky work |
| **Problem** | For 16×16 matrix, 120 subtractions and 120 Math.abs before factorization. cholesky is called from invertSPD, which is called from sampleThetaForScoring (every selectBestLesson), getBanditSummary (every federation export), mergeBanditSummaries (every federation merge). The matrix state.bandit.A is only ever modified by updateBandit via outer(x,x) — symmetric by construction. Cannot become asymmetric through normal operation. |
| **Fix** | Validate symmetry once at load time (migrations.js or loadState), not on every hot-path call. Or gate with AGNI_MATH_STRICT. |
| **Call path** | invertSPD → cholesky → symmetry check; invertSPD called every lesson selection |

---

### BUG 5 — cholesky() square matrix validation is O(n) pre-pass; could merge into factorization loop

| Item | Detail |
|------|--------|
| **Severity** | Low (micro-optimization) |
| **Code** | Separate `for (i...) if (!A[i] || A[i].length !== n)` before Cholesky loop |
| **Problem** | Two full passes over rows. For 16 rows, 16 extra array accesses. |
| **Fix** | Incorporate A[i].length check at start of outer i loop in the Cholesky factorization. |

---

### BUG 6 — outer() sparse check reuses i from first for loop (fragile pattern)

| Item | Detail |
|------|--------|
| **Severity** | Low (maintainability) |
| **Code** | `for (var i = 0; i < a.length; i++) {...} for (i = 0; i < b.length; i++) {...}` — second loop uses i without var |
| **Problem** | Under strict mode with var hoisting, legal — var i is function-scoped. Pattern is fragile; a future minifier or transpiler could mishandle. Inconsistent with other functions that declare loop vars explicitly. |
| **Fix** | Use `for (var j = 0; j < b.length; j++)` or declare `var i, j` at function top. |

---

### BUG 7 — addMat() jagged check redundantly validates row 0 twice

| Item | Detail |
|------|--------|
| **Severity** | Low (micro-optimization) |
| **Code** | `cols = A[0].length` establishes row 0; loop `for (i = 0; i < rows; i++)` re-checks row 0 with `A[i].length !== cols` |
| **Problem** | Row 0 validated twice. |
| **Fix** | Start loop at `i = 1`. |

---

### BUG 8 — matVec() vs addMat() validation consistency

| Item | Detail |
|------|--------|
| **Severity** | Low (auditability) |
| **Problem** | addMat checks row 0 of both A and B before loop; matVec only checks row 0 of A (for cols) and validates in loop. Both correct but inconsistent, making validation logic harder to audit. |
| **Fix** | Document or align validation structure for consistency. |

---

### BUG 9 — forwardSub() and backSub() do not validate L (null, non-square, jagged)

| Item | Detail |
|------|--------|
| **Severity** | Medium (external callers; confusing errors) |
| **Code** | L is never null-checked; L.length used directly |
| **Problem** | If L is null → `TypeError: Cannot read property 'length' of null` (no [MATH] prefix). If L is [] (empty), n=0, returns [] — degenerate case. If L is jagged, L[i][i] may be undefined, eventually throws "zero or invalid diagonal" rather than "L is malformed." forwardSub and backSub are exported; external callers can pass invalid L. In practice, invertSPD supplies L from cholesky (validated), so low risk for internal callers. |
| **Fix** | Add `if (L == null) throw new Error('[MATH] forwardSub: L is null or undefined')`; validate L is square, non-empty; optionally validate lower-triangular structure. Same for backSub. |
| **Supersedes** | P1.4 (which only covers RHS) |

---

### BUG 10 — identity(0) returns []; downstream zero-dimension path can explode later

| Item | Detail |
|------|--------|
| **Severity** | Low (edge case) |
| **Code** | identity(0) returns []; valid per guard (n >= 0) |
| **Problem** | federation.js zero-observation fallback: `dim = local.mean.length`; if local.mean is [] (corrupted summary), dim=0, identity(0)=[], mergeBanditSummaries returns { precision: [] }, invertSPD([])=[], matVec([], b) with non-empty b throws "dimension mismatch." Zero-dimension path propagates silently until dimension mismatch explodes. |
| **Fix** | Either reject n=0 in identity, or add explicit zero-dimension handling at federation merge boundary. |
| **Call path** | federation mergeRemoteSummary when totalN===0 and local.mean=[] |

---

### BUG 11 — dot() naive summation (floating-point error) — Done

| Item | Detail |
|------|--------|
| **Severity** | Informational |
| **Code** | `for (...) sum += a[i] * b[i]` |
| **Problem** | Naive summation error bound O(n * ε * ||a|| * ||b||). For n=16, negligible. For n=256 (migration max), cancellation can lose precision. |
| **Fix** | **Done** — Kahan summation in dotInner. Test: math.test.js LEN-001 #11. |

---

### BUG 12 — scaleMat() O(n²) sparse check in hot path (updateBandit / forgetting)

| Item | Detail |
|------|--------|
| **Severity** | Medium (performance on Pi) |
| **Code** | `for (j...) if (!(j in A[i])) throw` — full matrix scan before multiplications |
| **Problem** | Doubles work per scaleMat call. All matrices produced by identity(), outer(), scaleMat, addMat use .fill(0) or .map() — dense by construction. Holes can only appear from corrupted lms_state.json, which should be caught at load time. |
| **Fix** | Move sparse check to load/migration time. Same for outer()'s pre-loop hole check. |
| **Call path** | updateBandit → scaleMat in forgetting |

---

### BUG 13 — cholesky() symmetry tolerance 1e-12 may be too tight for post-federation merge

| Item | Detail |
|------|--------|
| **Severity** | High (real-world crash) |
| **Code** | `Math.abs(...) > 1e-12` throws on asymmetry |
| **Problem** | updateBandit keeps A exactly symmetric (IEEE 754 commutativity). But after federation merge, `_state.bandit.A = merged.precision` where merged comes from addMat(scaledLocalPrec, scaledRemotePrec). If precision arrived via JSON serialization from remote hub, float rounding can break symmetry by more than 1e-12. cholesky throws on merged precision matrix, crashing sampleTheta on next lesson selection after every federation merge. |
| **Fix** | Relax tolerance for symmetry check (e.g. 1e-10 or 1e-8) to accommodate JSON round-trip error; or re-symmetrize merged precision before storing: `A[i][j] = A[j][i] = (A[i][j] + A[j][i]) * 0.5` at merge boundary. |
| **Call path** | Federation merge → merged.precision → next selectBestLesson → invertSPD → cholesky → throw |

---

### BUG 14 — addVec() and addMat() use + which concatenates strings

| Item | Detail |
|------|--------|
| **Severity** | Medium (data corruption from typed/parsed input) |
| **Code** | `return v + b[i]`; `return v + B[i][j]` |
| **Problem** | If elements are strings (e.g. from JSON parse or typed config), `"1" + 2` → `"12"`. dot, scaleVec, outer use * which coerces to number; addVec and addMat do not. |
| **Fix** | Validate numeric or coerce: `Number(v) + Number(b[i])` or throw on non-numeric. |

---

### BUG 15 — dot(), addVec(), scaleVec() produce NaN for sparse arrays; inconsistent with outer/scaleMat

| Item | Detail |
|------|--------|
| **Severity** | Medium (silent NaN poisoning) |
| **Problem** | outer and scaleMat throw for sparse/holes. dot, addVec, scaleVec silently produce NaN (undefined * n = NaN, undefined + n = NaN). |
| **Fix** | Add sparse checks to dot, addVec, scaleVec for consistency; or document inputs must be dense. Prefer debug-only if hot-path concern. |

---

### BUG 16 — scaleVec(), matVec() lack array/vector type validation

| Item | Detail |
|------|--------|
| **Severity** | Low (confusing errors) |
| **Problem** | scaleVec uses v.map() without checking v is array-like; matVec passes x to dot without checking x is array. Non-array input yields generic TypeError. |
| **Fix** | Add `if (!Array.isArray(v))` or length check; throw [MATH] error. |

---

### BUG 17 — invertSPD() symmetrizes off-diagonal only; diagonal not averaged

| Item | Detail |
|------|--------|
| **Severity** | Low (edge case) |
| **Code** | Loop `for (j = 0; j < i; j++)` skips diagonal |
| **Problem** | For symmetric A, A⁻¹ is symmetric in exact arithmetic. FP can introduce tiny diagonal asymmetry. Typically negligible. |
| **Fix** | Optional: symmetrize diagonal for consistency. |

---

### BUG 18 — randn() can return Infinity for extremely small u

| Item | Detail |
|------|--------|
| **Severity** | Low (pathological PRNG) |
| **Problem** | sqrt(-2*log(1e-400)) → Infinity. Math.random() spec [0,1) excludes 0; extreme small u is also unlikely. |
| **Fix** | Document in JSDoc; optionally clamp output to finite range. |

---

### Bug → Phase mapping

| Bug | Phase | Notes |
|-----|-------|-------|
| 1 | P1.3 | randn throw → return fallback |
| 2 | P3 / doc | randn waste; Option A or B |
| 3 | P1.1 | cholesky \|\| 0 → explicit NaN check |
| 4 | P3.1 | symmetry check move to load time |
| 5 | P3 | merge square check into Cholesky loop |
| 6 | P2 | outer() loop var |
| 7 | P3 | addMat loop start at 1 |
| 8 | Doc | matVec/addMat consistency |
| 9 | P1.4+ | forwardSub/backSub L validation |
| 10 | P2 | identity(0) / federation zero-dim |
| 11 | — | No action |
| 12 | P3.1 | scaleMat sparse at load time |
| 13 | P1.1 / federation | symmetry tolerance or re-symmetrize at merge |
| 14 | P2 | addVec/addMat numeric coercion |
| 15 | P2.4 | sparse consistency |
| 16 | P2 | scaleVec/matVec type check |
| 17 | Optional | invertSPD diagonal symmetrization |
| 18 | P4 | JSDoc for randn |

---

## Phase 1 — Critical (Correctness)

### P1.1 — `cholesky()` input validation

| Item | Detail |
|------|--------|
| **Bug** | See **BUG 3**. No null/square checks; symmetry check uses `(A[i][j] \|\| 0)` which masks NaN (yields misleading "not SPD" error). Also **BUG 13** for federation JSON round-trip symmetry. |
| **Fix** | Null/square as before. For symmetry: do NOT use `\|\| 0`. Use explicit `typeof aij !== 'number'` check → throw `[MATH] cholesky: non-numeric entry`. Then `Math.abs(aij - aji) > tol`. Consider relaxing tolerance for post-federation merged matrices (BUG 13) or re-symmetrize at merge boundary. |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-1: cholesky rejects null, non-square, non-symmetric, and NaN input` |
| **Unit test** | `tests/unit/math.test.js` → add `throws for matrix with NaN` |
| **Proof** | Run `node --test tests/unit/math.test.js tests/unit/regressions.test.js` — all pass. Revert fix → regression fails |
| **Completion** | `[x]` — tests pass (but BUG 3/13 fixes may be pending) |

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

### P1.3 — `randn()` PRNG failure: log and return fallback (do NOT throw)

| Item | Detail |
|------|--------|
| **Bug** | See **BUG 1**. Current code throws when lim exhausted. Throw propagates uncaught through sampleThetaForScoring → selectBestLesson → HTTP handler. Crashes lesson selection for a student with no recovery. Wrong failure mode for cosmologically impossible event. |
| **Fix** | If lim exhausted: log fatal error (e.g. via @agni/utils/logger), return safe fallback `0`. Do NOT throw. No caller handles it. Alternatively: remove the lim/loop entirely; document that Math.random() ∈ [0,1) per spec. |
| **Regression test** | `tests/unit/regressions.test.js` → `MATH-3: randn returns finite value when PRNG returns zero repeatedly` — mock Math.random to always return 0, call randn, assert returns finite number (e.g. 0), does NOT throw. |
| **Unit test** | `tests/unit/math.test.js` → `randn returns safe fallback when Math.random returns zero repeatedly` (mock, exhaust lim, expect return, not throw) |
| **Proof** | Test passes. Revert fix → regression fails (expect no throw) |
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
