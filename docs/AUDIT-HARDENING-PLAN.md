# Audit Hardening Plan

Plan to address gaps identified in the architecture/audit review. Items are prioritized by severity and grouped by theme. Each item follows the sprint verification rule: Proof (regression test or CI gate), Wiring (call-chain), and where applicable, integration smoke tests.

**Reference:** Audit summary, `docs/ARCHITECTURE.md` (Known Gaps), `.cursor/rules/sprint-verification.md`.

---

## Priority Legend

| P | Meaning | When to implement |
|---|---------|-------------------|
| **P0** | Security or data-corruption risk | Next sprint |
| **P1** | Runtime stability / edge-case crash | Within 2 sprints |
| **P2** | Forward compatibility / maintainability | When touching that code |
| **P3** | Documentation / low-risk improvement | As capacity allows |

---

## Phase 1: YAML & IR Handling

### A1. YAML schema versioning (P2)

**Gap:** YAML files are unversioned; IR has `_schemaVersion`. Old hubs may receive YAML with new fields they cannot parse.

| Task | Scope | Deliverable |
|------|-------|-------------|
| A1.1 | Add optional `yamlSchemaVersion` to OLS meta | `schemas/ols.schema.json` meta.properties; `src/types/index.d.ts` LessonMeta |
| A1.2 | Compiler: read and pass through to IR | `packages/ols-compiler/compiler/build-lesson-ir.js`; `buildLessonSidecar()` |
| A1.3 | Compiler: warn on unknown schema version | If `yamlSchemaVersion` > known max, log warning; continue with best-effort parse |
| A1.4 | Hub-transform: fail gracefully on unknown fields | Ensure js-yaml/validate doesn't throw on extra keys; optional: strip unknown at load |

**Proof:**
- Regression: `tests/unit/regressions.test.js` → "AUDIT-A1: yamlSchemaVersion passed through to IR"
- Regression: "AUDIT-A1: unknown yamlSchemaVersion logs warning, does not throw"

**Wiring:** CLI/hub-transform → parseLessonYaml → buildLessonIR → sidecar; theta reads sidecar.

**Dependencies:** None.

---

### A2. SVG spec param validation & try/catch (P1)

**Gap:** Malformed SVG params (e.g. `length: "abc"`) can crash `AGNI_SVG.fromSpec()`; no runtime recovery.

| Task | Scope | Deliverable |
|------|-------|-------------|
| A2.1 | Compile-time: validate spec params in IR builder | `packages/ols-compiler` — when building step with `svg_spec`, validate factory exists and required opts are numeric where expected |
| A2.2 | Runtime: try/catch around fromSpec in player | `packages/agni-runtime/ui/player.js` — wrap `SVG.fromSpec(svgSpec, svgContainer)` in try/catch; on error: log, show fallback placeholder, continue |
| A2.3 | Runtime: try/catch in shared-runtime mountStepVisual | `packages/agni-runtime/shared-runtime.js` — same pattern |
| A2.4 | Runtime: try/catch in shell-boot | `packages/agni-hub/pwa/shell-boot.js` — same pattern |
| A2.5 | Optional: svg-registry.validateSpec(spec) | Coerce/clamp numeric params from IR; return sanitized spec or throw |

**Proof:**
- Regression: "AUDIT-A2: fromSpec with malformed params (length: 'abc') does not throw; fallback rendered"
- Regression: "AUDIT-A2: fromSpec with missing factory logs and shows placeholder"
- Break-it: Remove try/catch → test fails

**Wiring:** player.js mountStepVisual → SVG.fromSpec; shared-runtime mountStepVisual → AGNI_SVG.fromSpec; shell-boot → AGNI_SVG.fromSpec.

**Dependencies:** None.

---

### A3. HTML scrape fallback hardening (P3) *(Resolved)*

**Gap (was):** Brittle; markup changes could break indexing. Lessons without IR could silently fail.

**Current state:** **Resolved.** Theta now refuses to index lessons without IR. No HTML scraping; lessons without `index-ir.json` are skipped and a warning is logged. Single source of truth enforced. See `theta.js` `rebuildLessonIndex()` and `docs/ARCHITECTURE.md`.

---

## Phase 2: Hub & Compiler Concerns

### B1. Hub-transform standalone bootstrap (P1)

**Gap:** Standalone hub-transform does not call `loadHubConfig()`; caller must. No enforcement.

| Task | Scope | Deliverable |
|------|-------|-------------|
| B1.1 | Add loadHubConfig to hub-transform before env-config | `packages/agni-hub/hub-transform.js` — at top, before any require of env-config: `loadHubConfig(path.join(__dirname, '../../data'))` |
| B1.2 | Ensure hub-transform does not require env-config before loadHubConfig | Audit require order; env-config is pulled in via `envConfig` — ensure it's after loadHubConfig |
| B1.3 | Add hub-transform to check-hub-config-bootstrap | `scripts/check-hub-config-bootstrap.js` — add hub-transform.js to checked files (if it has its own entry path) |
| B1.4 | Or: document that startStandalone has no entry script | If hub-transform is only ever required by theta, no standalone entry exists — add comment in startStandalone: "Caller must have run loadHubConfig if using custom data dir" |

**Decision:** If theta is the only process that loads hub-transform, bootstrap is already correct. If there is a `node hub-transform.js` or similar, add loadHubConfig there.

**Proof:**
- Regression: "AUDIT-B1: hub-transform can resolve YAML_DIR after loadHubConfig"
- CI: check-hub-config-bootstrap already passes for theta; extend if hub-transform has standalone entry

**Wiring:** theta startApi → require hub-transform → attachRoutes. Standalone: hypothetical entry → must call loadHubConfig first.

**Dependencies:** None.

---

### B2. Service Worker fallback (P2) — *Deferred*

**Former gap:** Android 6 (Marshmallow) WebView had inconsistent SW support.

**Resolution:** Edge baseline changed to Android 7.0 (Nougat, API 24), which has reliable Service Worker support. B2 tasks are deferred; implement only if we resume support for pre-Nougat devices.

---

## Phase 3: Security & Runtime Verification

### C1. Subresource Integrity (SRI) for shared assets (P2) — **Done**

**Gap:** shared-runtime.js, svg-stage.js not per-lesson signed; MITM could serve malicious JS.

**Implemented:** Hub computes SRI (sha384) at compile time; integrity hashes embedded in LESSON_DATA (signed lesson). Factory-loader verifies each fetch before execution. MitM on factory fetch fails SRI.

| Task | Scope | Deliverable |
|------|-------|-------------|
| C1.1 | Compute SRI hash at hub build/serve time | ✓ When serving factories, compute SHA-384; hub-transform and ols-compiler add to `dep.integrity` |
| C1.2 | Inject integrity attribute in lesson HTML | `lessonAssembly` or html builder: `<script src="..." integrity="sha384-..."></script>` |
| C1.3 | Ensure factory-loader uses same integrity | Factory loader fetches factories; add integrity to script tags it injects |
| C1.4 | Cache-bust consideration | SRI changes when file changes; Cache-Control + ETag already handle invalidation |

**Proof:**
- Regression: "AUDIT-C1: lesson HTML script tags include integrity attribute for shared-runtime"
- Smoke: `GET /lessons/:slug` response contains `integrity="sha384-` in script tags

**Wiring:** hub-transform serve factories → compute hash; lessonAssembly build script block → add integrity; factory-loader (if dynamic) → add integrity.

**Dependencies:** None.

---

### C2. Federation merge idempotency / versioning (P3) — **Done**

**Gap:** Duplicate or out-of-order merges could skew posteriors. Content hash dedup exists but no monotonic version.

| Task | Scope | Deliverable |
|------|-------|-------------|
| C2.1 | Document current behavior | **Done** — `docs/playbooks/federation.md` §5; contentHash dedup, MAX_SEEN_SYNC_IDS, hubHighWater |
| C2.2 | Optional: add mergeTimestamp to merge API | **Done** — mergeRemoteSummary returns `{ merged, mergeTimestamp?, mergeVersion? }`; POST response includes them |
| C2.3 | Optional: monotonic merge version in state | **Done** — `mergeVersion` in bandit state; incremented on each successful merge; migrations support it |

**Proof:**
- Regression: "AUDIT-C2: mergeRemoteSummary returns merged/mergeTimestamp/mergeVersion" — `tests/unit/regressions.test.js`
- Regression: "AUDIT-C2: mergeBanditSummaries is idempotent" — `tests/unit/engine-federation.test.js`
- Integration: "R1: mergeRemoteSummary is idempotent" — `tests/integration/select-best-lesson.test.js`

**Dependencies:** None.

---

## Phase 4: LMS & Engine

### D1. inferredFeatures validation before LMS (P2)

**Gap:** Bad feature inference could produce MLC < 0 or non-finite; engine could sort incorrectly.

| Task | Scope | Deliverable |
|------|-------|-------------|
| D1.1 | Clamp inferredFeatures.difficulty at theta/engine boundary | When building candidate features for bandit, ensure difficulty in [0, 1]; clamp NaN/Infinity |
| D1.2 | Validate lesson sidecar inferredFeatures on index load | `rebuildLessonIndex` or engine seedLessons: reject or clamp invalid values |
| D1.3 | Log warnings for clamped values | "AUDIT-D1: inferredFeatures.difficulty out of range, clamped" |

**Proof:**
- Regression: "AUDIT-D1: lesson with difficulty NaN produces clamped value for LMS"
- Regression: "AUDIT-D1: inferredFeatures with Infinity does not break bandit"

**Wiring:** theta getLessonsSortedByTheta / engine selectBestLesson → lesson inferredFeatures → clamp before use.

**Dependencies:** None.

---

### D2. Sneakernet state migration checksum (P3) — **Done**

**Gap:** Power loss during migration could corrupt state. Atomic write exists; checksum adds verification.

| Task | Scope | Deliverable |
|------|-------|-------------|
| D2.1 | Optional: append content hash to saved state | ✓ SHA-256 of state payload stored as `_checksum` in JSON; `packages/agni-engine/index.js` |
| D2.2 | On load: verify checksum before using | ✓ Checksum mismatch → backup to `.bak`, return fresh state |
| D2.3 | lms-repair: document checksum verification | ✓ CLI help and console output mention checksum verification |

**Proof:**
- Regression: "AUDIT-D2: corrupted state file triggers repair path" — `tests/unit/regressions.test.js`

**Dependencies:** None.

---

## Phase 5: Compile-Time & Static Analysis

### E1. Compile-time SVG spec validation (P2)

**Gap:** Invalid SVG spec params only surface at runtime.

| Task | Scope | Deliverable |
|------|-------|-------------|
| E1.1 | In buildLessonIR or step processor: validate svg_spec | For each step with type svg / svg_spec: ensure factory exists in registry, numeric params are numbers |
| E1.2 | Fail compile or warn | Option: --strict svg validation fails compile; default: warn |
| E1.3 | Add to compiler test suite | tests/unit/compiler.test.js: "rejects or warns on invalid svg_spec params" |

**Proof:**
- Regression: "AUDIT-E1: compile warns on svg_spec with length: 'abc'"
- Break-it: Remove validation → test fails

**Wiring:** buildLessonIR → processSteps → validate svg_spec per step.

**Dependencies:** Can be done in parallel with A2.

---

### E2. Optional: verify:lesson-sidecars CI gate (P3)

**Gap:** Deploying lessons without IR sidecars causes them to be skipped (not indexed). Theta already refuses to index; this gate catches the condition earlier.

| Task | Scope | Deliverable |
|------|-------|-------------|
| E2.1 | Script: for each index.html in serveDir/lessons, require index-ir.json | `scripts/check-lesson-sidecars.js` |
| E2.2 | Add to verify:all or as optional gate | `verify:lesson-sidecars` |
| E2.3 | Allow override for legacy lessons | `--allow-legacy` or env AGNI_ALLOW_LEGACY_LESSONS |

**Proof:**
- CI gate itself is proof

**Dependencies:** None.

---

## Execution Order (Recommended)

| Phase | Items | Status |
|-------|-------|--------|
| 1 | A2 (SVG try/catch) — highest runtime impact | **Done** — shared-runtime, player, shell-boot |
| 2 | B1 (hub-transform bootstrap) | **Done** — loadHubConfig added; check-hub-config-bootstrap extended |
| 3 | A1 (yamlSchemaVersion) | **Done** — schema, IR, sidecar, warn on unknown |
| 4 | A2 compile-time (E1), D1 (inferredFeatures clamp) | **Done** — NUMERIC_PARAM_KEYS warn; seedLesson clamps |
| 5 | C1 (SRI) — security improvement | **Done** — SRI in LESSON_DATA, factory-loader verifies |
| 6 | B2 (SW fallback), C2, D2 ✓, E2 | D2 done; B2 deferred |

---

## Checklist Template (per item)

Before marking any item complete:

- [ ] Regression test added and passes
- [ ] Break-it check: revert fix, test fails
- [ ] CI gate added if class-level claim
- [ ] Wiring documented in this plan or commit
- [ ] Integration smoke test if route/wiring change
- [ ] `src/types/index.d.ts` updated if engine/API changed
- [ ] docs/ARCHITECTURE.md Known Gaps table updated if gap is closed

---

## References

- `docs/ARCHITECTURE.md` — Known Gaps & Mitigations
- `.cursor/rules/sprint-verification.md` — Proof, Wiring, CI gates
- `docs/playbooks/compiler.md` — Compiler change locations
- `docs/playbooks/runtime.md` — Runtime change locations
- `docs/playbooks/sentry.md` — MLC, graph weights
