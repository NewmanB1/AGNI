# Hub Canonical Migration Plan

Plan to eliminate all `src/` imports from `@agni/hub` (packages/agni-hub), add regression guards, and provide proof of completion. Follows `.cursor/rules/sprint-verification.md`.

---

## Scope

| Phase | Items | Proof Type |
|-------|-------|------------|
| **Phase 0** | CI gate + wiring smoke test | Script + integration test |
| **Phase 1** | Migrate utils imports to @agni/utils | CI gate (verify:canonical) |
| **Phase 2** | Migrate compiler/engine imports | Same + smoke test |
| **Phase 3** | Migrate services (or document boundary) | Depends on approach |
| **Phase 4** | Documentation updates | verify:hub-docs |

**Dependency:** Phase 0 must complete first so the CI gate fails when hub imports from `src/`. Phases 1–2 can proceed in parallel after that. Phase 3 depends on services migration strategy.

---

## Phase 0: CI Gate and Wiring Proof (Do First)

### H0.1 Add @agni/hub to verify-canonical-ownership

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| H0.1 | Extend verify-canonical-ownership to check hub | `scripts/verify-canonical-ownership.js` | Add `{ name: '@agni/hub', dir: 'packages/agni-hub' }` to `PACKAGES_TO_CHECK` | `npm run verify:canonical` **fails** initially (expected); **passes** after Phase 1–3 complete |

**Regression guard:** After this change, `verify:canonical` will fail until all hub `src/` imports are removed. This is intentional — the gate enforces the migration.

**CI impact:** Adding hub will cause `verify:all` to fail until Phases 1–3 are done. Execute H0.1 in the same PR (or branch) as Phase 1 migrations, or do H0.1 first and accept temporary CI red until migration completes.

**Wiring:** `verify:all` and CI already run `verify:canonical`. No new wiring needed.

**Proof of completion:**
```bash
node scripts/verify-canonical-ownership.js
# Exit 1 with violations listing packages/agni-hub/*.js
```

---

### H0.2 Integration smoke test for hub routes (wiring proof)

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| H0.2 | Ensure wiring-smoke covers hub routes | `tests/integration/wiring-smoke.test.js` | Confirm `GET /lessons/gravity`, `GET /lesson-data.js?slug=gravity`, `GET /health` etc. are tested | `npm run test:integration` passes |

**Purpose:** Per sprint-verification §6, route/wiring changes require integration smoke tests. The migration changes import paths, not routes — but a passing smoke test proves the hub still works after each phase.

**Proof of completion:**
```bash
npm run test:integration
# All pass; hub serves lessons correctly
```

---

## R16 Open Bugs (Verify Status)

Per `docs/archive/SPRINT-R16-OPEN-BUGS.md`, the following hub items were marked Done. Verify during migration that fixes remain in place:

| Item | Location | What to verify |
|------|----------|----------------|
| C1.1 | routes/groups.js | `withLock` wraps mutating endpoints |
| C1.2 | routes/parent.js | `withLock` for invite/link |
| C1.3 | routes/student.js | `withLock` for checkpoint save |
| C2.1 | sentry.js | Event buffer capped |
| C2.2 | sentry.js | UTF-8 body parsing (Buffer.concat) |
| C3.2 | sentry.js | `pruneOldEvents` / retention |
| C3.4 | routes/parent.js | Rate limit on parent GET |

No new work required if verified; document any regressions found.

---

## Phase 1: Migrate Utils Imports (src/utils/* → @agni/utils)

All `src/utils/*` imports in packages/agni-hub must become `@agni/utils/*` or `@agni/utils/&lt;module&gt;` per `packages/agni-utils/index.js`.

### Mapping (16 modules)

| src/utils module | @agni/utils equivalent | Hub files to update |
|------------------|------------------------|----------------------|
| logger | `@agni/utils/logger` | sentry.js, shared.js, sync.js, hub-transform.js, telemetry.js |
| env-config | `@agni/utils/env-config` | data-paths.js, config.js, author.js, telemetry.js, sentry.js, hub-transform.js, sync.js |
| hub-config | `@agni/utils/hub-config` | theta.js, sentry.js, sync.js |
| env-validate | `@agni/utils/env-validate` | theta.js |
| router | `@agni/utils/router` | theta.js |
| feature-flags | `@agni/utils/feature-flags` | theta.js |
| http-helpers | `@agni/utils/http-helpers` | auth.js, http.js |
| streak | `@agni/utils/streak` | http.js |
| file-lock | `@agni/utils/file-lock` | groups.js, student.js, parent.js, telemetry.js |
| archetype-match | `@agni/utils/archetype-match` | governance.js |
| json-store | `@agni/utils/json-store` | data-access.js, sentry.js |
| crypto | `@agni/utils/crypto` | hub-transform.js |
| csp | `@agni/utils/csp` | hub-transform.js |
| io | `@agni/utils/io` | hub-transform.js |
| runtimeManifest | `@agni/utils/runtimeManifest` | hub-transform.js |
| katex-css-builder | `@agni/utils/katex-css-builder` | hub-transform.js |

### Execution order

1. **Batch 1** (context/ and routes/ — no circular deps): auth.js, http.js, config.js, data-paths.js, data-access.js, groups.js, student.js, parent.js, author.js, governance.js, telemetry.js
2. **Batch 2** (top-level): shared.js, theta.js, sync.js, sentry.js, hub-transform.js

### Regression guard

- **CI gate:** `verify:canonical` (extended in H0.1) — fails if any `require('*src/*')` remains.
- **Tests:** `npm test` and `npm run test:integration` must pass after each batch.

### Proof of completion (Phase 1)

```bash
npm test
npm run test:integration
npm run verify:canonical
# All pass; zero src/utils imports in packages/agni-hub
```

**Break-it check:** Revert one import (e.g. `@agni/utils/logger` → `../../src/utils/logger`) → `verify:canonical` fails.

---

## Phase 2: Migrate Compiler and Engine Imports

### H2.1 hub-transform.js: compiler + lesson services

| # | Task | Current | Target | Proof |
|---|------|---------|--------|-------|
| H2.1a | Compiler | `require('../../src/compiler')` | `require('@ols/compiler')` | hub-transform compiles a lesson |
| H2.1b | lesson-schema | `require('../../src/services/lesson-schema')` | `require('@ols/schema/lesson-schema')` | Validation runs |
| H2.1c | lesson-assembly | `require('../../src/services/lesson-assembly')` | `require('@ols/compiler/services/lesson-assembly')` | Lesson HTML built |

**Note:** `@ols/compiler` exports `compiler` (buildLessonIR); for full compile pipeline use `@ols/compiler` + builders. `src/compiler` re-exports `@ols/compiler` — hub-transform likely needs the compiler service. Check `src/compiler/index.js` and `packages/ols-compiler/services/compiler.js` for exact API.

**Regression guard:** `tests/integration/wiring-smoke.test.js` — `GET /lessons/gravity` and `GET /lesson-data.js?slug=gravity` exercise hub-transform. These must pass.

**Proof of completion:**
```bash
npm run verify:canonical
npm run test:integration
# GET /lessons/gravity returns valid HTML with LESSON_DATA
```

---

### H2.2 telemetry.js: engine/sm2

| # | Task | Current | Target | Proof |
|---|------|---------|--------|-------|
| H2.2 | SM2 updateSchedule | `require('../../../src/engine/sm2')` | `require('@agni/engine/sm2')` | Telemetry route updates schedule |

**Regression guard:** `tests/unit/extended-coverage.test.js` or telemetry-related tests. If none exist, add a minimal test: `require('@agni/hub')` and call a telemetry path (or rely on integration smoke).

**Proof of completion:**
```bash
npm run verify:canonical
npm test
# telemetry route uses @agni/engine/sm2
```

---

## Phase 3: Services Layer — COMPLETE

**Status:** `@agni/services` package created. Services (accounts, author, lesson-chain, lesson-assembly, governance, lms) live in `packages/agni-services/`. `src/services/` are shims that re-export from `@agni/services`.

### Option A: Keep src/services for now (minimal change)

- **Action:** Leave `context/services.js` and `index.js` importing from `src/services/`.
- **Consequence:** `verify:canonical` will still fail for hub. Phase 0 gate must **exclude** hub from the check until Phase 3 completes, OR we proceed with Option B/C.

### Option B: Create @agni/services package (recommended)

- **Action:** Create `packages/agni-services/` with `accounts`, `author`, `lesson-chain`, `lesson-assembly` (governance/lms may stay in their packages). Each service re-exports from a new canonical home or moves logic.
- **Scope:** Large — touches many files. Defer to a separate sprint.

### Option C: Hybrid — migrate only what packages already provide

- **governance:** Hub already depends on `@agni/governance`. `governanceService` could call `@agni/governance` directly; the service wrapper in `src/services/governance.js` may just be a thin adapter.
- **lms:** `@agni/engine` exposes the LMS API. `src/services/lms.js` is the service wrapper. Hub could require `@agni/engine` directly for LMS.
- **lesson-assembly, lesson-schema:** Addressed in Phase 2 (hub-transform).
- **accounts, author, lesson-chain:** Remain in src/services; hub continues to require them. Extend `verify:canonical` to **allow** `packages/agni-hub` to import from `src/services/` only (allowlist), or create `@agni/services` later.

**Recommended for this plan:** Option C — migrate governance and lms to packages; allowlist `src/services/` for accounts, author, lesson-chain until a future `@agni/services` sprint.

### H3.1 Migrate governanceService and lmsService (Option C)

| # | Task | Current | Target | Proof |
|---|------|---------|--------|-------|
| H3.1a | governanceService | `require('../../../src/services/governance')` | `require('@agni/governance')` + adapter if API differs | Governance routes work |
| H3.1b | lmsService | `require('../../../src/services/lms')` | `require('@agni/engine')` + adapter if API differs | LMS routes work |

**Regression guard:** `npm run test:integration` (theta, LMS, governance routes). `tests/unit/theta-api.test.js`, governance tests.

**Proof of completion:**
```bash
npm run verify:canonical  # if we keep strict check
npm test
npm run test:integration
```

### H3.2 Allowlist or defer accounts, author, lesson-chain

**Option A — Allowlist `src/services/` for hub only:**
- **Task:** Update `verify-canonical-ownership.js` to allow `require('*src/services/*')` from packages/agni-hub only. Fail on any other `src/` import (e.g. src/utils/, src/compiler/, src/engine/).
- **Implementation:** Add `ALLOWED_HUB_SERVICE_IMPORTS` pattern; for hub files, exclude matches from violation count.
- **Proof:** `verify:canonical` passes; hub imports only from packages + allowlisted src/services/.

**Option B — Defer:**
- Document that accounts, author, lesson-chain remain in src/; create `docs/SPRINT-SERVICES-MIGRATION.md` for future work. `verify:canonical` fails until Option A or full migration.

---

## Phase 4: Documentation Updates

### H4.1 Stale references

| # | Task | File | Change | Proof |
|---|------|------|--------|-------|
| H4.1 | Sentry playbook | `docs/playbooks/sentry.md` | `hub-tools/theta.js` → `packages/agni-hub/theta.js` | `verify:hub-docs` passes |
| H4.2 | Conventions | `docs/CONVENTIONS.md` | `hub-tools/shared.js` → `packages/agni-hub/shared.js` | Manual |
| H4.3 | Hub playbook | `docs/playbooks/hub.md` | Clarify service layer: "Business logic in src/services/ (or @agni/*); wiring in context/services.js" | Manual |

**Regression guard:** `npm run verify:hub-docs` — fails if docs reference `hub-tools/context/` or `hub-tools/routes/`. Extend if needed for other stale paths.

---

## Checklist Summary

### Phase 0 (CI gate)
- [x] H0.1: Add hub to verify-canonical-ownership (gate fails until migration done) — Proof: scripts/verify-canonical-ownership.js; allowlist for src/services/
- [x] H0.2: Confirm wiring-smoke coverage for hub routes — Proof: tests/integration/wiring-smoke.test.js

### Phase 1 (Utils)
- [x] H1: Migrate all 16 src/utils imports to @agni/utils in packages/agni-hub — Proof: `npm run verify:canonical` passes
- [x] Proof: `verify:canonical` passes for utils

### Phase 2 (Compiler + engine)
- [x] H2.1: hub-transform.js → @ols/compiler, @ols/schema, @ols/compiler/services/lesson-assembly — Proof: build passes
- [x] H2.2: telemetry.js → @agni/engine/sm2
- [x] Proof: `verify:canonical` passes; `npm run build` passes

### Phase 3 (Services)
- [x] H3.2: Allowlist src/services/ for hub in verify-canonical-ownership — Proof: `verify:canonical` passes
- [ ] H3.1: governanceService, lmsService → @agni/governance, @agni/engine (deferred; allowlist suffices)

### Phase 4 (Docs)
- [x] H4.1: sentry.md — hub-tools/theta.js → packages/agni-hub/theta.js
- [x] H4.2: CONVENTIONS.md — hub-tools/shared.js → packages/agni-hub/shared.js
- [x] Proof: `verify:hub-docs` passes

---

## Verification Commands (Final)

After all phases:

```bash
npm test
npm run test:integration
npm run test:contract
npm run test:graph
npm run verify:all
npm run verify:canonical
npm run verify:hub-docs
npm run lint
npm run format:check
```

All must pass. CI must be green on `main`.

---

## Execution Order

```
Phase 0 (H0.1, H0.2) ─────────────────────────────────────────────────┐
    │                                                                   │
    ▼                                                                   │
Phase 1 (utils migration) ────► verify:canonical starts passing for     │
    │                           utils imports only                      │
    │                                                                   │
    ├──► Phase 2 (compiler + engine) ────► verify:canonical passes      │
    │     for compiler/engine imports                                   │
    │                                                                   │
    └──► Phase 3 (services) ────► verify:canonical passes fully         │
          (or allowlist)                                                │
                                                                        │
Phase 4 (docs) ────► Can run in parallel with Phase 1–3                 │
```

---

## Definition of Done (per item)

1. **Code:** Change merged; no lint errors.
2. **Tests:** `npm test` and `npm run test:integration` pass.
3. **CI gate:** `verify:canonical` passes (or documented allowlist).
4. **Break-it check:** Reverting the fix causes the relevant gate or test to fail.
5. **Proof line:** Add `Proof:` in this document for each completed item.

---

## References

- `.cursor/rules/sprint-verification.md` — Regression tests, CI gates, wiring proof
- `PHASE-3-REMEDIATION-PLAN.md` — Prior hub migration (tests, scripts, docs; same archive)
- `docs/archive/SPRINT-R16-OPEN-BUGS.md` — R16 items (C1–C3) — verify status; many marked Done
- `AGENTS.md` — Canonical package layout
