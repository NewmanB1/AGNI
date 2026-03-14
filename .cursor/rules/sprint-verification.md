# Sprint Verification Rule

Every sprint item, bug fix, or hardening claim MUST be backed by automated proof
before it can be marked complete. This rule exists because past sprint documents
declared victory on items (XSS hardening, test coverage, type safety) that were
not actually verified — the bugs persisted silently.

## 1. Fix → Regression Test (mandatory)

When a bug is fixed or a class of vulnerability is eliminated:

- Write a **named regression test** in `tests/unit/regressions.test.js` whose
  `describe`/`it` name references the sprint item (e.g. `R10-P1: no innerHTML
  with unsanitized interpolation in runtime/`).
- The test must **fail before the fix** and **pass after**. If you cannot
  demonstrate the failure, the test is not a regression test.
- The sprint document must include a `Proof:` line linking to the test:
  ```
  - [x] P1.1: Eliminate innerHTML XSS in runtime/
    - Proof: tests/unit/regressions.test.js → "R10-P1: ..."
    - CI gate: scripts/check-innerhtml.js
  ```

## 2. Class Elimination → CI Gate (mandatory)

When a sprint claims an entire **class** of bug is eliminated (e.g. "no more
innerHTML XSS", "all .d.ts files match implementations", "no dead source files"):

- Add an automated script in `scripts/` that mechanically detects violations.
- Wire the script into `.github/workflows/validate.yml` so it runs on every push.
- The sprint document must reference the CI gate, not just a manual audit.

Current CI gates for class-level claims (run via `npm run verify:all` in `.github/workflows/validate.yml`):

| Claim | Gate script | Group |
|-------|-------------|-------|
| No innerHTML XSS in runtime/ | `scripts/check-innerhtml.js` | `verify:core` |
| .d.ts signatures match .js | `scripts/check-dts-arity.js` | `verify:core` |
| No orphan source files | `scripts/check-dead-files.js` | `verify:core` |
| ES5 compliance (runtime + hub sw/pwa) — Android 7.0 Nougat | `scripts/check-es5.js` | `verify:core` |
| Polyfills loaded before runtime | `scripts/check-factory-order.js` | `verify:core` |
| Run-environment headers (edge/hub) | `scripts/check-run-environments.js` | `verify:core` |

**Verify groups:** `verify:core` | `verify:runtime` | `verify:hub` | `verify:services` | `verify:governance` | `verify:all`

## 3. .d.ts Files

When modifying any engine `.js` file that has a paired `.d.ts`:
- Update the `.d.ts` to match the new parameter list, parameter types, and
  return type.
- Run `npm run verify:dts` to confirm the signatures match.

## 4. Marking Sprint Items Complete

Before marking any sprint checklist item `[x]`:
1. Confirm the relevant test(s) pass: `npm test`
2. Confirm any relevant CI gate passes: run the gate script locally
3. Add the `Proof:` line to the sprint document

If you cannot point to a passing test or gate, the item is **not complete** —
mark it `[ ]` and note what's missing.

## 5. Wiring Proof (mandatory)

A regression test proves the **component** works. A wiring proof proves the
component is **loaded, invoked, and reachable** in the target environment. This
section exists because past sprints repeatedly created correct files that were
never connected to the system — polyfills that no loader loaded, auth middleware
that was only added on the client but not the server, interceptors bypassed by
one function's custom error handling.

### 5.1 Call-Chain Documentation

Every fix that introduces a new file, new middleware, or new loading dependency
must include a **"Wiring:"** line in the sprint document that traces the full
invocation path from entry point to the fix. Example:

```
- [x] P2.1: Add ES5 polyfills for Chrome 44
    - Proof: tests/unit/regressions.test.js → "AUDIT-XX: polyfills loaded"
    - Wiring: shell.html → factory-loader.js (FACTORY_FILES list) → polyfills.js (loaded first)
```

### 5.2 The Three Wiring Questions

Before marking any fix complete, answer these three questions in the sprint
document or commit message:

1. **Who calls this code?** — Identify the caller(s) that invoke the new/changed
   code. If nothing calls it, it is dead code and the fix is incomplete.
2. **How does it get loaded?** — Trace the file/module loading path (e.g.
   `require()`, `<script src>`, factory loader file list, middleware chain).
3. **What happens if it is missing?** — Confirm that removing the wiring causes
   a **visible failure** (test failure, CI gate failure, or runtime error), not
   silent degradation.

If question 3 cannot be answered with a concrete failure, add a test or CI
check that would catch the wiring being removed.

### 5.3 Server/Client Parity Check

For any fix that spans both client-side (`portal/js/api.js`) and
server-side (`hub-tools/routes/*.js`), explicitly verify **both** sides.
Document in the sprint checklist:

```
- Client: api.ts uses authGet for /api/governance/report
- Server: governance.js wraps GET /api/governance/report with requireAuth
```

If only one side is fixed, the item is **not complete**.

### 5.4 Polyfill / Compatibility Rule

Any new polyfill or compatibility shim must document:

- Where it is loaded in the boot sequence.
- That it loads **before** any code that depends on it.
- A test or CI check that verifies the loading order (or at minimum, that
  the loader's file list includes it). See `scripts/check-factory-order.js`.

## 6. Integration Smoke Tests (mandatory for route/wiring changes)

Any fix that adds, removes, or changes an HTTP route, a script loading
dependency, or a file-serving path must have a corresponding assertion in
`tests/integration/wiring-smoke.test.js`. The smoke test must:

- Start a real AGNI server via `theta.startApi(0)`.
- Make a real HTTP request to the affected route.
- Assert the response status code and response body content.

Self-assessed "Wiring:" lines in sprint documents are supplementary
documentation, **not proof**. A passing smoke test is proof.

If a route was previously untested, add a smoke test for it in the same PR
that changes it. Do not defer "will add test later."

Current smoke test coverage (see `tests/integration/wiring-smoke.test.js`):
| Route                                | What it verifies                               |
|--------------------------------------|-------------------------------------------------|
| `GET /factories/shared-runtime.js`   | lesson-server.attachRoutes works                |
| `GET /factories/polyfills.js`        | polyfills in ALLOWED_FACTORY_FILES              |
| `GET /factory-loader.js`             | factory-loader route exists                     |
| `GET /sw.js`                         | service worker route exists                     |
| `GET /manifest.json`                 | manifest route and valid JSON                   |
| `GET /shared.js`                     | shared.js serves AGNI_SHARED                    |
| `GET /shell-boot.js`                 | shell-boot route exists                         |
| `GET /lesson-data.js`                | lesson-data route (no slug → null)              |
| `GET /lesson-data.js?slug=X`         | lesson compilation + slug param wiring          |
| `GET /lessons/:slug`                 | full lesson HTML with factory-loader + polyfills |
| `GET /lessons/:slug/sidecar`         | sidecar JSON route                              |
| `GET /lti/xml`                       | LTI descriptor for Moodle/Canvas registration   |
| `GET /lti/lessons`                   | LTI lesson catalog JSON                         |
| `GET /lti/lesson/:slug`              | LTI grade wrapper (iframe + postMessage)        |
| `POST /lti/submit-grade`             | LTI Basic Outcomes token validation (400/404)   |
| factory deps order                   | polyfills.js at index 0, correct ordering       |
| factory deps version                 | all versions match package.json                 |

## 7. Regression Test Validity

A regression test must **actually exercise the code path it claims to test**.
Before marking a regression test complete, verify:

1. **Trigger condition**: If the test covers an error/fallback path (e.g.
   Cholesky jitter retry, stale lock recovery), confirm the test input
   satisfies the specific condition that triggers entry into that path. Add a
   comment citing the condition (e.g. "// zero diagonal → diag <= 0 in
   cholesky() → throws → enters jitter catch block").

2. **Break-it check**: Temporarily revert the fix and confirm the test fails.
   If the test passes with or without the fix, it is vacuous and does not
   count as a regression test.

3. **No string-matching surrogates**: A test that only checks whether a source
   file contains a string (e.g. `indexOf('phase1')`) is a **CI gate**, not a
   regression test. Regression tests must exercise runtime behavior: call the
   function, assert the output or side effect.
