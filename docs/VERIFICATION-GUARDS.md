# Verification Guards — Regression Protection

This document describes the structure of automated guards against regression. Run `npm run verify:all` to execute the full suite.

## Layout

| Group | Scope | Contents |
|-------|--------|----------|
| **verify:core** | Cross-cutting | dead-files, dts, innerhtml, factory-order, precache-regression, schema-sync, codegen-sync, canonical, canonical-imports, node-version-docs, **env-docs**, engine-no-ts, package-headers, **module-headers**, skill-dag, run-environments, architectural-remediation, **lms-integrations** (R8 Phase 2), **es5** |

**Edge device (Android Nougat) guard:** `test:es5` runs `scripts/check-es5.js` and enforces ES5-only syntax and APIs in `packages/agni-runtime/`, `packages/agni-hub/sw.js`, and `packages/agni-hub/pwa/*.js`. These run in Chrome 51 WebView on student devices. See `docs/RUN-ENVIRONMENTS.md` and `.cursor/rules/edge-device-es5.md`.
| **verify:runtime** | `packages/agni-runtime/` | svg-tools, runtime-manifest, runtime-headers, runtime-docs, runtime-lint, sensors |
| **verify:hub** | Hub + auth | hub-config-pi, hub-config-bootstrap, unauthed-routes, version-sync, api-contract-auth, **api-contract-routes**, **portal-api-contract**, hub-imports, hub-no-scripts, hub-test-targets, hub-docs, hub-lint, config-injection, pathfinder-api |
| **verify:services** | `packages/agni-services/` | services-no-scripts, services-test-targets, services-docs, services-lint |
| **verify:governance** | `packages/agni-governance/` | governance-canonical, governance-docs, governance-paths, governance.test.js |

**verify:all** = verify:core && verify:runtime && verify:hub && verify:services && verify:governance

## Test file naming

- **Unit tests:** `tests/unit/*.test.js` — Mocha; run with `npm run test` or `test:unit`.
- **Integration tests:** `tests/integration/*.test.js` — Mocha with optional server; run with `npm run test:integration`.
- **Verification tests:** Tests that encode a specific regression or guard (e.g. `architectural-remediation-verification.test.js`, `pathfinder-api.test.js`, `governance.test.js`) live under `tests/unit/` and are run as part of `verify:*` or `test:unit`. Naming: `*.test.js` for Mocha; `*.spec.ts` for Playwright E2E in `tests/e2e/`.

Keep this convention so tooling and humans agree on what counts as unit vs integration vs verify.

## Tests vs. Verify Scripts

| Category | Purpose |
|----------|---------|
| **test:unit** | Mocha unit tests in `tests/unit/*.test.js` |
| **test:integration** | Mocha integration tests in `tests/integration/*.test.js` |
| **test:contract** | Hub API contract (no live server) |
| **test:graph** | Graph verification |
| **verify:architectural-remediation** | Architectural vulnerabilities checklist (#1–#7) — cache poisoning, fsync, cycles, sensors, integrity, time-skew, Pi config |
| **test:e2e** | Playwright browser E2E |
| **verify:*** | Structural/mechanical checks (no innerHTML XSS, .d.ts parity, etc.) plus focused regression tests (config-injection, theta-api, governance) |

## CI

`.github/workflows/validate.yml` runs, in order:

1. lint, format:check, typecheck (src/ + packages/)
2. codegen:validate-schemas
3. test:coverage
4. test:integration
5. test:contract
6. test:graph
7. **verify:all**
8. validate OLS lessons
9. build all lessons
10. data directory cleanliness

E2E runs in a separate job.

## Regression Test Coverage (key fixes)

When you add a regression test for a fix, add a row to this table so the fix is discoverable. Optionally run `npm run verify:regression-table` to ensure each listed test file/suite still exists (see scripts/check-regression-table.js).

| Fix | Test location | Fails if reverted |
|-----|---------------|-------------------|
| LEN-001 #1 randn PRNG fallback | regressions.test.js MATH-3 | ✓ |
| LEN-001 #2 randn cache (1 PRNG pair per 2 samples) | math.test.js randn LEN-001 #2 | ✓ |
| LEN-001 #3 cholesky NaN/Inf | regressions.test.js MATH-1b, math.test.js | ✓ |
| LEN-001 #9 forwardSub/backSub L validation | math.test.js LEN-001 #9, regressions MATH-4 | ✓ |
| LEN-001 #14 addVec/addMat coercion | math.test.js LEN-001 #14 | ✓ |
| LEN-001 #11 dot() Kahan summation | math.test.js LEN-001 #11 | ✓ |
| LEN-001 #15 sparse (dot/addVec/scaleVec/outer) | math.test.js LEN-001 #15 | ✓ |
| LEN-001 #16 scaleVec/matVec Array.isArray | math.test.js LEN-001 #16 | ✓ |
| yaml-safe 2-5 Date/binary/omap | regressions.test.js YAML-SAFE 2-5, yaml-safe.test.js | ✓ |
| svg-stage 3-2 RAF after destroy | Code guard only (svg-stage.js lines 90, 98) | — |
| AUDIT-B2 SW fallback .catch() | regressions.test.js AUDIT-B2 | ✓ |
| B2 factory-loader cache fallback | regressions.test.js B2 | ✓ |
| R8 LTI grade passback | wiring-smoke.test.js (GET /lti/lesson, /lti/xml, /lti/lessons, POST /lti/submit-grade) | ✓ |
| R8 LTI postMessage (telemetry, player) | regressions.test.js R8 | ✓ |
| R8 Phase 2 Kolibri chef + mod_ols structure | regressions.test.js R8 Phase 2, check-lms-integrations.js | ✓ |
| Hub no hub-tools references | regressions.test.js REGRESSION, check-hub-docs.js | ✓ |

---

## Adding a New Guard

When you add new behavior or fix a regression, add a guard so the fix is protected and the intended contract is encoded in CI.

1. **Choose the right guard type:** For structural/mechanical rules (e.g. "every route documented", "no innerHTML"), create `scripts/check-*.js`. For regression tests that assert specific behavior, add or extend a test in `tests/unit/*.test.js` (or `tests/integration/`).
2. Create the script (e.g. `scripts/check-name.js`) or the test file. Scripts should exit 0 on pass, 1 on failure and print a clear message.
3. Add an npm script in `package.json`: `"verify:name": "node scripts/check-name.js"` (or the mocha command for tests).
4. Add it to the appropriate group: `verify:core`, `verify:runtime`, `verify:hub`, `verify:services`, or `verify:governance` in the `verify:*` chain. `verify:all` runs all groups, so no change is needed in `.github/workflows/validate.yml`.

**Optional guards** (not in `verify:all`; run when updating docs or regression table): `verify:regression-table` (listed test files exist), `verify:doc-links` (internal markdown links in docs/ and CONVENTIONS/CONTRIBUTING point to existing files).
