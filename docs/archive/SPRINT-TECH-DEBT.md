# Sprint Plan: Technical Debt & Runtime Hardening

Six sprints addressing structural debt, security issues, runtime testability, and developer tooling. All runtime changes preserve ES5 compatibility for Android 6.0+ (Marshmallow) WebView (Chrome 44 baseline — no `let`/`const`, no arrow functions, no destructuring, no ES modules in browser code).

**Constraint:** The runtime loads via `factory-loader.js` script concatenation into a single HTML file. There is no bundler (Vite is dev-server only). Decomposed runtime modules must use the same IIFE + global registration pattern (`window.AGNI_*`) and be added to the factory manifest via `featureInference.js`.

**Reference:** Critique findings, `docs/CONVENTIONS.md`, `docs/playbooks/runtime.md`, `docs/playbooks/typing-and-languages.md`.

---

## Implementation Status

| Sprint | Status | Summary |
|--------|--------|---------|
| **Sprint 0** | **Done** | XSS fix, governance bug fix, plaintext PIN removed, dead code deleted, .nvmrc, Dependabot, DEV_MODE catch logging |
| **Sprint 1** | **Done** | `env-config.js` created; engine, services, governance, hub-transform migrated; server-side console.log → structured logger |
| **Sprint 2** | **Done** | integrity.js, frustration.js, checkpoint.js, completion.js, gate-renderer.js, a11y.js extracted; factory manifest + hub-transform updated; ES5 CI gate added. |
| **Sprint 3** | **Done** | All feasible extractions complete. Telemetry already existed as `AGNI_TELEMETRY`. Pace/hint timers (~70 lines) kept in player.js — too coupled to closure state for extraction benefit. |
| **Sprint 4** | **Done** | Browser-globals test helper created. 46 runtime tests: checkpoint (7), frustration (9), gate-renderer (13), telemetry (8), a11y (9). `npm run test:runtime` added. CI step in `validate.yml`. Pre-existing test bugs fixed (accounts async, governance validatePolicy, runtimeManifest load order). |
| **Sprint 5** | **Done** | Compiled engine JS gitignored; async saveState + structuredClone in engine. `var`→`let`/`const` across 24 server-side files (~430 declarations). Async json-store migration for sentry.js, accounts.js, and theta.js (+ all route handlers). `src/types.js` deleted. |
| **Sprint 6** | **Done** | Root ARCHITECTURE.md → pointer. SPRINT-NEXT.md + NEXT-SPRINT-TASKS.md merged into SPRINT-PLAN.md. Runtime playbook updated with 6 new modules. CSP meta tag added to compiled HTML. Portal CI checks added to validate.yml. |
| **Caching** | **Done** | Service worker v4: cache-first for factories/KaTeX, lesson prefetch, batch prefetch, stale lesson purge. |

**player.js:** 1,837 → ~1,087 lines (−41%). Six modules extracted (integrity, checkpoint, frustration, completion, gates, a11y).
**Test suite:** 549 tests, 0 failures. Runtime modules covered at 46 new tests. theta.js fully async (zero sync I/O on request path).

---

## Sprint 0: Critical Fixes & Tooling Guardrails

**Goal:** Fix security bugs, logic bugs, and dead code. Add missing guardrails so future sprints land on solid ground. No architectural changes.

**Duration:** 3–5 days.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D0.1** | **Fix innerHTML XSS in player.js** | Replace `svgContainer.innerHTML = '...' + err.message` with safe DOM construction using `document.createElement` + `textContent`. Audit all `innerHTML` sites where interpolated data is not from the build-time pipeline. | No `innerHTML` with runtime-interpolated strings. |
| **D0.2** | **Fix governance null-validation bug** | `src/governance/policy.js` `validatePolicy()`: return `{ valid: false, errors: ['Policy must be a non-null object'] }` for non-object input instead of `{ valid: true }`. | Unit test: `validatePolicy(null)` → `valid: false`. |
| **D0.3** | **Remove legacy plaintext PIN path** | `src/services/accounts.js`: remove the `else if (student.pin)` plaintext comparison. Add a one-time migration script that hashes all legacy plaintext PINs on hub startup. | No plaintext PIN comparison in code. Migration tested. |
| **D0.4** | **Delete dead code files** | Remove `src/factory-loader.js`, `src/rasch.js`, `src/thompson.js` (legacy duplicates of files in `src/engine/` and `src/runtime/`). Remove from Knip `ignoreFiles`. | `knip` runs clean without those ignores. |
| **D0.5** | **Add package-lock.json** | Run `npm install` at root to generate lock file. Commit it. CI already runs `npm ci` which requires it. | Deterministic installs; `npm ci` succeeds in CI. |
| **D0.6** | **Add .nvmrc** | Pin `lts/hydrogen` (Node 20) to match CI and Dockerfile. | `nvm use` works; matches CI matrix. |
| **D0.7** | **Add pre-commit hooks** | Install `husky` + `lint-staged`. Pre-commit: `eslint --fix` + `prettier --write` on staged `*.js`/`*.ts` files. | Lint and format enforced before every commit. |
| **D0.8** | **Add Dependabot config** | `.github/dependabot.yml`: weekly updates for npm (root + portal), GitHub Actions. | PRs appear for outdated deps. |
| **D0.9** | **Add empty catch logging in player.js** | Wrap all 12+ empty `catch (e) {}` blocks: if `DEV_MODE`, log to console. Production stays silent. | `DEV_MODE` surfaces all swallowed errors. |

**Android note:** D0.1 and D0.9 touch `player.js` — all changes must use `var`, function expressions, and string concatenation (no template literals).

---

## Sprint 1: Configuration Centralization

**Goal:** Eliminate copy-pasted env parsing and `DATA_DIR` resolution. Single source of truth for all `AGNI_*` configuration.

**Duration:** 3–5 days.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D1.1** | **Create `src/utils/env-config.js`** | Single module that parses and exports all `AGNI_*` env vars with defaults. Caches parsed values. Exports: `config.dataDir`, `config.embeddingDim`, `config.forgetting`, `config.embeddingLr`, `config.embeddingReg`, `config.thetaPort`, `config.servePort`, `config.sentryPort`, `config.hubId`, etc. | One `require('../utils/env-config')` replaces all inline `process.env.AGNI_*` parsing. |
| **D1.2** | **Migrate engine env references** | `src/engine/index.ts`, `src/engine/migrations.js`: replace inline `parseInt(process.env.AGNI_EMBEDDING_DIM \|\| '16', 10)` with import from env-config. Rebuild engine. | No `process.env.AGNI_` in engine files except through env-config. |
| **D1.3** | **Migrate service env references** | `src/services/accounts.js`, `src/services/lessonChain.js`, `src/governance/catalog.js`, `hub-tools/theta.js`, `hub-tools/sentry.js`: replace inline `DATA_DIR` resolution and env reads. | `grep -r 'process.env.AGNI_' src/` returns only `env-config.js` and `env-validate.js`. |
| **D1.4** | **Consolidate logger usage (server-side)** | Replace raw `console.log/warn/error` in `src/config.js`, `src/compiler/buildLessonIR.js`, `src/services/compiler.js`, `src/governance/*.js`, `hub-tools/*.js` with `require('../utils/logger')`. Keep `console.*` in `src/runtime/` (browser) and `packages/agni-cli/cli.js` (user-facing output). | Server-side modules use structured logger; `console.*` only in runtime, CLI, and builders (user output). |
| **D1.5** | **Update env-validate.js** | Wire `env-validate.js` to read from env-config and validate at startup (missing required vars, invalid types). Called from `hub-tools/theta.js` and `hub-tools/sentry.js` entry points. | Hub fails fast with clear error on bad config. |

---

## Sprint 2: player.js Decomposition — Phase 1

**Goal:** Extract the first three independent concerns from the 1,837-line `player.js` monolith into separate runtime modules. Each module registers on `window.AGNI_PLAYER_*` and is loaded via the factory manifest.

**Duration:** 2 weeks.

**Android 6.0 rules for all runtime modules:**
- Wrap in `(function(global) { 'use strict'; ... })(typeof self !== 'undefined' ? self : this);`
- `var` only — no `let`, `const`, arrow functions, destructuring, template literals, `class`, `for...of`
- No `Promise.allSettled`, `Array.from`, `Object.assign` without polyfill check (these exist in `shared-runtime.js`)
- Register on a `window.AGNI_PLAYER_*` global; player.js reads it during init
- Add to `FACTORY_FILE_MAP` and `FACTORY_LOAD_ORDER` in `featureInference.js`
- Add filename to `ALLOWED_FACTORY_FILES` in `server/hub-transform.js`

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D2.1** | **Extract integrity verification** | New file: `src/runtime/integrity.js`. Moves `verifyIntegrity()`, the TweetNaCl fallback, and all `OLS_SIGNATURE`/`OLS_PUBLIC_KEY` logic (~120 lines). Registers as `window.AGNI_INTEGRITY`. player.js calls `AGNI_INTEGRITY.verify()` during init. | `player.js` no longer contains crypto code. Existing E2E smoke test passes. |
| **D2.2** | **Extract gate/quiz renderer** | New file: `src/runtime/gate-renderer.js`. Moves `renderGateQuiz()`, `renderManualVerification()`, shared retry/delay logic, escape-button creation (~250 lines). Deduplicate the retry logic into a shared helper within the module. Registers as `window.AGNI_GATES`. | Gate rendering works identically. Retry logic exists once, not twice. |
| **D2.3** | **Extract frustration detection** | New file: `src/runtime/frustration.js`. Moves `_frustration` state object, `_trackFrustrationOutcome()`, `_checkFrustration()`, nudge rendering (~80 lines). Registers as `window.AGNI_FRUSTRATION`. player.js calls it after each step outcome. | Frustration nudges still fire. State is encapsulated. |
| **D2.4** | **Extract telemetry collector** | New file: `src/runtime/telemetry-collector.js`. Moves `stepOutcomes`, `probeResults`, `_buildOutcome()`, `_reportTelemetry()`, step timing logic (~100 lines). Registers as `window.AGNI_TELEMETRY`. | Telemetry payloads are identical to before extraction. |
| **D2.5** | **Update factory-loader and builder** | Update `featureInference.js` to include new modules in manifest. Update `html.js` to inline or reference them. Update `server/hub-transform.js` allowed list. | Full build + serve works. New modules load in correct order. |
| **D2.6** | **Regression test: Android 6.0 syntax check** | Add a CI step (or npm script) that runs a syntax parse on all `src/runtime/*.js` files targeting ES5. Use `acorn` with `ecmaVersion: 5` to reject ES6+ syntax. | CI fails if any runtime file contains ES6+ syntax. |

**After this sprint:** `player.js` drops from ~1,837 lines to ~1,300 lines. Four concerns are isolated and independently testable.

---

## Sprint 3: player.js Decomposition — Phase 2

**Goal:** Extract remaining secondary concerns. What remains in `player.js` is the core state machine: step routing, navigation, and DOM rendering (~600–800 lines).

**Duration:** 2 weeks.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D3.1** | **Extract checkpoint persistence** | New file: `src/runtime/checkpoint.js`. Moves `saveCheckpoint()`, `loadCheckpoint()`, `clearCheckpoint()`, `CHECKPOINT_KEY` logic (~60 lines). Registers as `window.AGNI_CHECKPOINT`. | Lesson resume works on reload. |
| **D3.2** | **Extract pace tracking & hint timers** | New file: `src/runtime/pacing.js`. Moves pace/dwell tracking, hint delay timers, auto-advance logic (~100 lines). Registers as `window.AGNI_PACING`. | Hints still appear on schedule. Auto-advance still fires. |
| **D3.3** | **Extract accessibility helpers** | New file: `src/runtime/a11y.js`. Moves ARIA attribute management, reduced-motion checks, haptic-intensity reads from localStorage, focus management (~80 lines). Registers as `window.AGNI_A11Y`. | Accessibility preferences still respected. Screen readers still work. |
| **D3.4** | **Extract completion renderer** | New file: `src/runtime/completion.js`. Moves `renderCompletion()`, summary screen, badge display, "next lesson" link (~120 lines). Registers as `window.AGNI_COMPLETION`. | Completion screen renders identically. |
| **D3.5** | **Slim player.js audit** | Review remaining `player.js` (~600–800 lines). Document its final responsibilities: init, `routeStep()`, `renderStep()`, `mountStepVisual()`, navigation event handling, `loadDependencies()` orchestration. Update `src/runtime/README.md` with new module map. | `player.js` is a state machine and nothing else. README reflects actual module layout. |
| **D3.6** | **Manual QA on Android 6.0 emulator** | Run all five pilot lessons on an Android 6.0 AVD (API 23, Chrome 44 WebView). Verify: sensors, gates, quizzes, SVG rendering, frustration nudges, completion, checkpoint resume, integrity check (with and without TweetNaCl fallback). | All lessons complete without JS errors on stock Marshmallow WebView. |

**After this sprint:** `player.js` is ~600–800 lines. Eight modules are extracted. Each has a single responsibility and a clean global interface.

---

## Sprint 4: Runtime Test Coverage

**Goal:** Build a browser-compatible test harness for the decomposed runtime modules. Target: 70%+ line coverage on runtime code.

**Duration:** 2 weeks.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D4.1** | **Runtime test harness** | Add Playwright-based component test setup. Each test loads a minimal HTML page that inlines the module under test + `shared-runtime.js` stubs. Tests run headless Chromium. | `npm run test:runtime` runs browser-based tests. |
| **D4.2** | **Test integrity.js** | Tests: valid signature verifies, tampered content fails, missing key falls back to TweetNaCl, missing signature skips (DEV_MODE). | Integrity module has 80%+ coverage. |
| **D4.3** | **Test gate-renderer.js** | Tests: correct answer passes gate, wrong answer increments attempts, max_attempts triggers escape button, retry_delay enforced, manual verification flow, on_fail routing. | Gate module has 80%+ coverage. |
| **D4.4** | **Test frustration.js** | Tests: consecutive skips trigger nudge, consecutive fails trigger nudge, rapid retries detected, nudge resets after success. | Frustration module has 80%+ coverage. |
| **D4.5** | **Test telemetry-collector.js** | Tests: outcome shape matches telemetry schema, step timing recorded, probe results accumulated, report payload structure. | Telemetry module has 80%+ coverage. |
| **D4.6** | **Test checkpoint.js, pacing.js, a11y.js, completion.js** | Unit tests for each extracted module. Mock localStorage and DOM APIs. | Each module has 70%+ coverage. |
| **D4.7** | **Expand E2E suite** | Add Playwright specs: full lesson playthrough (happy path), gate failure + retry, sensor-triggered step (mocked DeviceMotion), checkpoint resume after page reload, accessibility prefs applied. | 5+ E2E scenarios beyond existing smoke test. |
| **D4.8** | **CI integration** | Add `test:runtime` to `validate.yml` workflow. Report coverage alongside existing server-side coverage. | Runtime tests run on every PR. |

---

## Sprint 5: TypeScript Strategy & Async I/O

**Goal:** Resolve the TS/JS identity crisis for server-side code. Eliminate sync I/O from the request path. No changes to runtime browser code (stays ES5 JS).

**Duration:** 2 weeks.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D5.1** | **Stop committing compiled engine JS** | Add `src/engine/index.js`, `src/engine/index.js.map`, `src/engine/index.d.ts`, `src/engine/index.d.ts.map` to `.gitignore`. CI already runs `npm run build:engine` before tests. Downstream code loads the compiled output (unchanged). | Only `index.ts` is in version control. `build:engine` produces `.js` on CI/deploy. |
| **D5.2** | **Modernize server-side JS: `var` → `let`/`const`** | Across `src/services/`, `src/compiler/`, `src/governance/`, `src/utils/`, `hub-tools/`, `server/`: replace `var` with `const` (default) or `let` (reassigned). **Do NOT touch `src/runtime/`** — browser code stays `var`. Add ESLint rule `no-var: error` for server-side files; `no-var: off` for `src/runtime/**`. | `npm run lint` passes. Runtime files excluded from `no-var`. |
| **D5.3** | **Async engine state persistence** | Replace `fs.readFileSync`/`fs.writeFileSync` in engine `loadState()`/`saveState()` with async equivalents. Use `fs.promises.writeFile` → `fs.promises.rename` (atomic). The public API (`recordObservation`, `recommendLesson`) becomes `async`. Update all callers in `hub-tools/theta.js` and `hub-tools/routes/`. | No sync I/O on the request path. Event loop is never blocked by state persistence. |
| **D5.4** | **Replace JSON deep clone** | In `applyObservation()`: replace `JSON.parse(JSON.stringify(state))` with `structuredClone(state)` (Node 17+; we target Node 20). If state needs to stay JSON-serializable, use a targeted shallow copy of only the mutated branches. | Deep clone is faster and doesn't lose `undefined` values. |
| **D5.5** | **Consolidate type definitions** | Remove `src/types.js` (JSDoc typedefs). All server-side type documentation points to `src/types/index.d.ts`. Portal's `api.ts` types for `LessonSidecar.ontology` updated from `unknown[]` to match `src/types/index.d.ts` definitions. | One canonical type source. No `unknown[]` in portal types. |
| **D5.6** | **Async json-store** | Deprecate sync `loadJSON`/`saveJSON` in `json-store.js`. Add async `loadJSONAsync`/`saveJSONAsync` as primary API. Migrate all server-side callers (`accounts.js`, `catalog.js`, `lessonChain.js`). Keep sync versions available for CLI/scripts only. | All hub API request paths use async I/O. |

**Android note:** This sprint does not touch `src/runtime/`. No browser compatibility risk.

---

## Sprint 6: Documentation Consolidation & CI Polish

**Goal:** Reduce doc sprawl, eliminate redundancy, harden CI. Housekeeping sprint.

**Duration:** 3–5 days.

| # | Task | Deliverable | Success |
|---|------|-------------|---------|
| **D6.1** | **Merge architecture docs** | Consolidate root `ARCHITECTURE.md` and `docs/ARCHITECTURE.md` into a single `docs/ARCHITECTURE.md`. Root gets a one-line pointer: "See `docs/ARCHITECTURE.md`." | One architecture document. No conflicting descriptions. |
| **D6.2** | **Merge sprint planning docs** | Consolidate `docs/SPRINT-PLAN.md`, `docs/SPRINT-NEXT.md`, and `docs/NEXT-SPRINT-TASKS.md` into a single `docs/SPRINT-PLAN.md` with sections for current, next, and backlog. Delete the other two. | One sprint planning document. |
| **D6.3** | **Audit and prune docs/playbooks** | Review all 10 playbooks. Remove stale content, update file references to reflect post-decomposition module layout (player.js → multiple modules). | Playbooks reflect actual codebase. |
| **D6.4** | **Add CSP meta tag** | In `src/builders/html.js`: emit a `<meta http-equiv="Content-Security-Policy">` tag in compiled lesson HTML. Policy: `default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:;`. `unsafe-inline` required because scripts are inlined. | Compiled lessons have baseline CSP. |
| **D6.5** | **CI: add runtime ES5 syntax gate** | Ensure D2.6 (acorn ES5 parse) runs in `validate.yml`. If not added in Sprint 2, add it now. | CI rejects any ES6+ syntax in `src/runtime/`. |
| **D6.6** | **CI: add portal checks** | Add `npm run check` (svelte-check) and `npm run test` (vitest) for the portal to `validate.yml`. Currently only root tests run in CI. | Portal type errors and test failures block merge. |

---

## Dependency Summary

```
Sprint 0 (Critical Fixes) ──────────────────────────────────────────┐
    │                                                                │
Sprint 1 (Config Centralization) ────────────────────────────────────┤
    │                                                                │
Sprint 2 (player.js Phase 1) ───► Sprint 3 (player.js Phase 2) ─────┤
                                      │                              │
                                  Sprint 4 (Runtime Tests) ──────────┤
                                                                     │
Sprint 5 (TS Strategy & Async I/O)  [parallel w/ Sprints 2-4] ──────┤
                                                                     │
Sprint 6 (Docs & CI Polish)  [after all others] ────────────────────┘
```

- **Sprint 0** must go first — it fixes security bugs and adds guardrails that protect later work.
- **Sprint 1** can overlap with Sprint 0 (no file conflicts).
- **Sprints 2 → 3 → 4** are sequential — each depends on the previous decomposition.
- **Sprint 5** is independent of player.js work and can run in parallel with Sprints 2–4. It only touches server-side code.
- **Sprint 6** goes last — it updates docs and CI to reflect the final state.

---

## Recommended Order

| Order | Sprint | Duration | Focus |
|-------|--------|----------|-------|
| 1 | **Sprint 0** | 3–5 days | Security fixes, dead code, tooling guardrails |
| 2 | **Sprint 1** | 3–5 days | Centralized config, structured logging |
| 3 | **Sprint 2** | 2 weeks | player.js decomposition Phase 1 (4 modules extracted) |
| 4 | **Sprint 5** | 2 weeks | TS cleanup, async I/O (parallel with Sprint 3) |
| 5 | **Sprint 3** | 2 weeks | player.js decomposition Phase 2 (4 more modules extracted) |
| 6 | **Sprint 4** | 2 weeks | Runtime test coverage |
| 7 | **Sprint 6** | 3–5 days | Docs consolidation, CI hardening |

**Total estimated duration:** ~10–11 weeks.

---

## Android 6.0 (Marshmallow) Compatibility Checklist

Applied to every runtime change in Sprints 0, 2, 3, and 4:

- [ ] All runtime JS uses `var` (no `let`/`const`)
- [ ] No arrow functions (`function` keyword only)
- [ ] No template literals (string concatenation only)
- [ ] No destructuring assignment
- [ ] No `for...of` loops
- [ ] No `class` declarations
- [ ] No `default` parameter values
- [ ] No spread/rest operators
- [ ] No `Object.assign` without `AGNI_SHARED` polyfill
- [ ] No `Promise.allSettled`, `Promise.any`, `Array.from` without polyfill
- [ ] No ES modules (`import`/`export`) — IIFE + global registration only
- [ ] `crypto.subtle` usage has TweetNaCl fallback (Chrome 44 has SubtleCrypto but limited algorithm support)
- [ ] CI ES5 syntax gate (D2.6) catches violations before merge
- [ ] Tested on Android 6.0 AVD (API 23) before sprint sign-off (D3.6)

---

## References

- **Critique findings** — Security issues, monolith analysis, duplication inventory
- **Runtime playbook** — `docs/playbooks/runtime.md` (load order, factory registration)
- **Typing conventions** — `docs/playbooks/typing-and-languages.md` (TS vs JS boundary)
- **Conventions** — `docs/CONVENTIONS.md` (module layout, documentation)
- **Feature sprint plan** — `docs/SPRINT-PLAN.md` (ongoing feature work; tech debt sprints interleave)
