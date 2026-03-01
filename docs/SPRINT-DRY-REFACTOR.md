# Sprint Plan: DRY Violations & Architectural Complexity

Six sprints addressing cross-cutting DRY violations, pass-through abstraction layers, God Functions, and inconsistent patterns identified in the post-Sprint-6 code review. All runtime changes preserve ES5 compatibility per the Android 6.0 constraint.

**Prerequisite:** All sprints in `docs/SPRINT-TECH-DEBT.md` are complete (Sprints 0–6 + Caching).

**Reference:** DRY/complexity audit findings, `docs/CONVENTIONS.md`, `docs/playbooks/runtime.md`.

---

## Implementation Status

| Sprint | Status | Summary |
|--------|--------|---------|
| **Sprint D7** | **Done** | Service layer DRY extraction: `safeYamlLoad`, `buildIRWithSidecar`, `sanitizeCreator`, `findStudentWithData`, `buildStudentRecord`, `purgeExpiredSessions`, `sanitizeSlug`, `DEFAULT_YAML_DIR`; `lessonChain.js` migrated to async json-store. 549+46 tests pass. |
| **Sprint D8** | **Done** | `adminOnly`, `requireLms`, `withRateLimit` middleware; `requireParam`, `getStudentSkills`, `loadTelemetryEventsAsync` helpers; 20+ try/catch blocks removed; `author.js` migrated to async/await; 12 dead sync accessors removed; `shared.js` 175→213 lines (net +38 middleware), route files collectively −120 lines. 550 tests pass. |
| **Sprint D9** | **Done** | `SchemaBackedJsonStore` factory; `policy.js` 107→45 lines, `catalog.js` 189→128 lines; structured `{ message, severity }` issues in evaluateLessonCompliance; `services/governance.js` 73→50 lines. 550 tests pass. |
| **Sprint D10** | **Done** | `parseDurationMs`, `el()`, `formatRemainingAttempts` moved to AGNI_SHARED; `resolveDirective` fallback removed from player.js; duplicate `addAriaToElement` removed from completion.js; dead `base64ToBytes`/`concatBytes` fallbacks removed from integrity.js; trivial wrappers removed from player.js; `renderStep()` decomposed into dispatch table + `renderContentStep`. 550 tests pass. |
| **Sprint D11** | **Done** | `selectBestLesson` state mutation fixed (scoring uses shallow copy instead of mutating `_state`); `DEFAULT_*` aliases removed from `engine/index.ts` and `migrations.js` (read `envConfig.*` directly); `ensureBanditInitialized` centralized to load/reload; `writeIfNewer`/`copyIfNewer`/`escapeHtml` extracted to `src/utils/io.js`; `html.js` and `katex-css-builder.js` use shared I/O helpers; `hub-transform.js` uses shared `escapeHtml`; `inferFeatures()` decomposed into 6 sub-functions. 550 tests pass. |
| **Sprint D12** | **Done** | `runCompilePipeline` returns `{ error }` instead of throwing (service-layer convention); `author.js` migrated from `var` to `const`/`let`; `lms.js` 104 lines reduced to Proxy-based delegation (~55 lines); binding-hash contract test added (3 tests); `CONVENTIONS.md` updated with error conventions, middleware patterns, schema-store, shared runtime, and I/O utility docs. 553 tests pass. |

---

## Sprint D7: Service Layer DRY Extraction

**Goal:** Eliminate the densest cluster of DRY violations — repeated validation, IR building, data access, and sanitization patterns across `src/services/`.

**Duration:** 3–5 days. Low risk — pure refactoring with existing test coverage.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D7.1** | **Extract `validateAndBuildIR(lessonData, opts)`** | New helper in `src/services/compiler.js` (or a shared `src/services/ir-pipeline.js`) that validates via `lessonSchema.validateLessonData`, calls `buildLessonIR`, then `buildLessonSidecar`, returning `{ ir, sidecar }`. Replace the 5 call sites in `compiler.js` and `author.js`. | Validation + IR + sidecar built in one place. No duplicate validate-then-build blocks. |
| **D7.2** | **Extract `safeYamlLoad(str)`** | Helper in `src/services/compiler.js` or `src/utils/yaml-helpers.js` that wraps `yaml.load(str.trim(), { schema: yaml.JSON_SCHEMA })`. Replace the 4 call sites in `compiler.js` and `author.js`. | YAML schema option defined once. Changing the schema is a one-line edit. |
| **D7.3** | **Extract `sanitizeCreator(creator)`** | Helper in `src/services/accounts.js` that strips `passwordHash` and `salt`. Replace the 4 destructuring sites. | No inline hash-stripping. Single function to update if sensitive fields change. |
| **D7.4** | **Extract `findStudentWithData(pseudoId)`** | Async helper in `src/services/accounts.js` that loads students, finds by `pseudoId`, returns `{ data, student }` or `{ error }`. Replace the 5 lookup sites in `getStudent`, `updateStudent`, `generateTransferToken`, `redeemTransferToken`, `verifyStudentPin`. | Student lookup logic exists once. "Not found" error is consistent. |
| **D7.5** | **Fix `createStudentsBulk` duplication** | Extract the student-object literal into a `buildStudentRecord({ name, pinHash, pinSalt, createdBy })` helper shared by `createStudent` and `createStudentsBulk`. Move `hashPin(pin)` call outside the loop in `createStudentsBulk` so the same PIN is only hashed once. | No duplicate student object literals. Bulk creation is O(1) hash operations instead of O(n). |
| **D7.6** | **Centralize `yamlDir` and slug sanitization in `author.js`** | Module-level `const DEFAULT_YAML_DIR = path.join(process.cwd(), 'data', 'yaml')` and `function sanitizeSlug(slug)` helper. Replace the 5 `yamlDir` defaults and 3 regex replacements. | Directory default defined once. Slug regex defined once. |
| **D7.7** | **Extract `purgeExpiredSessions(sessions)`** | Helper in `accounts.js` used by both `loginCreator` and `cleanExpiredSessions`. | Session expiry filtering logic exists once. |
| **D7.8** | **Migrate `lessonChain.js` to `json-store`** | Replace manual `fs.readFileSync` + `JSON.parse` + fallback in `loadChain`/`saveChain` with `loadJSONAsync`/`saveJSONAsync` from `src/utils/json-store.js`. | Consistent JSON I/O. No manual file-read-with-fallback reimplementations. |

**Verification:** All 549+ existing tests pass. No new files except optional `ir-pipeline.js` or `yaml-helpers.js`.

---

## Sprint D8: Hub-Tools Middleware & Route Cleanup

**Goal:** Replace copy-pasted guard patterns with composable middleware wrappers. Split the `student.js` God File. Remove dead code.

**Duration:** 1 week. Medium risk — touches all route handlers but behavior is unchanged.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D8.1** | **Create `adminOnly(handler)` middleware** | New wrapper in `hub-tools/shared.js` that calls `requireAdmin`, returns 401 on failure, and injects `creator` into the handler context. Replace the 9 inline `requireAdmin` checks across `accounts.js`, `admin.js`, `governance.js`, and `author.js`. | No inline `requireAdmin` calls in route handlers. Auth logic defined once. |
| **D8.2** | **Create `requireLms(handler)` middleware** | Wrapper in `hub-tools/shared.js` that checks `lmsEngine.isAvailable()` and returns 503 on failure. Replace the 5 identical guards in `routes/lms.js`. | LMS availability checked once per-middleware, not per-handler. |
| **D8.3** | **Create `rateLimit(keyFn)` middleware** | Wrapper in `hub-tools/shared.js` that extracts client IP and calls `checkAuthRateLimit`. Replace the 4 identical blocks in `routes/accounts.js`. | Rate-limit boilerplate eliminated. Key derivation is the only per-route concern. |
| **D8.4** | **Create `requireParam(name)` helper** | Utility in `hub-tools/shared.js` that validates a query parameter exists and returns 400 if missing. Replace the 8+ `if (!pseudoId) return sendResponse(400, ...)` blocks across `student.js`, `theta.js`, `parent.js`, `telemetry.js`. | Parameter validation is declarative, not imperative boilerplate. |
| **D8.5** | **Remove redundant per-route `try/catch`** | Audit all route handlers. Remove `try/catch + safeErrorMessage` wrappers that duplicate the top-level error handler in `theta.js` (lines 400–405). Keep only handlers that need to transform errors into specific non-500 responses. | ~20 redundant try/catch blocks removed. Error handling is centralized. |
| **D8.6** | **Create `getStudentSkills(pseudoId)` helper** | Async helper in `hub-tools/shared.js` that loads mastery and extracts `mastery.students[pseudoId] || {}`. Replace the 5 identical load-and-extract blocks in `student.js` and `parent.js`. | Mastery lookup exists once. |
| **D8.7** | **Add telemetry path constant to `shared.js`** | Add `TELEMETRY_PATH` and `loadTelemetryEventsAsync()` to `shared.js`. Replace the 3 inline `path.join(DATA_DIR, 'telemetry_events.json')` constructions. | Telemetry path defined once. Consistent with existing `shared.js` accessor pattern. |
| **D8.8** | **Split `routes/student.js`** | Break the 360-line, 14-route file into focused modules: `routes/analytics.js` (step-analytics, mastery-history, skill-graph, collab-stats), `routes/reviews.js` (reviews, streaks, badges), `routes/diagnostics.js` (diagnostic GET/POST), `routes/learning-paths.js` (learning paths CRUD). Wire into the router in `theta.js`. | No file exceeds ~100 lines. Each file covers one domain. |
| **D8.9** | **Migrate `author.js` routes to `async/await`** | Replace `.then().catch()` chains and `readBody` calls with `async` handlers and `handleJsonBody`. Align with the pattern used in every other route file. | No `.then()` chains in route handlers. Consistent async style. |
| **D8.10** | **Remove dead sync accessors from `shared.js`** | Delete the sync `load`/`save` exports (`loadMasterySummary`, `loadBaseCosts`, `loadLessonIndex`, `loadSchedules`, `loadCurriculum`, etc.) that are not used by any route handler. Keep them only if CLI/scripts depend on them (verify with `grep`). | `shared.js` exports only what is consumed. Knip reports no new dead exports. |

**Verification:** Contract tests (`tests/contract-hub-api.js`) pass. All hub API endpoints return identical responses.

---

## Sprint D9: Governance & Compliance Cleanup

**Goal:** Eliminate the structural duplication between `policy.js` and `catalog.js`, and replace fragile string-based issue classification with structured data.

**Duration:** 3–5 days. Low risk — governance modules are well-tested.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D9.1** | **Create `SchemaBackedJsonStore` factory** | New utility in `src/governance/schema-store.js` (or `src/utils/schema-store.js`). Accepts a schema file path, a defaults object, and a logger. Returns `{ validate, load, save }`. Encapsulates: Ajv optional require, schema compilation, validate-on-load, validate-on-save, `mkdirSync` for save, fallback-on-parse-error. | One implementation of schema-validated JSON persistence (~40 lines). |
| **D9.2** | **Migrate `policy.js` to `SchemaBackedJsonStore`** | Replace the 20-line Ajv loading block, `validatePolicy`, `loadPolicy`, `savePolicy` with calls to the store factory. Keep `defaultPolicy()` and any policy-specific helpers. | `policy.js` drops from ~110 lines to ~50 lines. |
| **D9.3** | **Migrate `catalog.js` to `SchemaBackedJsonStore`** | Same migration for `validateCatalog`, `loadCatalog`, `saveCatalog`. Keep catalog-specific logic (URI matching, `isLessonApproved`). | `catalog.js` drops from ~190 lines to ~100 lines. ~60 lines of duplication eliminated. |
| **D9.4** | **Structured issue objects in `evaluateLessonCompliance`** | Change issue generators to push `{ message, severity }` objects instead of bare strings. Update `classifyIssues` to check `issue.severity === 'fail'` instead of grepping message text. Update callers/tests that read the issues array. | Issue severity is determined by the generator, not by pattern-matching the message. Changing wording never silently changes severity. |
| **D9.5** | **Slim down `src/services/governance.js`** | The 4 bare re-exports (`aggregateCohortCoverage`, `evaluateLessonCompliance`, `loadPolicy`, `loadCatalog`) can be replaced with a direct re-export: `module.exports = { ...require('../governance'), evaluateLessonCompliance: (sidecar, policy) => governance.evaluateLessonCompliance(sidecar, policy \|\| loadPolicy()) }`. Reduce file from 73 lines to ~20. | Pass-through delegation eliminated. Only the `|| loadPolicy()` default-injection wrapper remains as value-add. |

**Verification:** `tests/unit/governance.test.js` passes. Policy/catalog round-trip (load → modify → save → load) works.

---

## Sprint D10: Runtime DRY Consolidation

**Goal:** Deduplicate functions across browser runtime modules. All changes must be ES5-compatible.

**Duration:** 1 week. Medium risk — touches runtime code under the Android 6.0 constraint.

**Android 6.0 rules apply:** `var` only, no arrow functions, no template literals, no destructuring, IIFE + global registration.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D10.1** | **Move `parseDurationMs` to `AGNI_SHARED`** | Add `parseDurationMs` to `src/runtime/shared-runtime.js`. Remove the standalone implementations from `player.js` and `gate-renderer.js`. Both modules read from `AGNI_SHARED.parseDurationMs`. | Duration parsing defined once. No fallback copies. |
| **D10.2** | **Canonicalize `resolveDirective` in `gate-renderer.js`** | `gate-renderer.js` already owns this function and registers it on `AGNI_GATES`. Remove the inline fallback from `player.js` (lines 152–155). `player.js` already reads `_gates.resolveDirective` — just drop the `\|\| function(raw) {...}` fallback now that load order is guaranteed. | Directive resolution defined once. |
| **D10.3** | **Remove duplicate `addAriaToElement` from `completion.js`** | `completion.js` lines 16–19 duplicate `a11y.js` lines 104–107. Replace with `global.AGNI_A11Y.addAria(el, role, label)`. Load order guarantees `a11y.js` is loaded first (verify in `runtimeManifest.js`). | ARIA helper defined once in `a11y.js`. |
| **D10.4** | **Remove dead `base64ToBytes` fallback in `integrity.js`** | The `getBase64ToBytes()` function (lines 16–23) carries a full inline fallback for `AGNI_SHARED.base64ToBytes`. Since `shared-runtime.js` always loads first, the fallback is dead code. Remove it; read `AGNI_SHARED.base64ToBytes` directly. | No dead fallback. Clean delegation to shared runtime. |
| **D10.5** | **Extract shared DOM helper `el(tag, cls, text, parent)`** | Add to `AGNI_SHARED` in `shared-runtime.js`. A 5-line helper that creates an element, sets className, textContent, and optionally appends to a parent. Migrate the highest-frequency call sites in `completion.js`, `frustration.js`, and `gate-renderer.js` (30+ instances of the createElement-className-textContent-appendChild pattern). | DOM creation boilerplate reduced. Runtime modules are more concise. |
| **D10.6** | **Route hardcoded UI strings through `t()` i18n** | The "Not quite — try again" message with remaining-attempts formatting appears 3 times across `player.js` and `gate-renderer.js`. Extract a shared `formatRemainingAttempts(prefix, remaining)` utility in `AGNI_SHARED` and route through the `t()` function. | UI strings are i18n-ready. Attempt formatting defined once. |
| **D10.7** | **Remove trivial wrapper functions in `player.js`** | Lines 87–91: `_trackFrustrationOutcome`, `_trackFrustrationRetry`, `_shouldShowFrustrationNudge` are one-line pass-throughs to `_frust.*`. Lines 189–190: `applyAccessibility`, `addAriaToElement` pass through to `_a11y.*`. Replace call sites with direct `_frust.trackOutcome(...)` and `_a11y.apply()` calls. Keep `_showFrustrationNudge` (captures `t` closure). | ~10 lines of pointless indirection removed. |
| **D10.8** | **Decompose `renderStep()` into dispatch table** | Extract step-type rendering from the 143-line `renderStep()` in `player.js` into a dispatch map: `var STEP_RENDERERS = { completion: renderCompletionStep, quiz: renderQuizStep, hardware_trigger: renderHardwareTriggerStep }` with a default `renderContentStep`. Each renderer is a focused function (~20–40 lines). | `renderStep` becomes a ~30-line dispatcher. Each step type is independently readable. |

**Verification:** All 46 runtime tests pass. ES5 syntax gate (`test:es5`) passes. Manual smoke test on a lesson with gates, quizzes, and completion.

---

## Sprint D11: Engine & Builder Refinements

**Goal:** Fix the state-mutation bug in the engine, consolidate defaults, and clean up builder utilities.

**Duration:** 3–5 days. Medium risk — engine changes require careful testing.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D11.1** | **Fix `selectBestLesson` state mutation** | `src/engine/index.ts` line 282 temporarily mutates `_state.embedding.lessons` during scoring. Refactor to pass filtered lessons as a parameter to Thompson/embedding scoring functions instead of mutating module-level state. | No temporary state mutation. An error mid-scoring cannot corrupt `_state`. |
| **D11.2** | **Export `ENGINE_DEFAULTS` from one location** | Create a shared `ENGINE_DEFAULTS` object in `src/utils/env-config.js` (or `src/engine/defaults.js`). Replace the 4 duplicate `DEFAULT_EMBEDDING_DIM`, `DEFAULT_FORGETTING`, `DEFAULT_EMBEDDING_LR`, `DEFAULT_EMBEDDING_REG` declarations in both `engine/index.ts` and `engine/migrations.js`. | Engine defaults defined once. Changing a default is a one-line edit. |
| **D11.3** | **Remove scattered `ensureBanditInitialized` calls** | `thompson.ensureBanditInitialized(_state)` is called defensively at 4 sites in `engine/index.ts`. Initialize bandit state once in `loadState()` and document the invariant that `_state` is always fully initialized after load. Remove the 4 defensive calls. | Initialization happens once with a clear contract. No defensive scatter. |
| **D11.4** | **Extract `writeIfNewer(sourceMtime, destPath, contentFn)`** | Shared utility in `src/utils/io.js`. Replace the "check mtime, skip if up-to-date, write if stale" pattern in `src/builders/html.js` (lines 136–154) and `src/utils/katex-css-builder.js` (lines 255–261). | File-freshness check defined once. |
| **D11.5** | **Move `escapeHtml` to shared utils** | Move from `src/builders/html.js` to `src/utils/strings.js` (or `src/utils/html.js`). Export for use by any builder or hub route that constructs HTML. | Utility is reusable. No risk of future re-implementation. |
| **D11.6** | **Decompose `inferFeatures()` in `featureInference.js`** | Break the 134-line monolith into composable sub-functions: `collectAllText(lessonData)`, `detectCapabilityFlags(text, steps)`, `detectEquationTypes(text, flags)`, `profileVARK(text)`, `detectBloomsCeiling(text)`, `estimateDifficulty(steps)`. The top-level `inferFeatures` becomes a coordinator. | Each analyzer is independently testable. Adding a new feature inference is a localized change. |

**Verification:** Engine unit tests pass (Rasch, Thompson, embeddings, federation, migrations). Build pipeline produces identical output for pilot lessons.

---

## Sprint D12: Error Handling & Style Consistency

**Goal:** Standardize error conventions and eliminate remaining style inconsistencies. Housekeeping sprint.

**Duration:** 3–5 days. Low risk.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D12.1** | **Standardize error style in `compiler.js`** | `parseLessonFromString` returns `{ error }`, but `runCompilePipeline` throws, and `compileLessonFromYamlFile` throws. Standardize: public-facing functions (called by routes) return `{ error }`. Internal pipeline functions throw. Callers at the boundary convert throws to `{ error }`. Document the convention in `CONVENTIONS.md`. | One error convention per layer. Callers never have to guess whether to try/catch or check `.error`. |
| **D12.2** | **Modernize `author.js` to `const`/`let`** | `author.js` still uses `var` throughout while every other service file uses `const`/`let`. Migrate all `var` declarations. This was likely missed during Sprint D5.2 or introduced after it. | Consistent variable declarations across all server-side service files. ESLint `no-var` passes. |
| **D12.3** | **Replace `lms.js` pass-through with Proxy** | Replace the 12 manually-written pass-through functions with a lazy-loading Proxy: `module.exports = new Proxy({}, { get(_, prop) { return requireEngine()[prop]; } })`. Or simpler: `module.exports = { get engine() { return requireEngine(); } }` and update callers to use `lms.engine.seedLessons(...)`. Evaluate which approach is clearer and choose accordingly. | ~70 lines of boilerplate reduced to ~5. No behavior change. |
| **D12.4** | **Add cross-environment binding-hash contract test** | The same SHA-256 binding hash (content + `\x00` separator + deviceId) is computed in Node (`src/utils/crypto.js`) and browser (`src/runtime/integrity.js`). Add a test that generates a binding hash in Node and verifies it matches the expected byte output, documenting the canonical format. | Binding format is tested. Divergence between Node and browser implementations would be caught. |
| **D12.5** | **Audit and update `CONVENTIONS.md`** | Add sections for: error return conventions (D12.1), middleware wrapper pattern (D8.1–D8.4), `SchemaBackedJsonStore` usage (D9.1), shared runtime registration pattern for new utilities (D10.1, D10.5). | Conventions reflect the refactored patterns. New contributors follow the established approach. |

**Verification:** All 549+ tests pass. `npm run lint` clean. Knip reports no new dead code.

---

## Dependency Summary

```
Sprint D7 (Service DRY) ────────────────────────────────────────────┐
    │                                                                │
Sprint D8 (Hub Middleware) ──── can overlap with D7 ────────────────┤
                                                                     │
Sprint D9 (Governance) ──── independent, can overlap with D7/D8 ───┤
                                                                     │
Sprint D10 (Runtime DRY) ──── independent of D7–D9 ────────────────┤
                                                                     │
Sprint D11 (Engine/Builders) ── independent, can overlap D10 ──────┤
                                                                     │
Sprint D12 (Error/Style) ──── after D7, D8, D9 (documents patterns)┘
```

- **D7** and **D8** touch overlapping files (`accounts.js`, `author.js`) — run in sequence or coordinate carefully.
- **D9** is fully independent (governance modules only).
- **D10** is fully independent (runtime browser code only).
- **D11** is fully independent (engine + builders only).
- **D12** goes last — it documents the conventions established by D7–D11.

---

## Recommended Order

| Order | Sprint | Duration | Focus | Parallel? |
|-------|--------|----------|-------|-----------|
| 1 | **Sprint D7** | 3–5 days | Service layer helpers and DRY extraction | — |
| 2 | **Sprint D9** | 3–5 days | Governance schema store + structured issues | Parallel with D7 |
| 3 | **Sprint D8** | 1 week | Hub middleware wrappers + route split | After D7 |
| 4 | **Sprint D10** | 1 week | Runtime deduplication (ES5) | Parallel with D8 |
| 5 | **Sprint D11** | 3–5 days | Engine state fix + builder utils | Parallel with D10 |
| 6 | **Sprint D12** | 3–5 days | Error conventions + documentation | After all others |

**Total estimated duration:** ~4–5 weeks (with parallelization), ~6–7 weeks sequential.

---

## Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Duplicated validation-then-build blocks | 5 | 1 |
| Inline `requireAdmin` guards | 9 | 0 (middleware) |
| Redundant `try/catch` wrappers in routes | 20+ | 0 (centralized) |
| Pass-through functions in `lms.js` | 12 | 0 (Proxy) |
| Duplicate schema validation boilerplate | ~60 lines × 2 files | ~40 lines × 1 factory |
| Duplicated runtime functions | 5 functions × 2 copies | 5 functions × 1 copy |
| `student.js` route file | 360 lines, 14 routes | 4 files, ~80–100 lines each |
| `renderStep()` | 143 lines | ~30-line dispatcher + focused renderers |
| `inferFeatures()` | 134 lines | ~20-line coordinator + 6 sub-functions |
| State mutation risk in `selectBestLesson` | Present | Eliminated |

---

## References

- **DRY/complexity audit** — Findings from code review of all subsystems
- **Prior tech debt sprints** — `docs/SPRINT-TECH-DEBT.md` (Sprints 0–6, all complete)
- **Feature sprint plan** — `docs/SPRINT-PLAN.md` (ongoing feature work; DRY sprints can interleave)
- **Runtime playbook** — `docs/playbooks/runtime.md` (load order, factory registration, ES5 rules)
- **Conventions** — `docs/CONVENTIONS.md` (module layout, patterns)
