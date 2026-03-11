# Verification Guards — Regression Protection

This document describes the structure of automated guards against regression. Run `npm run verify:all` to execute the full suite.

## Layout

| Group | Scope | Contents |
|-------|--------|----------|
| **verify:core** | Cross-cutting | dead-files, dts, innerhtml, factory-order, precache-regression, schema-sync, codegen-sync, canonical, canonical-imports, node-version-docs, engine-no-ts, package-headers, skill-dag, run-environments, architectural-remediation, **es5** |

**Edge device (Android Nougat) guard:** `test:es5` runs `scripts/check-es5.js` and enforces ES5-only syntax and APIs in `packages/agni-runtime/`, `packages/agni-hub/sw.js`, and `packages/agni-hub/pwa/*.js`. These run in Chrome 51 WebView on student devices. See `docs/RUN-ENVIRONMENTS.md` and `.cursor/rules/edge-device-es5.md`.
| **verify:runtime** | `packages/agni-runtime/` | svg-tools, runtime-manifest, runtime-headers, runtime-docs, runtime-lint, sensors |
| **verify:hub** | Hub + auth | hub-config-pi, hub-config-bootstrap, unauthed-routes, version-sync, api-contract-auth, hub-imports, hub-no-scripts, hub-test-targets, hub-docs, hub-lint, config-injection, theta-api |
| **verify:services** | `packages/agni-services/` | services-no-scripts, services-test-targets, services-docs, services-lint |
| **verify:governance** | `packages/agni-governance/` | governance-canonical, governance-docs, governance-paths, governance.test.js |

**verify:all** = verify:core && verify:runtime && verify:hub && verify:services && verify:governance

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

## Adding a New Guard

1. Create a script in `scripts/check-*.js` or a regression test in `tests/unit/*.test.js`.
2. Add an npm script: `"verify:name": "node scripts/check-name.js"`.
3. Add it to the appropriate group in `package.json` (verify:core, verify:runtime, verify:hub, or verify:services).
4. Wire into `.github/workflows/validate.yml` via `verify:all` (no change needed — verify:all covers all groups).
