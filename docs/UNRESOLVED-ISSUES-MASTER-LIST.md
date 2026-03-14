# Master List: All Documented Issues

Every individual issue, task, bug, and checklist item extracted from planning and remediation documents. Status: Open | Done | Deferred.

**Policy:** Items are fixed, not "documented." Formerly "Documented" limitations (P2-12, P2-13, P2-20, P2-24, Gap 4) are now **Open** and must be fixed. See [DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md](DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md) for fix tasks in architectural priority order.

---

## ARCHITECTURAL-VULNERABILITIES-REMEDIATION (Phase 1 + Hardening)

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| 1 | Cache poisoning / device binding race | hub-transform.js | Done |
| 2 | False-atomic write (no fsync) | agni-engine, json-store.js | Done |
| 3 | Cycle-triggered global DoS | theta.js | Done |
| 4 | Chrome 51 sensor event-loop exhaustion | sensor-bridge.js | Done |
| 5 | Ed25519 / TweetNaCl UI blocking | integrity.js, player.js, crypto.js | Done |
| 6 | Time-skew telemetry corruption | sentry.js, sync.js, markov.js | Done |
| 7 | KaTeX / Markdown memory spikes | package.json, hub-config | Done |
| H1 | Thundering herd (compile queue timeout) | hub-transform.js | Done |
| H2 | SD card directory fsync | json-store.js, hub-transform.js | Done |
| H3 | Sensor hardware failure blocking | threshold-evaluator.js, player.js | Done |
| H4 | Sneakernet Bayesian double-count | federation.js, engine | Done |
| H5 | Student-to-student token theft | accounts.js, http-helpers.js, hub-transform.js | Done |

---

## ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| P2-1 | Disk cache consistency race / non-atomic compilation | hub-transform.js | Done |
| P2-2 | Power-loss corruption during compilation | hub-transform.js | Done |
| P2-3 | YAML parser DoS — deep nesting | yaml-safe.js | Done |
| P2-4 | YAML parser DoS — key explosion | yaml-safe.js | Done |
| P2-5 | Factory loader supply-chain vulnerability | hub-transform, factory-loader, SW | Done |
| P2-6 | Markdown pipeline XSS / injection | Markdown renderer | Done |
| P2-7 | IR sidecar fragility (single point of failure) | Theta | Done |
| P2-8 | Directory fsync missing | json-store, engine | Done |
| P2-9 | Service Worker update / version mismatch trap | factory-loader, runtimeManifest, SW | Done |
| P2-10 | PWA race — factories vs. lesson execution | shell-boot, factory-loader | Done |
| P2-11 | Signature placeholder fragility | crypto.js, integrity.js | Done |
| P2-12 | Device ID trust boundary | Session API + integrity watermark | **Done** |
| P2-13 | Session token replay risk | Single-session + 6h TTL | **Done** |
| P2-14 | Theta rebuild hazard (partial file) | rebuildLessonIndex | Done |
| P2-15 | Graph weight runaway | Sentry, theta merge | Done |
| P2-16 | Skill cycle handling silently hides curriculum | Add governance event | Done |
| P2-17 | UTU band validation advisory only | Enforce or record override | Done |
| P2-18 | Step spec schema validation | JSON Schema per step type | Done |
| P2-19 | Sensor dependency mismatch | Check availability before execution | Done |
| P2-20 | Pi serveDir/lessons disk exhaustion | Implement GC: prune orphans, version retention | **Done** |
| P2-21 | Sneakernet import integrity | Sign packets, verify on import | Done |
| P2-22 | Catalog / IR drift | Validation step | Done |
| P2-23 | SVG stage memory leak | destroyStepVisual listeners | Done |
| P2-24 | Edge device SW cache eviction | persist(); quota; explicit eviction | **Done** |
| P2-25 | Spec.type whitelist (prototype pollution) | SVG registry | Done (audit) |
| P2-26 | LMS federation merge correctness | posteriorVersion, trainingWindow | Done |
| P2-27 | Memory budget (LRU by bytes) | Cache by bytes, not count | Done |
| P2-28 | Compile concurrency starvation | min(cores-2, 2) formula | Done |

---

## AUDIT-HARDENING-PLAN

| ID | Issue | Priority | Status |
|----|-------|----------|--------|
| A1.1 | Add yamlSchemaVersion to OLS meta | P2 | Done |
| A1.2 | Compiler: read and pass through to IR | P2 | Done |
| A1.3 | Compiler: warn on unknown schema version | P2 | Done |
| A1.4 | Hub-transform: fail gracefully on unknown fields | P2 | Done |
| A2.1 | Compile-time: validate spec params in IR builder | P1 | Done |
| A2.2 | Runtime: try/catch around fromSpec in player | P1 | Done |
| A2.3 | Runtime: try/catch in shared-runtime mountStepVisual | P1 | Done |
| A2.4 | Runtime: try/catch in shell-boot | P1 | Done |
| A2.5 | Optional: svg-registry.validateSpec(spec) | P1 | Done |
| A3 | HTML scrape fallback hardening | P3 | Resolved |
| B1.1–B1.4 | Hub-transform standalone bootstrap | P1 | Done |
| B2 | Service Worker fallback | P2 | Deferred (Android 7 baseline) |
| C1.1–C1.4 | Subresource Integrity for shared assets | P2 | Done |
| C2.1–C2.3 | Federation merge idempotency / versioning | P3 | Done |
| D1.1–D1.3 | inferredFeatures validation before LMS | P2 | Done |
| D2.1–D2.3 | Sneakernet state migration checksum | P3 | Done |
| E1.1–E1.3 | Compile-time SVG spec validation | P2 | Done |
| E2.1–E2.3 | Optional: verify:lesson-sidecars CI gate | P3 | Done |

---

## LEN-001: Math Engine Bugs (packages/agni-engine/math.js)

| ID | Bug | Priority | Status |
|----|-----|----------|--------|
| 1 | randn() throws on PRNG failure → crash in selectBestLesson | P0 | Done |
| 2 | randn discards sin sample; 2× PRNG/transcendentals per sample | P2 | Done |
| 3 | cholesky `\|\| 0` masks NaN; misleading "not SPD" error | P0 | Done |
| 4 | Symmetry check O(n²) on every invertSPD | P2 | Done |
| 5 | Cholesky square check separate pass | P3 | Done |
| 6 | outer() reuses loop var i | P3 | Done |
| 7 | addMat row 0 validated twice | P3 | Done |
| 8 | matVec/addMat validation inconsistency | P3 | Done |
| 9 | forwardSub/backSub don't validate L | P1 | Done |
| 10 | identity(0) / federation zero-dim path | P3 | Done |
| 11 | dot() naive summation FP error | P4 (no action) | — |
| 12 | scaleMat O(n²) sparse check in updateBandit hot path | P2 | Done |
| 13 | Symmetry tolerance 1e-12 too tight post-federation | P0 | Done |
| 14 | addVec/addMat `+` concatenates strings | P1 | Done |
| 15 | dot/addVec/scaleVec NaN for sparse | P1 | Done |
| 16 | scaleVec/matVec no array type check | P2 | Done |
| 17 | invertSPD diagonal not symmetrized | P3 | Done |
| 18 | randn can return Infinity for tiny u | P3 | Done |

---

## SHIM-AND-CODE-AUDIT-FINDINGS

| ID | Issue | Risk | Status |
|----|-------|------|--------|
| 1 | Shim export fragility | Low | Done |
| 2-1 | yaml-safe: str.length counts UTF-16, not bytes | High | Done |
| 2-2–4 | yaml-safe: Anchor/alias regex bypasses | High | Done |
| 2-5 | yaml-safe: JSON_SCHEMA allows Date, binary, omap | Medium | Done |
| 2-8 | yaml-safe: Prototype pollution | High | Done |
| 2-9 | yaml-safe: Stack trace leakage | Low | Done |
| 2-10 | yaml-safe: Regex DoS on pathological strings | Medium | Done |
| 3-1 | svg-stage: NodeList.forEach ES5 inconsistency | Low | Done (polyfills + doc) |
| 3-2 | svg-stage: RAF tick handlers after destroy | Low | Done |
| 3-3 | svg-stage: Tick handler ID not unique | Low | Done |
| 3-4 | svg-stage: Layer ID injection | Medium | Done |
| 3-5 | svg-stage: container.innerHTML destroys listeners | Medium | Done |
| 3-8 | svg-stage: unsub() when unsub not a function | Medium | Done |
| 3-9 | svg-stage: subscribeToSensor returns undefined | Medium | Done |
| 3-10 | svg-stage: btoa/unescape for large SVG | Low | Done |
| 3-11 | svg-stage: PNG export tainted canvas → silent '' | Low | Done |
| 3-13 | svg-stage: destroy() double-call | Low | Done |
| 3-14 | svg-stage: _layers map never cleared | Low | Done |

---

## GAP-ANALYSIS-AND-MITIGATIONS

| ID | Gap | Status |
|----|-----|--------|
| 1 | YAML schema versioning | Resolved |
| 2 | DAG validation | Resolved |
| 3 | HTML scrape fallback | Resolved |
| 4 | Device UUID trust | **Done** — session API + integrity (P2-12) |
| 5 | Federation merge version/timestamp | Resolved |
| 6 | Service Worker on Android | Resolved (Android 7 baseline) |
| 7 | Root player.js stub | Resolved |

---

## RUNTIME-MANIFEST-IMPROVEMENT-PLAN

| ID | Task | Status |
|----|------|--------|
| RM1.1–RM1.3 | DRY: derive getOrderedFactoryFiles from FACTORY_LOAD_ORDER | Done |
| RM2.1–RM2.2 | API cleanup: remove unused specIds | Done |
| RM3.1–RM3.2 | Documentation and comments | Done |
| RM4.1–RM4.2 | Defensive resolveFactoryPath | Done |
| RM5.1–RM5.3 | Test import path + playbook updates | Done |
| RM6.1–RM6.2 | CI cross-check: factory map / hub whitelist | Done |

---

## ENV-VALIDATION-CONSOLIDATION

| ID | Task | Status |
|----|------|--------|
| EVC-1 | Shared env-ranges.js for bounds | Done |
| EVC-2 | Align env-validate to env-config ranges | Done |
| EVC-3 | Centralize process.env reads in env-config | Done |
| EVC-4 | hub-config CONFIG_KEYS expansion | Done |

See `docs/ENV-VALIDATION-SPLIT.md`.

---

## SENSOR-TOOLKIT-IMPROVEMENT-PLAN

| ID | Task | Status |
|----|------|--------|
| STK-1.1 | Add orientation virtual sensor | Done |
| STK-1.2 | Add orientation to threshold grammar | Done |
| STK-1.3 | Phyphox sound mapping | Done |
| STK-1.4 | Document light/mic as Phyphox-only | Done |
| STK-2.1 | Optional low-pass smoothing for accel | Done |
| STK-2.2 | Add shake virtual sensor | Done |
| STK-2.3 | Sensor-optional fallback for hardware_trigger | Done |
| STK-3.1 | Adaptive evaluation cadence for low-end | Done |
| STK-3.2 | CI gate for known sensor IDs | Done |
| STK-3.3 | Integration smoke test for sensor-enabled lesson | Done |

---

## OPPORTUNISTIC-PRECACHE-PLAN (archive)

| ID | Task | Status |
|----|------|--------|
| P1.1a–c | Add precacheSlugs to theta response | Done |
| P2.1–P2.4 | Client-side precache orchestrator | Done |
| P3.1–P3.2 | SW bounded lesson cache + LRU | Done |
| P4.1–P4.3 | Integration & tuning | Done |

---

## PHASE-3-REMEDIATION-PLAN

| ID | Task | Status |
|----|------|--------|
| A1.1–A1.3 | Update tests to use @agni/hub | Done |
| A2.1–A2.2 | Update verification scripts | Done |
| A3.1–A3.3 | Lint/format scripts and CI paths | Done |
| A4.1–A4.13 | Update documentation | Done |
| A5.1–A5.2 | CI gate: no hub-tools-only imports | Done |
| A6.1 | Optional: docs consistency gate | Done |
| B1.1 | Log aggregator / telemetry ingestion | **Done** — ingest API, multi-cohort graph_weights, cohort-aware theta |
| B2.1–B2.2 | Outreach & pitch | Done |
| B3.1–B3.2 | Sensory & accessibility review | Done |
| C1.1–C1.4 | SPRINT-R16: file locking, sentry, parent auth | See SPRINT-R16 |

---

## SPRINT-R16-OPEN-BUGS (archive)

| ID | Task | Status |
|----|------|--------|
| C1.1 | Add locking to groups routes | Done |
| C1.2 | Add locking to parent routes | Done |
| C1.3 | Lock checkpoint save | Done |
| C1.4 | Add locking to session cleanup and destroy | Done |
| C2.1 | Bound sentry event buffer | Done |
| C2.2 | Fix sentry UTF-8 body parsing | Done |
| C2.3 | Fix longestStreak early exit | Done |
| C3.1 | Fix hardcoded SW version | Done |
| C3.2 | Add sentry data retention | Done |
| C3.3 | Fix PageRank cache leak | Done |
| C3.4 | Add parent auth (short-term: rate limit) | Done |

---

## ROADMAP (unchecked items)

| ID | Task | Status |
|----|------|--------|
| R1 | Day 76-80: Publish Manifesto to HN, Reddit, Dev.to | **Ready** — see docs/LAUNCH-CHECKLIST.md |
| R2 | Day 81-85: Triage Issues | **Ready** — see docs/LAUNCH-CHECKLIST.md |
| R3 | Day 81-85: Label "Good First Issues" | **Ready** — see docs/LAUNCH-CHECKLIST.md |
| R4 | Day 86-90: Record video "How to Fork and Translate" | **Ready** — see docs/LAUNCH-CHECKLIST.md (optional) |
| R5 | Day 96-100: Research TipTap for WYSIWYG | **Open** |
| R6 | Day 96-100: Finalize v1.0 Spec | **Done** — docs/specs/ols-v1.0-spec.md |
| R7 | Future: The Editor (drag-and-drop GUI) | **Done** — form-based editor in vanilla portal (meta, steps, ontology; Validate/Preview/Save; step reorder) |
| R8 | Future: Plugins for Moodle, Kolibri, Canvas | **Phase 1–2** — [playbooks/lms-plugins.md](playbooks/lms-plugins.md); LTI server, postMessage, Moodle/Canvas docs |
| R9 | Future: The Mesh (graph_weights sync via LoRa) | **Done** — design + impl ([playbooks/mesh-lora.md](playbooks/mesh-lora.md)); UDP sim; run `node hub-tools/mesh.js` or `sync.js --transport=lora` |
| R10 | Future: Reference implementation refactor | **Done** — schema-based, pure pipelines, documented boundaries; see REFERENCE-IMPLEMENTATION-VISION.md §4.1–4.2 |

**R7 Editor limitations (future improvements):**

- Gate editor, fill_blank, matching, ordering added (Y5). Ontology editable.
- No live HTML/Markdown preview pane (Preview only reports success)
- Move up/down buttons for step reorder; no native drag-and-drop

---

## YEAR2-PREP

| ID | Task | Status |
|----|------|--------|
| Y1 | E2: Meta form (/author/new) | **Open** |
| Y2 | E3: Step editor | **Open** |
| Y3 | E4: Preview button | **Open** |
| Y4 | E5: Save | **Open** |
| Y5 | E6–E8: Gate, ontology, all step types | **Done** |
| Y6 | E9: YAML round-trip | **Open** |
| Y7 | Freeze OLS schema | **Open** |
| Y8 | Document breaking vs additive | **Done** — docs/BREAKING-VS-ADDITIVE.md |
| Y9 | Reference implementation compliance | **Done** — CI enforces validate, test, test:graph, verify:all; see REFERENCE-IMPLEMENTATION-VISION.md §4.3 |
| Y10 | Changelog | **Done** — CHANGELOG.md maintained |

---

## LAUNCH-AND-COMMUNITY

| ID | Task | Status |
|----|------|--------|
| L1 | Publish manifesto / intro to HN, Reddit, Dev.to | **Ready** — see docs/LAUNCH-CHECKLIST.md |
| L2 | Pin README and CONTRIBUTING | Done |
| L3 | Tag a release (v0.1.0 or v0.2.0) | Done — v0.2.1 |
| L4 | Triage issues regularly | **Ready** — see docs/LAUNCH-CHECKLIST.md |
| L5 | Record 5–10 min tutorial video | **Ready** — see docs/LAUNCH-CHECKLIST.md (optional) |

---

## CHECK-JS-ENABLEMENT-PLAN

| ID | Task | Status |
|----|------|--------|
| JS-0.1 | LMS/Engine types out of sync | Done |
| JS-0.2 | Compile result shape (hub-transform) | Done |
| JS-1.1 | Window augmentation | Done |
| JS-1.2 | AgniShared / AgniSvgHelpers augmentation | Done |
| JS-2.1 | HTTP namespace | Done |
| JS-2.2 | Error extensions | Done |
| JS-2.3 | Auth context type | Done |
| JS-* | Remaining Phase 2+ items | Partial |

---

## CHECK-JS-FINISH-PLAN

| ID | Task | Package | Status |
|----|------|---------|--------|
| F1.1 | migrations.js type fixes | agni-engine | **Open** |
| F1.2 | pagerank.js type fixes | agni-engine | **Open** |
| F1.3 | index.js type fixes | agni-engine | **Open** |
| F2.1–F2.3 | hub type fixes | agni-hub | **Open** |
| F3.1–F3.3 | utils type fixes | agni-utils | **Open** |
| F4.1 | ols-schema fix | ols-schema | **Open** |
| F5.1 | ols-compiler fix | ols-compiler | **Open** |
| F6.1–F6.20 | runtime type fixes | agni-runtime | **Open** |

---

## Summary: Open issues by priority

| Priority | Count | Examples |
|----------|-------|----------|
| **P0 (Critical)** | 0 | All Done (randn, cholesky NaN, federation symmetry) |
| **P1 (High — fix first)** | 2 | P2-20 (disk GC); P2-24 (SW eviction) |
| **P2 (Medium)** | 2 | P2-17; svg-stage 3-10, 3-11 |
| **P3 (Low)** | 12+ | LEN-001 #5, #8; svg-stage 3-1; E2.1–E2.3; audit items |
| **Roadmap / Launch** | 8+ | R6, Y8, Y10 Done; R1–R4, L1, L4, L5 Ready (see LAUNCH-CHECKLIST); R5, R8, Y1–Y7 Open |
| **TypeScript** | ~30 | CHECK-JS-FINISH-PLAN per-file fixes |

---

## References

- **Documented-to-fix policy:** [DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md](DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md)
- Mesh design (R9): `playbooks/mesh-lora.md`
- LMS plugins (R8): `playbooks/lms-plugins.md`
- Env validation: `ENV-VALIDATION-SPLIT.md`
- Source documents (includes DOCUMENTED-TO-FIX-REMEDIATION-PLAN): `archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md`, `archive/ARCHITECTURAL-AUDIT-FINDINGS.md`, `archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md`, `archive/ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN.md`, `AUDIT-HARDENING-PLAN.md`, `LEN-001-MATH-ENGINE-BUGS.md`, `SHIM-AND-CODE-AUDIT-FINDINGS.md`, `archive/GAP-ANALYSIS-AND-MITIGATIONS.md`, `archive/RUNTIME-MANIFEST-IMPROVEMENT-PLAN.md`, `archive/sensor-toolkit-improvement-plan.md`, `archive/OPPORTUNISTIC-PRECACHE-PLAN.md`, `archive/PHASE-3-REMEDIATION-PLAN.md`, `archive/SPRINT-R16-OPEN-BUGS.md`, `ROADMAP.md`, `YEAR2-PREP.md`, `LAUNCH-AND-COMMUNITY.md`, `CHECK-JS-ENABLEMENT-PLAN.md`, `CHECK-JS-FINISH-PLAN.md`
