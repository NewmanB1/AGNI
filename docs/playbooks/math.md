# How to modify the Math module

Use this when changing `packages/agni-engine/math.js` — pure linear algebra helpers (dot, addVec, scaleMat, cholesky, invertSPD, randn, etc.). Canonical source per AGENTS.md.

## Entry point

- **File:** `packages/agni-engine/math.js`
- **Tests:** `tests/unit/math.test.js`
- **Canonical:** `packages/agni-engine/math.js` → `require('@agni/engine/math')`

## Design conventions

| Convention | Detail |
|------------|--------|
| **dot vs dotInner** | `dot()` is the public API and validates inputs. `dotInner()` is internal and skips validation — use it only when the caller has already validated (e.g. matVec). Avoid double-validation in hot paths. |
| **Sparse vectors** | dot, addVec, scaleVec, outer require dense vectors (no holes). Sparse arrays fail validation and throw [MATH] (LEN-001 #15). Consistent with scaleMat (AGNI_MATH_STRICT). |
| **Matrix row validation** | Check `!A[i] || !Array.isArray(A[i])` before accessing `.length` (avoids TypeError on null/non-array). Then check `A[i].length !== cols` for jagged matrices. Use separate error messages: "row X must be array" vs "jagged matrix at row X". |
| **Purity** | All functions are pure except `randn()` (uses module-level `_randnCache` for Box–Muller two-sample efficiency). No other shared mutable state. |
| **In-place** | Do not add in-place variants. Callers may pass aliased arrays; implementations must never mutate inputs. |

## Testing: randn and _randnClearCache

`randn()` uses module-level `_randnCache` (the second Box–Muller sample). This causes **test pollution**:

- If test A calls `randn()` and consumes the cos sample, the sin sample stays in the cache.
- Test B then gets that cached value as its first `randn()` result, even if it mocks `Math.random` to a fresh sequence.

**When writing tests that mock `Math.random` or depend on deterministic `randn` output:**

1. Call `math._randnClearCache()` **before** mocking `Math.random`.
2. If `randn()` throws (e.g. broken PRNG), call `_randnClearCache()` before retrying — the cache survives the throw.
3. For isolation between tests, call `_randnClearCache()` in a `beforeEach` or at the start of tests that care about `randn` order.

Example (LEN-001 #1: randn returns 0 on PRNG failure, does not throw):

```javascript
it('returns 0 when Math.random returns zero repeatedly', () => {
  math._randnClearCache();
  const origRandom = Math.random;
  Math.random = function () { return 0; };
  try {
    const v = math.randn();
    assert.ok(isFinite(v) && v === 0, 'randn returns 0 on PRNG exhaustion');
  } finally {
    Math.random = origRandom;
  }
});
```

## Related

- **LMS playbook:** `docs/playbooks/lms.md` — math is used by thompson.js, rasch.js, federation.
- **Bug remediation:** `docs/playbooks/math-remediation-plan.md` — historical bug list and fix patterns.
