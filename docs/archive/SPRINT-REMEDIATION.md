# Sprint Plan: Codebase Remediation

Eight phases addressing critical bugs, data integrity, configuration drift, silent failures, documentation rot, security gaps, missing schemas, and architectural cleanup identified in the post-D12 audit.

**Prerequisite:** All sprints in `docs/SPRINT-DRY-REFACTOR.md` are complete (D7–D12).

**Reference:** Post-D12 audit findings, `docs/CONVENTIONS.md`, `docs/SPRINT-PLAN.md`.

---

## Implementation Status

| Phase | Status | Summary |
|-------|--------|---------|
| **R1** | **Done** | Engine de-TypeScript (index.ts → index.js + JSDoc); stale compiled artifacts removed from git; data files decontaminated (35+ test entries purged); hub_config.json fixed. 633 tests pass. |
| **R2** | **Done** | `shared.js`, `sentry.js`, `sync.js` migrated to `envConfig`; `MASTERY_THRESHOLD` centralized; duplicate `_randomCode` removed; zero `process.env.AGNI_*` reads outside config modules. 633 tests pass. |
| **R3** | **Done** | `selectBestLesson` integration test added (8 tests: null handling, candidate filtering, observation-driven selection, unknown student, ontologyMap support). 665 tests pass (633 unit + 32 integration). |
| **R4** | **Done** | PageRank silent catch now logs; 31 `console.*` calls in 7 server-side modules migrated to structured logger. 633 tests pass. |
| **R5** | **Done** | ARCHITECTURE.md section ordering fixed; 4 stale cross-references removed; hardware baseline standardized to Android 6.0+; teacher override evaluation updated; LMS playbook Node version fixed; AI artifact removed from threshold_grammar.md; version comment removed from config.js; docs/README.md index created. |
| **R6** | **Done** | Sentry CORS wildcard fallback removed; MD5 replaced with SHA-256 in feature flags; `migrateLegacyPins` enhanced (reports SHA-256 count) and wired into theta.js startup; `generateCode` exported from accounts. 633 tests pass. |
| **R7** | **Done** | 6 new JSON Schemas: hub-config, groups, feature-flags, learning-paths, review-schedule, telemetry-events. All data files validate. Total schema coverage: 9/13 data files (remaining: mastery_summary, parent-links, recommendation_overrides, utu-constants). |
| **R8** | **Partial** | CI `build.yml` fixed (node-version-file); `build:engine` step removed from both CI workflows; `tsconfig.engine.json` deleted. shared.js split done (R9 S4.8), file locking done (R9 S3.4), cursor rules done. Remaining: sentry retention (→ R16 C3.2), PageRank cache cleanup (→ R16 C3.3). |

---

## Phase R1: Engine De-TypeScript & Data Integrity

**Goal:** Eliminate the compiled-JS-diverges-from-TS-source class of bug permanently by converting the one TypeScript file back to JavaScript, and purge test data from committed files.

**Duration:** 1 day. High priority — the runtime may be executing stale code.

**Context:** `src/engine/index.ts` is the only TypeScript source file in the engine. It gets compiled to `src/engine/index.js` which is what Node actually `require()`s. The compiled `.js` has diverged from the `.ts` — it's missing Markov/PageRank integration, uses `JSON.parse(JSON.stringify)` instead of `structuredClone`, and re-parses `process.env` instead of using `envConfig`. The `.gitignore` lists the compiled files but they were committed before the ignore entry was added.

Every other engine module (`rasch.js`, `thompson.js`, `embeddings.js`, `federation.js`, `math.js`, `markov.js`, `pagerank.js`) is plain JavaScript with types provided via JSDoc annotations and `.d.ts` sidecar files. The `tsconfig.json` has `checkJs: true` so type safety is enforced on `.js` files without a compile step. Converting `index.ts` to `index.js` + JSDoc aligns it with the rest of the engine and eliminates the build step that caused the divergence.

The target runtime is Android 6.0+ (Marshmallow) which only runs ES5 JavaScript. Introducing TypeScript as an intermediate step — converting JavaScript to TypeScript only to compile it back to JavaScript — adds a build step, a class of divergence bugs, and a dependency (the TypeScript compiler) with no proportional benefit, since JSDoc + `.d.ts` already provides equivalent type safety for the rest of the engine.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R1.1** | **Convert `src/engine/index.ts` to `src/engine/index.js`** | Mechanical conversion: (a) Remove `import type` line. (b) Replace TypeScript parameter/return type annotations with JSDoc `@param`/`@returns` using `{import('../types').LMSState}` syntax (matching `rasch.js`, `thompson.js`, etc.). (c) Remove `as unknown` cast, `Record<>` inline types. (d) Rename file from `.ts` to `.js`. (e) Add `'use strict';` at top. The result is functionally identical JavaScript that Node loads directly — no compile step. | `node -e "require('./src/engine')"` loads without error. `selectBestLesson` uses Markov/PageRank scoring. All engine tests pass. |
| **R1.2** | **Remove stale compiled artifacts from git** | Run `git rm --cached src/engine/index.js src/engine/index.d.ts src/engine/index.js.map src/engine/index.d.ts.map` (these are the old compiled outputs that git still tracks despite `.gitignore`). The new hand-written `index.js` is tracked normally. Update `.gitignore` to remove the engine compiled output entries (lines 41–44) since there are no compiled outputs anymore. | `git ls-files src/engine/index.js` shows the new hand-written file. No `.js.map` or `.d.ts.map` artifacts. |
| **R1.3** | **Remove `tsconfig.engine.json` and `build:engine` script** | Delete `tsconfig.engine.json`. Remove the `"build:engine"` entry from `package.json` scripts. Remove any CI steps that run `npm run build:engine`. Keep `tsconfig.json` (it provides `checkJs` type checking and IDE intellisense for all `.js` files). | No engine-specific TypeScript build config. `npm run typecheck` still validates types via JSDoc. |
| **R1.4** | **Reset `data/groups.json`** | Replace contents with `{"groups": []}`. | File contains zero test artifacts. |
| **R1.5** | **Reset `data/telemetry_events.json`** | Replace contents with `{"events": []}`. | File contains zero test artifacts. |
| **R1.6** | **Reset `data/learning_paths.json`** | Replace contents with `{"paths": []}`. | File contains zero test artifacts. |
| **R1.7** | **Reset `data/review_schedule.json`** | Remove `test-student` entries. Preserve any legitimate seed data. | No `test-student` references in committed data files. |
| **R1.8** | **Reset `data/mastery_summary.json`** | Remove `test-student` entries. Preserve structure. | No `test-student` references in committed data files. |
| **R1.9** | **Fix test isolation** | Audit test files that write to `data/`. Tests must use a temp directory (most already do via `tempDir()`). Find any tests that write directly to `data/` and fix them to use temp dirs. | `npm test` run on a clean checkout leaves `data/` files unchanged. |
| **R1.10** | **Fix `data/hub_config.json` empty `dataDir`** | Either remove the `dataDir` key (let `env-config.js` provide the default) or set it to a valid relative path. | `hub_config.json` has no empty-string values. |

**Verification:** `node -e "require('./src/engine')"` loads cleanly. All engine tests pass. `npm run typecheck` passes (JSDoc types validated). No TypeScript compile step exists. `data/` files contain only seed/empty defaults.

---

## Phase R2: Configuration Consolidation

**Goal:** Make `src/utils/env-config.js` the single source of truth. Eliminate all inline `process.env` parsing outside of `env-config.js` itself.

**Duration:** 2 days. Medium priority — correctness risk if defaults drift.

**Context:** `envConfig` was built during tech debt sprints but only ~40% of server modules use it. `hub-tools/shared.js`, `hub-tools/sentry.js`, `hub-tools/sync.js`, and the compiled `src/engine/index.js` all re-parse `process.env` with their own fallbacks. `sentry.js` even imports `envConfig` on line 10 and then ignores it on line 17. Constants like `MASTERY_THRESHOLD = 0.6` are defined in 3 files. `_randomCode()` is duplicated between `shared.js` and `accounts.js`.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R2.1** | **Migrate `hub-tools/shared.js` to `envConfig`** | Replace `process.env.AGNI_DATA_DIR \|\| path.join(...)` (line 18) and `process.env.AGNI_THETA_PORT` (line 35) with `envConfig.dataDir` and `envConfig.thetaPort`. | Zero `process.env` reads in `shared.js`. |
| **R2.2** | **Migrate `hub-tools/sentry.js` to `envConfig`** | Replace `process.env.AGNI_DATA_DIR` (line 17), `process.env.AGNI_SENTRY_PORT` (line 25), `process.env.AGNI_ANALYSE_AFTER` (line 26), `process.env.AGNI_ANALYSE_CRON` (line 27) with `envConfig.*`. Remove the unused `envConfig` import if already present, or use it. | Zero `process.env` reads in `sentry.js` (except for `loadHubConfig` bootstrap). |
| **R2.3** | **Migrate `hub-tools/sync.js` to `envConfig`** | Replace inline `process.env` parsing with `envConfig.*`. | Zero `process.env` reads in `sync.js`. |
| **R2.4** | **Centralize `MASTERY_THRESHOLD`** | Add `masteryThreshold` to `envConfig` (default `0.6`). Replace the 3 definitions in `shared.js:38`, `sentry.js:31`, `aggregateCohortCoverage.js:6`. | `MASTERY_THRESHOLD` defined in one place. Changing it is a one-env-var edit. |
| **R2.5** | **Deduplicate `_randomCode()`** | Remove the copy in `hub-tools/shared.js:90-103`. Import from `src/services/accounts.js` (which already exports it), or extract to a shared util. | One implementation of random code generation. |
| **R2.6** | **Extract scoring weights to config** | Move the hardcoded weights in `selectBestLesson` (`BIGRAM_WEIGHT = 0.10`, `DROPOUT_PENALTY_WEIGHT = 0.20`, `COOLDOWN_PENALTY_WEIGHT = 0.30`) to `envConfig` with sensible defaults. Note: after R1.1, these live in `src/engine/index.js` (the hand-written JS, not compiled output). | Scoring weights are tunable via environment variables without code changes. |
| **R2.7** | **Audit for remaining `process.env` reads** | `grep -r "process.env" src/ hub-tools/ scripts/` and verify each is either in `env-config.js`, `env-validate.js`, `hub-config.js`, or has a documented reason (e.g., `NODE_ENV` checks). | Every `process.env` access outside config modules is documented or eliminated. |

**Verification:** All tests pass. `grep -rn "process.env.AGNI_" hub-tools/` returns zero matches (only config modules reference `process.env`).

---

## Phase R3: Test Coverage & Isolation

**Goal:** Close the remaining test gaps on integration paths and prevent test data leakage.

**Duration:** 3–4 days. Medium priority — untested integration paths are invisible failure modes.

**Context:** Unit tests exist for PageRank (277 lines) and Markov (293 lines). The gap is integration testing of composite paths: `selectBestLesson` (which combines Thompson + Markov + PageRank + embedding scores), the Sentry analysis pipeline, and theta scheduling logic. Additionally, some test files mutate `process.env.AGNI_DATA_DIR` at module scope, which could leak between test files.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R3.1** | **Add `selectBestLesson` integration test** | New test file `tests/integration/select-best-lesson.test.js`. Tests: (a) returns a lesson with valid scores, (b) respects cooldown penalties, (c) Markov bigram weighting affects ordering, (d) PageRank scores are incorporated, (e) override lessons take priority, (f) graceful degradation when Markov/PageRank data is empty. | Composite scoring function has end-to-end test coverage. |
| **R3.2** | **Add Sentry pipeline tests** | New test file `tests/unit/sentry.test.js`. Tests: (a) event ingestion and NDJSON buffering, (b) contingency table updates, (c) chi-squared computation produces expected values, (d) graph weight output format, (e) cohort discovery. | Sentry analysis logic is unit-tested. |
| **R3.3** | **Add theta scheduling tests** | New test file `tests/unit/theta-scheduling.test.js`. Tests: (a) `computeLessonOrder` sorting, (b) `expandScheduledSkills` expansion, (c) frustration penalty application, (d) override injection, (e) caching behavior. | Theta business logic is unit-tested separately from HTTP concerns. |
| **R3.4** | **Fix `process.env` leakage in tests** | Wrap all `process.env.AGNI_DATA_DIR = ...` assignments in test files with save/restore in `before`/`after` hooks. Or use `t.before`/`t.after` from `node:test`. | Running tests in any order produces the same results. No env leakage. |
| **R3.5** | **Add test cleanup assertion** | Add a CI step or test helper that verifies `data/*.json` files are unchanged after `npm test`. Fail CI if tests pollute committed data files. | Test pollution is caught automatically. |

**Verification:** All new and existing tests pass. CI verifies data file integrity post-test.

---

## Phase R4: Silent Failures & Observability

**Goal:** Ensure failures in the hot path are logged, metered, and visible. Migrate server-side `console.*` calls to the structured logger.

**Duration:** 2 days. Medium priority — invisible failures erode trust in the adaptive engine.

**Context:** `selectBestLesson` silently swallows PageRank errors with an empty catch. There are ~124 `console.log/warn/error` calls across `src/`. Runtime files (`src/runtime/`) are ES5 browser code that legitimately can't use the Node logger — those are fine. The concern is server-side Node.js code: `src/builders/html.js` (11), `src/utils/lesson-validator.js` (8), `src/cli.js` (10), `src/services/compiler.js` (5), `src/utils/katex-css-builder.js` (3), `src/utils/crypto.js` (1).

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R4.1** | **Log PageRank failures in `selectBestLesson`** | Replace the empty `catch(_)` (engine/index.ts ~line 303) with `catch(err) { log.warn('PageRank scoring failed, falling back', { error: err.message }); }`. | PageRank failures appear in structured logs. |
| **R4.2** | **Audit all empty catch blocks** | Search for `catch\s*\(` and `catch\s*\{` across `src/` and `hub-tools/`. For each: (a) if truly best-effort (file existence checks, backup copies), add a one-line comment; (b) if swallowing real errors, add logging. | Every empty catch has either a log statement or a comment explaining why silence is intentional. |
| **R4.3** | **Migrate server-side `console.*` to logger** | In `src/builders/`, `src/utils/` (non-runtime), `src/services/`, and `src/cli.js`: replace `console.log/warn/error` with `log.info/warn/error` from `createLogger`. Skip `src/runtime/` (browser code). | Zero `console.*` calls in server-side Node modules (outside `src/runtime/` and `src/cli.js` top-level). |
| **R4.4** | **Add degradation telemetry** | When `selectBestLesson` falls back due to a caught error (PageRank, Markov), emit a lightweight event (e.g., increment a counter in the engine state or emit to the log) so operators can monitor degradation frequency. | Operators can detect if the engine is consistently running in degraded mode. |

**Verification:** All tests pass. `grep -rn "console\." src/builders/ src/utils/ src/services/` returns only `src/runtime/` files (excluded) or zero results.

---

## Phase R5: Documentation Accuracy

**Goal:** Fix all stale cross-references, contradictions, ordering bugs, and leftover AI artifacts in docs.

**Duration:** 2 days. Low-medium priority — bad docs erode contributor trust.

**Context:** The docs volume is impressive (28 files) but has accumulated rot. Section ordering in `ARCHITECTURE.md` is broken (1, 5, 6, 7, 8, Appendix, 2, 3, 4). Cross-references point to deleted or nonexistent files. The hardware baseline is stated inconsistently across docs. A spec file ends with an AI chat prompt.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R5.1** | **Fix `ARCHITECTURE.md` section ordering** | Reorder sections to: 1, 2, 3, 4, 5, 6, 7, 8, Appendix. No content changes — purely structural. | Sections are in sequential order. |
| **R5.2** | **Remove stale `SPRINT-NEXT.md` reference** | In `docs/ROADMAP.md` line 7: replace the reference to `docs/SPRINT-NEXT.md` with a reference to `docs/SPRINT-PLAN.md` (which is where that content was consolidated, per `SPRINT-PLAN.md` line 174). | No references to deleted files. |
| **R5.3** | **Standardize hardware baseline** | Grep for "Android 4.0", "Android 6.0", "Chrome 44", "Chrome 49" across all docs. Standardize to **Android 6.0+ (Marshmallow), Chrome 49+ WebView** which is the actual target per the ES5 gate and runtime constraints. Update `ARCHITECTURE.md`, `ARCHITECTURE-EVALUATION.md`, and any other docs with the old "Android 4.0+" claim. | One consistent hardware baseline across all documentation. |
| **R5.4** | **Update `ARCHITECTURE-EVALUATION.md` re: teacher override** | The evaluation says teacher override is "Not implemented" and a "Gap". Sprint 2 T1 implemented it. Update the evaluation to reflect current state. | Evaluation matches reality. |
| **R5.5** | **Update LMS playbook Node version** | `docs/playbooks/lms.md` says "Do not add new dependencies without ensuring Node 14 compatibility". Change to Node 18+ (per `package.json` engines field). | No stale Node version references in playbooks. |
| **R5.6** | **Clean `threshold_grammar.md` AI artifact** | Remove the "Do you want the Regex Pattern to add to your JSON Schema now?" prompt from the end of `docs/specs/threshold_grammar.md`. | Spec document ends professionally. |
| **R5.7** | **Remove stale `SCHEMA_SPEC.md` reference** | `docs/YEAR2-PREP.md` line 81 references `docs/SCHEMA_SPEC.md` which doesn't exist. Either remove the reference or point to `schemas/ols.schema.json`. | No references to nonexistent files. |
| **R5.8** | **Fix `src/config.js` version comment** | Line 2 says "v1.8.0" but `package.json` is `0.1.0`. Either remove inline version comments (they always go stale) or sync them. Recommendation: remove them. | No misleading version numbers in comments. |
| **R5.9** | **Add `docs/README.md` index** | Create a brief index of all 28+ doc files organized by category (Architecture, Conventions, Sprints, Playbooks, Specs, Tutorials). One-line description per file. | New contributors can navigate the docs directory. |
| **R5.10** | **Add `CHANGELOG.md`** | Create a changelog following Keep a Changelog format. Backfill from sprint completion notes (tech debt 0–6, DRY D7–D12, feature sprints 1–6). | Project has a changelog. `YEAR2-PREP.md` TODO is resolved. |

**Verification:** `grep -rn "SPRINT-NEXT" docs/` returns zero. `grep -rn "Android 4" docs/` returns zero. `grep -rn "Node 14" docs/` returns zero. All cross-references resolve to existing files.

---

## Phase R6: Security Hardening

**Goal:** Close the three identified security gaps.

**Duration:** 1–2 days. Medium priority — CORS and legacy PINs are exploitable.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R6.1** | **Fix Sentry CORS fallback** | In `hub-tools/sentry.js`, the CORS header uses `envConfig.corsOrigin \|\| '*'`. Since `envConfig.corsOrigin` defaults to `'null'` (which is truthy), the `\|\|` fallback should never trigger. But if someone sets `AGNI_CORS_ORIGIN=""`, it falls back to `*`. Fix: use `envConfig.corsOrigin` directly (it always has a default). Remove the `\|\| '*'` fallback. | CORS origin is always explicitly set. No wildcard fallback path. |
| **R6.2** | **Proactive legacy PIN migration** | Add a `migrateAllLegacyPins()` function in `src/services/accounts.js` that scans all student records, identifies those with unsalted SHA-256 `pinHash` (no `pinSalt` field), and re-hashes with scrypt. Call this once during hub startup. Log the count of migrated records. | All student PINs use scrypt. No unsalted SHA-256 hashes remain after first startup. |
| **R6.3** | **Replace MD5 in feature flag bucketing** | In `src/utils/feature-flags.js` line 56, replace `crypto.createHash('md5')` with `crypto.createHash('sha256')`. Both are equally performant for hash-based bucketing; SHA-256 won't be flagged in audits. | Zero MD5 usage in the codebase. |

**Verification:** All tests pass. `grep -rn "createHash('md5')" src/` returns zero. Sentry responds with correct CORS headers.

---

## Phase R7: Schema Coverage

**Goal:** Add JSON Schema validation for all data files, not just governance artifacts.

**Duration:** 3 days. Low-medium priority — prevents silent data corruption.

**Context:** Only 3 of 13 `data/*.json` files have schemas (`approved_catalog`, `governance_policy`, `graph_weights`). The remaining 10 — including critical operational files like `hub_config`, `groups`, `feature_flags`, `learning_paths`, `mastery_summary` — have no validation. `hub_config.json` and `hub_config.pi.json` have different shapes with no enforcement.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R7.1** | **Schema for `hub_config`** | New `schemas/hub-config.schema.json`. Properties: `dataDir`, `serveDir`, `yamlDir`, `factoryDir`, `katexDir`, `thetaPort`, `servePort`, `sentryPort`, `hubId`. All optional with defaults matching `env-config.js`. | Both `hub_config.json` and `hub_config.pi.json` validate against the schema. |
| **R7.2** | **Schema for `groups`** | New `schemas/groups.schema.json`. Properties: `groups` array of `{ id, name, studentIds, createdAt, updatedAt }`. | `data/groups.json` validates. Routes that save groups validate before writing. |
| **R7.3** | **Schema for `feature_flags`** | New `schemas/feature-flags.schema.json`. Properties: `flags` array of `{ id, name, enabled, rolloutPercent, metric, createdAt }`. | `data/feature_flags.json` validates. Flag CRUD endpoints validate before writing. |
| **R7.4** | **Schema for `learning_paths`** | New `schemas/learning-paths.schema.json`. Properties: `paths` array of `{ id, name, description, skills, createdAt, updatedAt }`. | `data/learning_paths.json` validates. |
| **R7.5** | **Schema for `review_schedule`** | New `schemas/review-schedule.schema.json`. | `data/review_schedule.json` validates. |
| **R7.6** | **Schema for `telemetry_events`** | New `schemas/telemetry-events.schema.json`. | `data/telemetry_events.json` validates. |
| **R7.7** | **Validate on load** | Extend `loadJSONAsync` or add a wrapper `loadValidatedJSON(path, schemaPath)` that validates after parsing. Integrate into the relevant service modules for the newly-schema'd files. | Data corruption is caught at load time with a clear error message. |
| **R7.8** | **Add schema validation to CI** | Extend the existing `validate.yml` schema validation step to cover all new schemas against their corresponding `data/*.json` files. | CI catches schema violations in committed data files. |

**Verification:** `npm run validate` covers all data files. All schemas are syntactically valid. CI passes.

---

## Phase R8: Architectural & DX Cleanup

**Goal:** Address structural issues that don't fit neatly into the above phases: the `shared.js` God Module, concurrent write safety, data retention, CI consistency, and developer experience.

**Duration:** 4–5 days. Lower priority — important for long-term maintainability.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **R8.1** | **Split `hub-tools/shared.js`** | Break into focused modules: `hub-tools/data-paths.js` (path constants, data accessors), `hub-tools/middleware.js` (adminOnly, requireLms, withRateLimit, requireParam), `hub-tools/hub-helpers.js` (remaining utility functions). `shared.js` becomes a thin re-export barrel for backward compatibility. | No single module exports 50+ symbols. Each module has a clear responsibility. |
| **R8.2** | **Add advisory file locking for JSON writes** | Create `src/utils/file-lock.js` with a simple lock-file mechanism (`<path>.lock` with PID + timestamp, auto-expire after 30s). Integrate into `saveJSONAsync`. This prevents lost updates when theta, sentry, and sync write concurrently. | Concurrent writes to the same JSON file are serialized. Lock files are auto-cleaned on stale locks. |
| **R8.3** | **Add Sentry data retention** | Add a `pruneSentryEvents(maxAgeDays)` function that removes NDJSON event files older than `maxAgeDays` (default 90). Call during Sentry startup and after each analysis pass. | Event directory doesn't grow unbounded. Retention is configurable via `AGNI_SENTRY_RETENTION_DAYS`. |
| **R8.4** | **Fix `build.yml` node version** | Replace `node-version: 20` with `node-version-file: '.nvmrc'` to match `validate.yml`. | All CI workflows derive Node version from `.nvmrc`. |
| **R8.5** | **Clean PageRank global cache for testability** | Add a `resetCache()` function exported from `pagerank.js` for test use. Document the global cache invariant. Remove the undocumented `_cache._currGraph` smuggled field. | PageRank tests can reset state between runs. No undocumented cache fields. |
| **R8.6** | **Add `.cursor/rules` for LLM consistency** | Create cursor rules documenting: ES5 constraint for `src/runtime/`, `envConfig` for all config access, structured logger for server-side code, atomic writes for JSON persistence, test isolation requirements. | AI assistants follow project conventions automatically. |

**Verification:** All tests pass. `npm run lint` clean. CI green on all workflows.

---

## Dependency Summary

```
Phase R1 (Engine/Data) ──── highest priority, do first ────────────┐
                                                                     │
Phase R2 (Config) ──── depends on R1.1 (engine de-TS) ──────────────┤
                                                                     │
Phase R3 (Tests) ──── depends on R1.9 (test isolation) ─────────────┤
                                                                     │
Phase R4 (Observability) ──── independent, can parallel R2/R3 ──────┤
                                                                     │
Phase R5 (Docs) ──── fully independent, can parallel anything ──────┤
                                                                     │
Phase R6 (Security) ──── depends on R2.2 (sentry envConfig) ────────┤
                                                                     │
Phase R7 (Schemas) ──── depends on R1.4–R1.8 (clean data files) ────┤
                                                                     │
Phase R8 (Architecture) ──── after R2 (shared.js uses envConfig) ───┘
```

---

## Recommended Order

| Order | Phase | Duration | Focus | Parallel? |
|-------|-------|----------|-------|-----------|
| 1 | **R1** | 1 day | Engine build fix + data decontamination | — |
| 2 | **R5** | 2 days | Documentation fixes | Parallel with R1 |
| 3 | **R2** | 2 days | Configuration consolidation | After R1 |
| 4 | **R4** | 2 days | Silent failure logging | Parallel with R2 |
| 5 | **R6** | 1–2 days | Security hardening | After R2.2 |
| 6 | **R3** | 3–4 days | Test coverage + isolation | After R1.9 |
| 7 | **R7** | 3 days | Schema coverage | After R1.4–R1.8 |
| 8 | **R8** | 4–5 days | Architectural cleanup | After R2 |

**Total estimated duration:** ~3 weeks (with parallelization), ~4–5 weeks sequential.

---

## Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| TypeScript compile step for engine | 1 (divergence-prone) | 0 (plain JS + JSDoc, no build step) |
| `process.env` reads outside config modules | 11+ | 0 |
| `MASTERY_THRESHOLD` definitions | 3 | 1 |
| Duplicate utility functions (`_randomCode`) | 2 | 1 |
| Silent catch blocks in hot paths | 3+ | 0 (all logged) |
| `console.*` in server-side Node code | ~40 | 0 (structured logger) |
| Stale doc cross-references | 4+ | 0 |
| Documentation contradictions | 4+ | 0 |
| CORS wildcard fallback paths | 1 | 0 |
| Legacy unsalted PIN hashes | Unknown count | 0 (proactive migration) |
| MD5 usage | 1 | 0 |
| Data files with JSON Schema | 3/13 | 13/13 |
| Test data in committed files | 35+ entries | 0 |
| `shared.js` exports | 50+ | Split into 3 focused modules |
| Concurrent write protection | None | Advisory file locking |

---

## Corrections from Initial Audit

The following items from the initial audit were found to be inaccurate or already addressed:

1. **PageRank and Markov test coverage** — Tests exist (`pagerank.test.js`: 277 lines, `markov.test.js`: 293 lines). The gap is integration testing of `selectBestLesson`, not unit testing of the individual modules.
2. **`.gitignore` for compiled engine** — The `.gitignore` entries exist (lines 41–44), but the files were committed before the ignore was added. Phase R1 now eliminates the TypeScript source entirely (converting to JS + JSDoc), removing the compiled output, the build step, and the `.gitignore` entries.
3. **Phase 1C in `SPRINT-PLAN.md`** acknowledged a data cleanup for `learning_paths.json` and `review_schedule.json`, but the files still contain test artifacts. The cleanup was either incomplete or tests re-polluted them.

## Design Decision: Why JS + JSDoc Instead of TypeScript

`src/engine/index.ts` was the only `.ts` source file in the engine. All other engine modules (`rasch.js`, `thompson.js`, `embeddings.js`, `federation.js`, `math.js`, `markov.js`, `pagerank.js`) use plain JavaScript with type safety via JSDoc + `.d.ts` sidecars, enforced by `tsconfig.json` with `checkJs: true`.

The TypeScript file introduced a build step (`tsc -p tsconfig.engine.json`) that produced a compiled `.js` file. This created a class of bug where the compiled output diverged from the source — the exact bug that triggered this remediation. The compiled `.js` was missing Markov/PageRank integration, used `JSON.parse(JSON.stringify)` instead of `structuredClone`, and parsed `process.env` inline instead of using `envConfig`.

Converting to JS + JSDoc:
- **Eliminates the build step** — Node loads the source directly; no compilation, no divergence risk
- **Matches the rest of the engine** — consistent patterns across all 8 engine modules
- **Preserves type safety** — JSDoc annotations + `.d.ts` sidecars + `checkJs: true` provide equivalent IDE support and type checking
- **Removes a dependency from the critical path** — the TypeScript compiler is no longer needed to run the engine
- **Aligns with the deployment target** — TypeScript must be transpiled to JavaScript before execution; since the entire system ultimately runs JavaScript (ES5 in the browser, CommonJS on the hub), keeping the source as JavaScript avoids an unnecessary transformation layer

---

## References

- **Post-D12 audit** — Findings from comprehensive codebase review
- **DRY refactor sprints** — `docs/SPRINT-DRY-REFACTOR.md` (D7–D12, all complete)
- **Tech debt sprints** — `docs/SPRINT-TECH-DEBT.md` (0–6, all complete)
- **Conventions** — `docs/CONVENTIONS.md`
- **API contract** — `docs/api-contract.md`
