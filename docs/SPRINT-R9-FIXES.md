# Sprint R9: Post-Audit Remediation

Addresses findings from the comprehensive repository evaluation (2026-03-01).
Continues from R8 (partial) in `SPRINT-REMEDIATION.md`.

**Scope:** 5 phases — Security, CI Pipeline, Code Defects, Architecture, Tooling/DX.

---

## Implementation Status

| Phase | Status | Summary |
|-------|--------|---------|
| **S1** | **Done** | Security & data hygiene: bulk salt reuse fixed, signContent throws on failure, session tokens hashed at rest, runtime state files gitignored, test pollution cleaned, password min raised to 8, hashPinLegacy deprecated. 633 tests pass. |
| **S2** | **Done** | CI pipeline: integration tests + typecheck added to validate.yml, debug scaffolding removed from build.yml, artifact upload set to error, knip removed, c8 replaces regex coverage parsing, redundant test:runtime removed, schema validation deduplicated, format scope fixed, unified validate-schemas.js replaces shell loops. |
| **S3** | **Done** | Code defects: navigator.js full ES5 rewrite + strengthened gate (14 pre-existing violations surfaced in other runtime files), feature-flag bucket bias fixed (readUInt16BE), difficulty:0 falsy bug fixed, advisory file locking added, rate limiting on loginCreator, prototype pollution guard, O(n²) perf fixes in coverage + navigator, email validation, pseudoId entropy doubled, private key caching. 633 tests pass. |
| **S4** | **Done** | Architecture: `config.js` → `markdown-pipeline.js`, 7 camelCase files kebab-cased, 18 data files renamed underscore→hyphen (70+ refs across 22 files including Dockerfile/portal), dead files + 2 dead SWs + appcache removed, `src/runtime/` reorganized into 6 subdirectories (rendering, sensors, engine, telemetry, integrity, ui) with centralized `runtimeManifest.resolveFactoryPath`, `hub-tools/shared.js` split into 6 focused context modules (`data-paths`, `config`, `services`, `data-access`, `auth`, `http`). 633 tests pass. |
| **S5** | **Done** | Tooling/DX: ESLint expanded (+eqeqeq, no-throw-literal, curly; browser globals for runtime; warnings ratcheted to 120), deps standardized to ^semver, remark-html + vite removed, Node 18+22 CI matrix, 3 missing schemas added, RUNTIME_VERSION from package.json, env-config empty-string fix, archetype-match uses envConfig.dataDir. 633 tests pass. |

---

## Phase S1: Security & Data Hygiene

**Priority:** P0 — do first, some items are security-relevant.
**Duration:** 1 day.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **S1.1** | **Fix `createStudentsBulk` shared salt** | In `src/services/accounts.js`, the bulk creation path reuses the same PIN hash for all students in a batch. Each student must get a unique salt via a per-student call to `hashPin()`. | Each student in a bulk-created batch has a unique `salt` value. Unit test confirms distinct hashes for identical PINs across batch. |
| **S1.2** | **Make `signContent` throw on failure** | In `src/utils/crypto.js`, change the `catch` block (returns `null`) to throw an explicit error. Update `src/builders/html.js` to catch and report the error rather than silently producing unsigned lessons. Add a `--skip-signing` CLI flag for intentional unsigned builds. | Unsigned lesson output is impossible without `--skip-signing`. Failed signing aborts the build with a clear error message. |
| **S1.3** | **Hash session tokens at rest** | In `src/services/accounts.js`, store `SHA-256(token)` in `sessions.json` instead of the raw token. On lookup, hash the incoming token and compare. | Raw session tokens never appear in `sessions.json`. Existing sessions are invalidated on upgrade (acceptable for v0.1.0). |
| **S1.4** | **Gitignore runtime state files** | Add to `.gitignore`: `data/groups.json`, `data/mastery_summary.json`, `data/review_schedule.json`, `data/telemetry_events.json`, `data/learning_paths.json`, `data/feature_flags.json`, `data/parent-links.json`, `data/recommendation_overrides.json`. Run `git rm --cached` on each. Add a `scripts/init-data.js` script that creates these files with empty defaults if missing. Wire it into `postinstall` or document it in README. | `git status` shows no runtime state files. `npm run init:data` (or postinstall) creates them from empty templates. Tests already use temp dirs (R1.9). |
| **S1.5** | **Remove test pollution from `learning_paths.json`** | The file still has 7 "Test Path" entries despite R1.6 marking this as done. Reset to `{"paths": []}` before gitignoring. Audit test files to find the leak — a test is writing to `data/` instead of its temp dir. | The file contains `{"paths": []}` on disk. Offending test identified and fixed. |
| **S1.6** | **Remove `creator_accounts.json` from git history** | Already in `.gitignore` (good), but verify it was never committed. If it was committed historically, consider `git filter-repo` to scrub it, or document the exposure in `SECURITY.md`. | `git log --all -- data/creator_accounts.json` returns empty, or the exposure is documented with remediation status. |
| **S1.7** | **Increase minimum password length to 8** | In `src/services/accounts.js`, change the password length check from 6 to 8 characters. Update any tests that use 6-char passwords. | `registerCreator` rejects passwords shorter than 8 characters. |
| **S1.8** | **Add `@deprecated` marker to `hashPinLegacy`** | In `src/services/accounts.js`, add a JSDoc `@deprecated` tag to `hashPinLegacy` (bare SHA-256) explaining it exists only for migration and should never be used for new hashes. | JSDoc deprecation tag present. IDE shows strikethrough on usage. |

---

## Phase S2: CI Pipeline Integrity

**Priority:** P1 — the pipeline must stop lying.
**Duration:** 1 day.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **S2.1** | **Add integration tests to `validate.yml`** | Add step: `npm run test:integration` after unit tests. | Integration tests run on every push/PR. Pipeline fails if any integration test fails. |
| **S2.2** | **Add typecheck to `validate.yml`** | Add step: `npm run typecheck`. | `tsc --noEmit` runs in CI. Type errors break the build. |
| **S2.3** | **Remove debug step from `build.yml`** | Delete the "Debug - Check build output" step (lines 47–73). Also delete the "Show build summary" step (lines 85–88). These are debugging leftovers. | No `ls -la`, `pwd`, or `echo` diagnostic steps in `build.yml`. |
| **S2.4** | **Fix artifact upload to fail on missing files** | Change `if-no-files-found: warn` to `if-no-files-found: error` in `build.yml`. Remove the "so job stays green for debugging" comment. | Missing build artifacts fail the pipeline. |
| **S2.5** | **Remove knip from CI** | Delete the "Dead code check (knip)" step from `validate.yml`. Remove `knip` from `devDependencies` in `package.json`. Dead exports are covered by ESLint `no-unused-vars` (S5.1); dead files are handled manually in S4. Revisit if the project grows to multiple contributors. | `knip` not in `package.json`. No knip step in any workflow. |
| **S2.6** | **Replace regex coverage parsing with c8** | Install `c8` as a devDependency. Change `test:coverage` to `c8 --lines 85 --reporter=text --reporter=lcov node --test tests/unit/*.test.js`. Replace the shell regex parsing in `validate.yml` with a simple `npm run test:coverage` (c8 exits non-zero if below threshold). Upload `coverage/lcov.info` as an artifact. | Coverage threshold enforced by c8, not regex. Coverage report available as artifact. |
| **S2.7** | **Remove redundant `test:runtime` step** | Delete the "Run runtime module tests" step from `validate.yml`. Those 5 tests already run in the coverage step. Remove the `test:runtime` script from `package.json`. | No duplicate test execution. |
| **S2.8** | **Deduplicate `codegen:validate-schemas`** | Remove the schema validation step from `build.yml` (keep it in `validate.yml` only, which is the validation-focused workflow). | Schema validation runs once per push, not twice. |
| **S2.9** | **Fix format script scope mismatch** | Update `package.json` scripts `format` and `format:check` to match CI scope: `prettier --write "src/**/*.{js,ts}" "hub-tools/**/*.js" "server/**/*.js" "tests/**/*.js"`. | `npm run format` fixes everything CI checks. No false confidence. |
| **S2.10** | **Replace inline OLS validation with a script** | Create `scripts/validate-lessons.js` that reads all `lessons/*.yaml`, converts to JSON via `js-yaml`, and validates against `schemas/ols.schema.json` via the `ajv` API. Replace the unsafe shell loop in `validate.yml` (which interpolates filenames into JS strings) with `node scripts/validate-lessons.js`. | No temp files, no shell interpolation. Single `node` invocation. Filenames with special characters are safe. |
| **S2.11** | **Add data-file schema validation to CI** | In the same `scripts/validate-lessons.js` (or a separate `scripts/validate-data.js`), validate each `data/*.json` file against its matching schema. Currently CI only validates lessons and graph fixtures, not data files. | CI validates `hub_config.json`, `groups.json`, etc. against their schemas. A malformed data file breaks the build. |

---

## Phase S3: Code Defects

**Priority:** P2 — correctness and reliability bugs.
**Duration:** 2–3 days.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **S3.1** | **Full ES5 rewrite of `navigator.js`** | Chrome 49 (Android 6.0 WebView) is the deployment target. Convert all ES6+ syntax: (a) arrow functions → `function` expressions, (b) template literals → string concatenation, (c) `for...of` → indexed `for` loops or `forEach`, (d) `let`/`const` → `var`, (e) spread in function calls (`Math.min(...arr)`) → `Math.min.apply(Math, arr)`, (f) `Array.prototype.find/findIndex` → manual loops (buggy in Chrome 49), (g) destructuring → manual property access. Audit all other `src/runtime/` files for the same violations. | `test:es5` passes on every file in `src/runtime/`. Manual smoke test in Chrome 49 DevTools (or emulator) confirms no runtime errors. |
| **S3.1b** | **Strengthen `test:es5` gate** | The current regex check only catches `let`, `const`, arrow functions, template literals, `class`, and spread syntax. It misses ES6+ *APIs* that Chrome 49 lacks or has buggy implementations of: `Promise`, `Symbol`, `Map`, `Set`, `WeakMap`, `WeakSet`, `Object.assign`, `Object.entries`, `Object.values`, `Array.from`, `Array.of`, `Array.prototype.includes`, `String.prototype.includes`, `String.prototype.startsWith`, `String.prototype.endsWith`, `Number.isFinite`, `Number.isNaN`. Replace the inline regex one-liner in `package.json` with a proper `scripts/check-es5.js` that checks both syntax patterns AND API usage. | `scripts/check-es5.js` catches both `const x = 1` and `Object.assign({}, x)` in runtime files. |
| **S3.2** | **Fix feature-flag bucket bias** | In `src/utils/feature-flags.js`, change `hash[0] % 100` to `hash.readUInt16BE(0) % 10000` and compare against `rollout * 100`. This reduces bias from ~17% relative to <0.2%. | Unit test confirms uniform distribution across 10,000 synthetic student IDs (chi-squared test, p > 0.01). |
| **S3.3** | **Fix sidecar `difficulty: 0` falsy bug** | In `src/compiler/buildLessonIR.js`, change `ir.inferredFeatures.difficulty || meta.difficulty || 2` to use nullish coalescing: `ir.inferredFeatures.difficulty ?? meta.difficulty ?? 2`. This preserves difficulty `0` as a valid value. Apply the same pattern to any other `||`-based fallbacks where `0` or `''` are valid. | Unit test: lesson with `difficulty: 0` produces sidecar with `difficulty: 0`, not `2`. |
| **S3.4** | **Add file locking for flat-file storage** | Create `src/utils/file-lock.js` implementing advisory lockfiles: `fs.writeFileSync(path + '.lock', pid, { flag: 'wx' })` for exclusive creation, `fs.unlinkSync` on release, with a 10-second stale-lock timeout (force-remove and re-acquire). Zero npm dependencies — critical for Raspberry Pi where native modules are painful to cross-compile for ARM. Wrap all `loadJson → mutate → saveJson` cycles in `accounts.js`, `feature-flags.js`, and other state-mutating modules with lock acquisition. Provide both sync (`withLockSync`) and async (`withLock`) wrappers. | Concurrent `registerCreator` calls in a stress test (10 parallel on Pi-class hardware) produce no data loss. Lock files are cleaned up on process exit. |
| **S3.5** | **Add rate limiting to `loginCreator`** | Add a simple in-memory rate limiter (sliding window, 5 attempts per minute per email) to the login path in `src/services/accounts.js` or `hub-tools/routes/accounts.js`. Return 429 on excess attempts. | Unit test: 6th login attempt within 60s returns rate-limit error. |
| **S3.6** | **Fix `setFlag` prototype pollution** | In `src/utils/feature-flags.js`, validate flag names: reject `__proto__`, `constructor`, `prototype`. | Unit test: `setFlag('__proto__', ...)` throws. |
| **S3.7** | **Fix `aggregateCohortCoverage.js` O(n²) performance** | Replace `indexOf`-based dedup with `Set`. Pre-compute per-student skill maps in a single pass instead of re-iterating per UTU bucket. | Same output for the existing test fixture. Benchmark: 500 students × 50 UTU buckets runs in <50ms. |
| **S3.8** | **Fix navigator.js O(M×N) graph discount** | Replace `edges.find()` inside the nested `targetSkills × masteredSkills` loop with a `Map` keyed by `source->target`. Build the map once before the loop. | Same scoring output. Benchmark improvement measurable for 100+ mastered skills. |
| **S3.9** | **Deduplicate RELATED_MODES map** | Extract the related-modes map from both `navigator.js` and `archetypeMatch.js` into a shared constant in `src/types/` or `src/utils/constants.js`. Both files import from the single source. | `grep -r "RELATED.*MODES\|RELATED.*modes" src/` shows exactly one definition. |
| **S3.10** | **Fix `config.js` null input crash** | In `src/config.js` (`processMarkdown`), add an early guard: `if (typeof text !== 'string') return '';`. | Unit test: `processMarkdown(null)` returns empty string, doesn't throw. |
| **S3.11** | **Add email format validation** | In `src/services/accounts.js` `registerCreator`, add a basic email format check (must contain `@` and `.`). | Unit test: `registerCreator({ email: 'not-an-email' })` returns validation error. |
| **S3.12** | **Fix `generatePseudoId` collision risk** | Increase from 4 random bytes (32-bit) to 8 random bytes (64-bit). Birthday bound moves from ~65K to ~4 billion. | `generatePseudoId` returns a 16-character hex string (was 8). |
| **S3.13** | **Cache private key in `signContent`** | Read the PEM file once per process (lazy singleton), not on every call. Invalidate only if the file mtime changes. | Batch compilation of 100 lessons reads the key file once. |

---

## Phase S4: Architecture & Naming Cleanup

**Priority:** P3 — structural clarity. No behavior changes.
**Duration:** 2 days.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **S4.1** | **Rename `src/config.js` → `src/markdown-pipeline.js`** | Rename the file globally. Update all `require('../config')` and `require('./config')` references. This file processes Markdown — it is not configuration. | `grep -r "require.*config" src/` returns only references to `env-config.js`. |
| **S4.2** | **Establish kebab-case naming convention** | Rename camelCase files to kebab-case: `buildLessonIR.js` → `build-lesson-ir.js`, `archetypeMatch.js` → `archetype-match.js`, `lessonChain.js` → `lesson-chain.js`, `lessonSchema.js` → `lesson-schema.js`, `lessonAssembly.js` → `lesson-assembly.js`, `featureInference.js` → `feature-inference.js`. Update all `require()` paths. | Every `.js` file under `src/` uses kebab-case. `find src -name "*.js" \| grep "[A-Z]"` returns empty (except `README.md`). |
| **S4.3** | **Align data file names with schema names** | Rename `data/hub_config.json` → `data/hub-config.json`, `data/mastery_summary.json` → `data/mastery-summary.json`, `data/telemetry_events.json` → `data/telemetry-events.json`, etc. (underscore → hyphen). Update all `require()` and path references. Schema → data mapping becomes mechanical: strip `.schema` from the schema filename. | Every data file matches its schema name minus the `.schema` suffix. |
| **S4.4** | **Delete dead files** | Remove: `src/modules/README.md` (and the empty `src/modules/` dir), `server/appcache.manifest`, root `ARCHITECTURE.md` (stub), `docs/ARCHITECTURE-EVALUATION.md` (self-congratulatory; no engineering value). | Removed files no longer on disk or in git. |
| **S4.5** | **Consolidate service workers** | Audit `server/sw.js`, `server/pwa/sw.js`, and `src/runtime/sw.js`. Determine which are active and which are dead. Keep one per deployment target (hub server vs. client runtime). Delete the rest. Document the surviving SWs in ARCHITECTURE.md. | At most 2 service workers remain (one server-side, one client-side). Each has a clear owner documented in ARCHITECTURE.md. |
| **S4.6** | **Sub-organize `src/runtime/`** | Group the ~30 flat files into subdirectories: `rendering/` (svg-*, canvas, shell), `sensors/` (sensor-bridge, sensorTypes), `navigation/` (navigator, shared-runtime), `telemetry/` (telemetry, checkpoint), `integrity/` (integrity, sw). Update all internal `require()` paths. | No `src/runtime/*.js` files remain at the top level (all are in subdirectories). |
| **S4.7** | **Remove stale engine map gitignore entries** | Delete lines `src/engine/*.js.map` and `src/engine/*.d.ts.map` from `.gitignore` — no TypeScript compilation means no maps. | `.gitignore` has no engine-specific entries. |
| **S4.8** | **Clean up `hub-tools/shared.js` exports** | `shared.js` exports ~60 symbols as a de facto DI container. Split into logical groups: `hub-tools/context/auth.js`, `hub-tools/context/data.js`, `hub-tools/context/services.js`. Each route imports only what it needs. | `shared.js` either deleted or reduced to a thin re-export of the 3 context modules. No route file imports more than 10 symbols from context. |

---

## Phase S5: Tooling & Developer Experience

**Priority:** P4 — long-term quality.
**Duration:** 2 days.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **S5.1** | **Expand ESLint rules** | Add rules: `eqeqeq: 'error'`, `no-var: 'error'`, `no-shadow: 'warn'`, `no-throw-literal: 'error'`, `prefer-const: 'error'`, `no-implicit-globals: 'error'`. Add override for `src/runtime/` to disable `no-var` and `prefer-const` (ES5 target). Fix all resulting violations. | `npm run lint` passes with expanded ruleset. Zero warnings. |
| **S5.2** | **Standardize dependency version pinning** | Pin all deps to exact versions (remove `^`). Add a comment in `package.json` or a `docs/CONVENTIONS.md` entry explaining the policy: exact pins + Dependabot for updates. Verify `dependabot.yml` is configured for npm weekly updates. | Every version in `dependencies` and `devDependencies` is exact (no `^`, no `~`). Dependabot config targets npm. |
| **S5.3** | **Remove `remark-html` dependency** | It's deprecated; `remark-rehype` + `rehype-stringify` (already installed) is the replacement pipeline. Grep for any `require('remark-html')` usage — if none, just remove from `package.json`. If used, migrate to the rehype pipeline. | `remark-html` not in `package.json`. `npm ls remark-html` returns empty. |
| **S5.4** | **Remove `vite` devDependency or justify it** | `vite` is only used for `dev:vite` (a static file server). Either replace with `npx serve` (zero-install) or document why vite is needed. If replaced, remove from devDependencies. | Either vite is removed or a comment explains why it's necessary. |
| **S5.5** | **Add Node version matrix to CI** | In `validate.yml`, add a matrix strategy testing Node 18 and Node 22 (the `engines` field says `>=18`). Keep `build.yml` on a single version (production target). | `validate.yml` runs on Node 18 and 22. Both must pass. |
| **S5.6** | **Update stale documentation** | Fix `docs/ARCHITECTURE.md`: update directory tree to match reality (`.js` not `.ts`, include `hub-tools/routes/`, `src/governance/`, `src/services/`). Fill in the empty "Core Design Constraints" section. Fix `docs/playbooks/lms.md`: change all `index.ts` references to `index.js`. Remove "Next Step" AI residue from `docs/specs/threshold_grammar.md`. | `grep -r "index\.ts" docs/` returns empty. ARCHITECTURE.md tree matches `find src/ -type d`. |
| **S5.7** | **Add `.gitignore` entries for test/build artifacts** | Add: `.tsbuildinfo`, `playwright-report/`, `test-results/`, `.playwright/`. | All listed patterns appear in `.gitignore`. |
| **S5.8** | **Add missing schemas** | Create JSON Schemas for: `mastery-summary.schema.json`, `parent-links.schema.json`, `recommendation-overrides.schema.json`, `utu-constants.schema.json`. Wire into `codegen-validate-schemas.js`. This completes R7's remaining coverage gap. | `codegen-validate-schemas.js` validates all data files. 13/13 coverage. |
| **S5.9** | **Extract `RUNTIME_VERSION` from `package.json`** | In `src/builders/html.js`, replace hardcoded `RUNTIME_VERSION = '1.9.1'` with a read from `package.json` version field (or a dedicated `src/version.js` if the runtime version differs from the package version). | A single source of truth for the version string. No manual sync required. |
| **S5.10** | **Fix `env-config.js` empty string fallthrough** | Change `process.env[key] || fallback` to `process.env[key] ?? fallback` in `strVal` so that `AGNI_DATA_DIR=""` is respected as an explicit empty value rather than falling through to the default. | Unit test: setting env var to `""` returns `""`, not the fallback. |
| **S5.11** | **Fix `archetypeMatch.js` data path** | Change `require(path.join(__dirname, ...))` to use `envConfig.dataDir` so that `AGNI_DATA_DIR` is respected. Matches the pattern used in `feature-flags.js`. | Setting `AGNI_DATA_DIR=/custom` loads archetypes from `/custom/archetypes.json`. |

---

## Hardware Constraints (affects all phases)

The edge deployment targets are:
- **Student devices:** Android 6.0 Marshmallow — Chrome 49 WebView, limited RAM (512MB–1GB), intermittent or no connectivity.
- **Village hub:** Raspberry Pi — ARM CPU, SD card storage (slow random I/O, limited write endurance), Node 18+, single-process server.

These constraints mean:
- **No native npm dependencies** in production (cross-compilation for ARM is fragile). Pure JS only.
- **O(n²) algorithms matter** — the Pi has ~1/20th the CPU of a dev laptop. S3.7 and S3.8 are higher priority than they look.
- **File locking must be lightweight** — SD cards have high write latency. Lockfiles over SQLite.
- **`src/runtime/` is strict ES5** — no transpilation step, no polyfill bundle. Code runs directly in Chrome 49.
- **Write endurance** — SD cards degrade with writes. Minimize write frequency in state files (batch updates, write-if-changed patterns).

---

## Execution Order

```
Week 1:  S1 (security)  →  S2 (CI pipeline)
Week 2:  S3.1 + S3.1b (ES5 rewrite — largest single task, ~2 days)
         S3.2–S3.6 in parallel (each independent, ~0.5 day each)
Week 3:  S3.7–S3.13 (remaining defects)  →  S4.1–S4.4 (renames, dead files)
Week 4:  S4.5–S4.8 (structural cleanup)  →  S5 (tooling/DX)
```

S1 and S2 are independent and can be parallelized by different contributors.
S3.1 + S3.1b (ES5 rewrite + gate strengthening) is the largest single task — do it early in Week 2 so the improved gate catches regressions in later work.
S3 items (except S3.1b which depends on S3.1) are independent of each other.
S4.2 (naming convention) and S4.3 (data file renames) should be done in a single commit to minimize churn.
S5.6 (doc updates) should be done last — after S4 renames are merged, so the docs reflect the final file paths.

---

## Decision Log

Resolved based on hardware targets: Android 6.0 Marshmallow (refugee camp student devices) + Raspberry Pi (village hub).

1. **Chrome 49 is the target (S3.1): FULL ES5 REWRITE.**
   Android 6.0's stock WebView ships Chrome 49. This is non-negotiable — the system must run in refugee camps on the devices students actually have. `navigator.js` (and all `src/runtime/` files) must be strict ES5: no arrow functions, no template literals, no `for...of`, no spread in function calls, no `let`/`const`. The `test:es5` gate must also be strengthened beyond regex to catch ES6+ API usage (`Promise`, `Map`, `Set`, `Symbol`, `Object.assign`, `Array.from`, `Array.prototype.find`, etc.) since Chrome 49 lacks many of these or has buggy implementations.

2. **Advisory lockfiles for file locking (S3.4): NO NATIVE DEPS.**
   The Raspberry Pi hub rules out SQLite (compiled native module, painful ARM cross-compilation) and any npm package with native bindings. Strategy: atomic-rename lockfiles (`<file>.lock` created via `fs.writeFileSync` with `wx` flag for exclusive creation, removed on unlock, with stale-lock timeout). Zero dependencies, works on Pi's SD card filesystem. If a lock is stale (>10s old), force-remove and re-acquire.

3. **knip: REMOVED.** Dead exports covered by ESLint `no-unused-vars`; dead files handled in S4. Revisit if multi-contributor.

4. **Monorepo wiring for `portal/`:** Deferred to a future sprint. Too large for R9.

---

## Verification

After all phases complete:

```bash
npm run lint              # zero warnings
npm run typecheck         # zero errors
npm run test:all          # all unit + integration + contract + graph pass
npm run test:coverage     # ≥85% line coverage via c8
npm run test:es5          # runtime ES5 compliance (if Chrome 49 kept)
git status                # no runtime state files tracked
git diff --stat main      # all changes accounted for
```
