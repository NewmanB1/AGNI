# DRY Remediation Plan

Plan to remove Don't Repeat Yourself violations identified across the AGNI codebase. Ordered by architectural effort (low → high) and dependency.

**Reference:** DRY review identified 9 categories. Architectural work ratings 1–10 inform sequencing.

---

## Summary

| Phase | Focus | Items | Est. Effort |
|-------|-------|-------|-------------|
| **1** | Quick wins (rating 1–2) | intEnv/floatEnv, HTTP helpers, loadHubConfig, wizard common, YAML checks | Low |
| **2** | Low-impact consolidation | ROOT path, JSON loadJSON | Low–Medium |
| **3** | Cross-cutting utilities | Ajv setup | Medium |
| **4** | High-complexity unification | walkDir / collectFiles | Medium–High |

---

## Phase 1: Quick Wins (Rating 1–2)

### D1.1 — Consolidate `intEnv` / `floatEnv` in env-validate.js

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| D1.1.1 | Add unified `numericEnv(key, fallback, min, max, parseFn)` | `packages/agni-utils/env-validate.js` | Single helper: `parseFn` is `parseInt` or `parseFloat`; shared NaN/range logic | `npm test` (env tests if any); existing behavior preserved |
| D1.1.2 | Replace `intEnv` / `floatEnv` with `numericEnv` calls | Same | `intEnv` → `numericEnv(..., parseInt)`; `floatEnv` → `numericEnv(..., parseFloat)` | Same |

**Regression:** No API change; internal refactor only.

---

### D1.2 — Consolidate HTTP `put` / `post` in contract tests

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| D1.2.1 | Add `request(baseUrl, path, method, body, opts)` | `tests/contract-hub-api.js` | Single helper: method param; shared headers, body handling, timeout | `npm run test:contract` |
| D1.2.2 | Replace `put` / `post` with `request(..., 'PUT', ...)` / `request(..., 'POST', ...)` | Same | Inline calls | Same |

---

### D1.3 — Hub bootstrap module

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D1.3.1 | Create `packages/agni-hub/bootstrap.js` | New file | `loadHubConfig(path.join(__dirname, '../..', 'data')); module.exports = {};` | — |
| D1.3.2 | Replace inline `loadHubConfig` in theta, sentry, sync | `packages/agni-hub/theta.js`, `sentry.js`, `sync.js` | Add `require('./bootstrap');` at top; remove `loadHubConfig(path.join(...))` | `npm run verify:hub`, `test:contract` |
| D1.3.3 | Replace inline `loadHubConfig` in hub-transform, mesh | `packages/agni-hub/hub-transform.js`, `packages/agni-hub/mesh/index.js` | Same; mesh uses `require('../bootstrap')` | Same |

**Note:** `check-hub-config-bootstrap.js` must still detect bootstrap before env-config. Update to look for `require('./bootstrap')` or `require('../bootstrap')` if it currently greps for `loadHubConfig(`.

---

### D1.4 — Setup wizard common module

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D1.4.1 | Create `scripts/wizard-common.js` | New file | Export `prompt(rl, question, defaultVal)`, `loadExistingHubConfig()`, `DATA_DIR`, `CONFIG_PATH` | — |
| D1.4.2 | Refactor deploy-setup-wizard | `scripts/deploy-setup-wizard.js` | Use wizard-common; remove duplicate prompt and config load/save | `node scripts/deploy-setup-wizard.js` (dry run / help) |
| D1.4.3 | Refactor sync-setup-wizard | `scripts/sync-setup-wizard.js` | Same | `node scripts/sync-setup-wizard.js` |

---

### D1.5 — YAML extension helper

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D1.5.1 | Add `isYamlFile(filename)` to `packages/agni-utils/io.js` | `packages/agni-utils/io.js` | `return /\.(yaml|yml)$/i.test(String(filename));` | — |
| D1.5.2 | Export from index | `packages/agni-utils/index.js` | Add to io re-export or document `require('@agni/utils/io')` | — |
| D1.5.3 | Use in validate-all, validate-schemas, author, check-catalog-ir-consistency | `scripts/validate-all.js`, `scripts/validate-schemas.js`, `packages/agni-services/author.js`, `scripts/check-catalog-ir-consistency.js` | Replace inline `.endsWith('.yaml') \|\| .endsWith('.yml')` with `isYamlFile(f)` | `npm run validate`, `npm test` |

---

## Phase 2: Low-Impact Consolidation (Rating 2–3)

### D2.1 — Scripts `ROOT` constant

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D2.1.1 | Create `scripts/common.js` | New file | `const path = require('path'); const ROOT = path.resolve(__dirname, '..'); module.exports = { ROOT };` | — |
| D2.1.2 | Migrate scripts in `scripts/` to use `const { ROOT } = require('./common');` | All check-*.js, validate-*.js, codegen-*.js, etc. | Replace local `ROOT = path.resolve(__dirname, '..')` | `npm run verify:all` |
| D2.1.3 | Migrate `tests/` if appropriate | Tests that define `ROOT` or similar | Optional: tests may keep local if they need different roots | — |

**Scope:** ~40 scripts. Can be done incrementally; each migration is independent.

---

### D2.2 — Use `loadJSON` where appropriate

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D2.2.1 | Audit call sites | — | List all `JSON.parse(fs.readFileSync(...))` and classify: (a) needs fallback → loadJSON, (b) must throw → keep or add `loadJSONOrThrow` | — |
| D2.2.2 | Add `loadJSONOrThrow(filePath)` if needed | `packages/agni-utils/json-store.js` | Optional: for callers that need explicit failure | — |
| D2.2.3 | Migrate deploy/sync wizards | `scripts/deploy-setup-wizard.js`, `scripts/sync-setup-wizard.js` | Use `loadJSON(CONFIG_PATH, {})` | Manual test wizards |
| D2.2.4 | Migrate hub-config, sync, sentry where semantics match | `packages/agni-utils/hub-config.js`, `packages/agni-hub/sync.js`, `packages/agni-hub/sentry.js` | Careful: hub-config runs before logger; loadJSON logs. May need `loadJSONSilent` or skip | Bootstrap tests |
| D2.2.5 | Migrate scripts (check-catalog-ir-consistency, etc.) | Scripts that read JSON with fallback | Use loadJSON | verify:all |

**Caution:** `loadJSON` logs errors and backs up corrupt files. Bootstrap paths (hub-config) may need a silent variant. Document decision.

---

## Phase 3: Ajv Schema Validator (Rating 5–6)

### D3.1 — Shared Ajv factory

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D3.1.1 | Add `createSchemaValidator(opts)` to `packages/agni-utils` or `packages/ols-schema` | New module (e.g. `packages/agni-utils/schema-validator.js`) | Returns `{ ajv, compile(schema) }`; opts: `{ strict, allErrors }`; adds formats | — |
| D3.1.2 | Decide canonical home | — | `@agni/utils` keeps schema-agnostic; `@ols/schema` is OLS-specific. Recommend `@agni/utils` for generic Ajv setup; `@ols/schema` can use it | — |
| D3.1.3 | Migrate lesson-schema.js | `packages/ols-schema/lesson-schema.js` | Use createSchemaValidator | `npm test` (compiler, schema tests) |
| D3.1.4 | Migrate sentry.js | `packages/agni-hub/sentry.js` | Same | `npm run verify:hub`, sentry tests |
| D3.1.5 | Migrate schema-store.js | `packages/agni-governance/schema-store.js` | Same | governance tests |
| D3.1.6 | Migrate validate-schemas.js, codegen-validate-schemas.js | `scripts/validate-schemas.js`, `scripts/codegen-validate-schemas.js` | Use shared factory; scripts require `@agni/utils` | `npm run codegen:validate-schemas`, validate |

---

## Phase 4: walkDir Unification (Rating 7)

### D4.1 — Design and implement shared walkDir

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D4.1.1 | Design API | — | `walkDir(dir, opts, out)` where opts: `{ extensions, skipDirs, skipArchive?, prefix?, useWithFileTypes? }`; `out` is array to push full paths into | — |
| D4.1.2 | Add to `packages/agni-utils/io.js` | `packages/agni-utils/io.js` | Implement; default extensions `['.js']`, skipDirs `['node_modules']` | Unit test in agni-utils |
| D4.1.3 | Export and document | index, AGENTS.md | — | — |

### D4.2 — Migrate scripts (incremental)

| # | Task | File(s) | Change | Proof |
|---|------|---------|--------|-------|
| D4.2.1 | check-hub-no-scripts | `scripts/check-hub-no-scripts.js` | Use walkDir from @agni/utils/io | verify:hub-no-scripts |
| D4.2.2 | check-hub-imports | `scripts/check-hub-imports.js` | Same | verify:hub-imports |
| D4.2.3 | check-services-no-scripts | `scripts/check-services-no-scripts.js` | Same | verify:services |
| D4.2.4 | verify-canonical-ownership | `scripts/verify-canonical-ownership.js` | walkDir with extensions `['.js']` | verify:canonical |
| D4.2.5 | check-node-version-docs, check-hub-docs | `scripts/check-node-version-docs.js`, `scripts/check-hub-docs.js` | walkDir with extensions `['.md']`, skipArchive | verify:node-version-docs, verify:hub-docs |
| D4.2.6 | validate-all | `scripts/validate-all.js` | walkDir with extensions `['.yaml','.yml']`, prefix support; or keep collectYaml if it has unique behavior | validate lessons |
| D4.2.7 | check-dead-files | `scripts/check-dead-files.js` | walkDir for collectFiles; may need rel-path variant | verify:dead-files |

**Risk:** Each script may have subtle differences (e.g. withFileTypes vs statSync, rel vs abs paths). Migrate one at a time and run full verify:all after each.

---

## Verification

After each phase:

```bash
npm run verify:all
npm test
npm run test:contract
```

Phase 4 (walkDir) should include a new unit test in `packages/agni-utils` for `walkDir` behavior.

---

## Dependency Order

```
Phase 1 (D1.1–D1.5)  — independent, can parallelize
Phase 2 (D2.1, D2.2) — independent of each other
Phase 3 (D3.1)       — independent
Phase 4 (D4.1, D4.2) — D4.1 must precede D4.2; D1.5 adds isYamlFile which D4.2.6 could use
```

D1.5 (isYamlFile) is useful for D4.2.6 (validate-all) if validate-all’s collectYaml is replaced with walkDir + isYamlFile filter.

---

## Master List Integration

See `docs/UNRESOLVED-ISSUES-MASTER-LIST.md` for current status.

**Completed (this session):**
- DRY-8 | Ajv schema validator factory | **Done**
- DRY-9 | walkDir unification | **Done**

---

## References

- DRY review (agent transcript)
- `packages/agni-utils/` — io, json-store, env-validate
- `packages/agni-hub/` — theta, sentry, sync, hub-transform, mesh
- `scripts/` — check-*, validate-*, wizard scripts
- `docs/VERIFICATION-GUARDS.md` — verify:all layout
