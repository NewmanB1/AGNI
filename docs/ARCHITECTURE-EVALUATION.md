# Architecture Evaluation and Critique

This document evaluates the AGNI/OLS project architecture against its stated goals. It is intended to support planning, onboarding, and refactoring decisions.

**Last updated:** Reflects post–backlog state: migrations, runtimeManifest, binary utils, engine types, sneakernet, authoring APIs, Sentry playbook, ROADMAP and doc updates, portal–hub contract tests.

---

## 1. Stated Goals (Synthesis)

From README, ROADMAP, and docs/ARCHITECTURE.md, the project aims to:

| Goal | Source |
|------|--------|
| **Establish the `.ols` file standard** and a reference player for offline, sensor-rich, culturally adaptive education | ROADMAP, README |
| **Prove the "Skill Collapse" (θ) navigation model** — cohort-adaptive lesson ordering (e.g. weaving vs farming metaphors) | ROADMAP, docs/ARCHITECTURE §7 |
| **Source-to-artifact, JIT at the edge** — distribute lightweight YAML; generate HTML/artifacts at the Village Hub; minimize bandwidth | docs/ARCHITECTURE §1, §4 |
| **100% offline capability** — no internet required on devices; hub updates via sneakernet/satellite/LoRa/USB | docs/ARCHITECTURE §1 |
| **Hardware reality** — Android 4.0+ (or 6.0+ in places), &lt;2GB RAM, intermittent power | docs/ARCHITECTURE §1, README |
| **Trust and binding** — hub-and-spoke content distribution; signed lease / device binding to prevent P2P content cloning | docs/ARCHITECTURE §5 |
| **Epistemic pluralism** — adapt learning paths to local "generative metaphors" and cohort data (UTUs, graph weights, Sentry) | docs/ARCHITECTURE §7, §8 |
| **Ecosystem** — teacher portal, future WYSIWYG builder, federation across village hubs | ARCHITECTURE.md §2.10, ROADMAP |

---

## 2. What the Architecture Does Well

### 2.1 Aligned with goals

- **Single canonical IR**  
  `buildLessonIR` is the one place where YAML becomes a machine contract. All builders, theta, and the LMS consume IR/sidecar. This supports the “file format and compiler” goal and keeps the standard well-defined.

- **Clear separation of scheduling vs. selection**  
  Theta enforces prerequisites and MLC ordering; the LMS engine handles selection within the eligible set (Rasch + embeddings + bandit). That matches the goal of “proving” the θ model while allowing a principled ML layer on top.

- **Offline-first design**  
  Lessons compile to self-contained HTML (or native bundle); runtime uses cached factories and a service worker. No runtime dependency on a live server for playback. Supports “100% offline” and low-bandwidth updates.

- **Hub as single place for compilation and scheduling**  
  Hub-transform does JIT YAML→HTML at request time; theta and LMS run on the hub. Devices get pre-compiled artifacts and API responses. This matches “source-to-artifact” and “edge” deployment.

- **Governance and UTUs as data**  
  Policy is JSON; compliance and cohort coverage are separate from lesson content and scheduling. Portal and hub APIs are defined so the portal can stay a thin UI. Aligns with “governance” and “epistemic pluralism” without hard-coding policy in the engine.

- **Documentation and boundaries**  
  Root ARCHITECTURE.md (implementation overview), docs/ARCHITECTURE.md (conceptual), api-contract.md, playbooks (compiler, runtime, LMS, governance, sentry), CONVENTIONS.md, and the services layer give clear entry points and contracts. DRAFT and “not yet implemented” notes have been pruned or updated. ROADMAP.md reflects completed phases and backlog (sneakernet, Sentry partial, threshold syntax, authoring APIs).

- **Trust and device binding**  
  Signing (utils/crypto.js) and runtime verification (player.js `verifyIntegrity()` with SubtleCrypto + TweetNaCl fallback) are implemented. CLI and hub-transform both inject OLS_SIGNATURE, OLS_PUBLIC_KEY, OLS_INTENDED_OWNER via the shared lessonAssembly service. The “signed lease” goal is met in code and documented.

- **State and progress portability**  
  LMS state migration/repair (`src/engine/migrations.js`) and CLI `lms-repair` reduce “delete the file” as the only recovery. Sneakernet export/import (`scripts/sneakernet.js`, gzip+base64) allows progress to move between hubs or devices without live sync.

- **Authoring surface**  
  Authoring APIs (POST /api/author/validate, POST /api/author/preview) are implemented and covered by contract tests. The system supports “preview and validate before save” for a future WYSIWYG editor.

- **Sentry and cultural adaptation narrative**  
  Sentry logic and graph_weights output (hub-tools/sentry.js), schema (graph_weights.schema.json), and the flow into theta (getEffectiveGraphWeights) are documented in docs/playbooks/sentry.md. The “cultural adaptation” loop is implementable and described; production telemetry ingestion remains optional.

- **Refactor backlog addressed**  
  runtimeManifest decouples feature inference from filenames; binary utils are centralized (Node and browser); IR and engine types are formalized (index.d.ts, engine *.d.ts); LMS migrations and sneakernet script exist. Modularity and type safety are improved.

### 2.2 Pragmatic choices

- **Dual delivery** — CLI build for static export and hub-transform for on-demand PWA. Covers both sneakernet and “device requests lesson from hub” without two separate codebases.
- **Shared lesson assembly** — One script block (lessonAssembly) for CLI and hub-transform keeps integrity globals and bootstrap consistent.
- **Graceful degradation** — Theta and LMS can run without the compiled engine (e.g. missing index.js); scheduling still works with a clear “degraded” signal.
- **Portal–hub contract tests** — tests/contract-hub-api.js starts theta on an ephemeral port and asserts theta, LMS, governance, and authoring endpoint shapes. The ecosystem boundary is testable when VITE_HUB_URL is used.

---

## 3. Critique: Remaining Gaps and Tensions

### 3.1 Goal vs. implementation

- **Hardware and runtime baseline**  
  README says “Android 6.0+”; docs/ARCHITECTURE refers to Android 4.0+ and ES5 in runtime. The “hardware reality” goal is still not pinned to a single, audited compatibility matrix (e.g. one baseline, one-line CI or checklist). Runtime hot paths are ES5-friendly but not formally verified.

- **Roadmap vs. proof**  
  ROADMAP is updated with completed items. The “prove θ” goal is **implementable** (theta + LMS + graph_weights + Sentry flow documented) but not yet **proven in the field**: the “Weaver vs. Farmer Cohort” graph verification test (Day 91–95) is still open. Cultural adaptation is narrative-complete; empirical validation is pending.

### 3.2 Data and consistency

- **Two architecture docs**  
  Root ARCHITECTURE.md = implementation overview and refactor notes; docs/ARCHITECTURE.md = conceptual design and phase roadmap. The split is explicit and cross-linked, but both are long. New contributors (and LLMs) still need to know which to use for “what exists” vs. “what we want.”

- **Lesson index and LMS state**  
  Theta builds the lesson index from sidecars; the LMS has lms_state.json. Migrations and repair reduce risk when state shape changes, but there is no formal story for “lesson catalog changed” (e.g. lessons removed, IDs renamed) beyond reload/rebuild.

- **Portal default**  
  Portal uses mock data unless VITE_HUB_URL is set. Contract tests guard the API boundary when the hub is running; the portal is one config away from being a first-class consumer but not the default.

### 3.3 Modularity and scaling

- **Governance and theta coupling**  
  Governance HTTP routes live in theta.js. For a single-process hub this is acceptable; if governance or reporting later need a separate service or scaling, the coupling would need to be broken out.

- **Engine runtime**  
  The engine is TypeScript (index.ts) with JS numerical modules and `.d.ts` shims. There is no built index.js in tree (engine runs via ts-node or after a TS build in some environments). Sneakernet and LMS service assume the engine is loadable; in a clean clone without a build step, engine-dependent paths may report “not available.”

### 3.4 Missing or underspecified

- **Native bundle (Strategy B)**  
  native.js builder exists; integration with theta/hub and deployment story are less documented than the HTML path.

- **Federation and sync**  
  federation.js and hub-tools/sync.js support bandit merge and cross-hub signaling; the deployment model (who runs sync, how often, hub discovery) is not fully spelled out in the architecture.

- **QR / Base45 for progress**  
  Sneakernet uses gzip+base64. ROADMAP marks Base45/QR for progress as optional/deferred; the “export progress as QR” goal is only partially met.

- **WYSIWYG editor**  
  Authoring APIs (validate, preview) are in place. A full drag-and-drop editor is a Year 2 horizon; the architecture reserves space but does not yet ship the editor.

---

## 4. Summary Table

| Goal | Alignment | Notes |
|------|-----------|--------|
| .ols standard + reference player | **Strong** | IR, schema, CLI, hub-transform, runtime, threshold syntax, validation |
| Prove θ / Skill Collapse model | **Strong (implementation)** | Theta + LMS + graph_weights + Sentry flow documented; proof in production (e.g. Weaver vs Farmer test) pending |
| Source-to-artifact, JIT at edge | **Strong** | Hub-transform + lessonAssembly; CLI for static export |
| 100% offline | **Strong** | Self-contained HTML; SW cache; sneakernet export/import |
| Hardware (Android, RAM, power) | **Unclear** | Docs differ (4.0 vs 6.0); no single compatibility matrix or CI |
| Trust / device binding | **Strong** | Signing + verifyIntegrity (SubtleCrypto + TweetNaCl); same globals for CLI and PWA |
| Epistemic pluralism / adaptation | **Strong (narrative + code)** | UTUs, governance, theta, Sentry/graph_weights playbook; production telemetry optional |
| Ecosystem (portal, authoring, federation) | **Partial → Strong** | Portal API client + contract tests; authoring APIs (validate/preview) implemented; federation code present, deployment model underspecified |

---

## 5. Recommendations

1. **Lock hardware and runtime policy**  
  Decide and document one Android/runtime baseline (e.g. “Android 6.0+, ES5 in runtime”). Add a short “Compatibility” section and, if feasible, a simple CI or checklist so the “hardware reality” goal is testable.

2. **Run the Graph Verification Test**  
  Execute the Day 91–95 item: simulate “Weaver Cohort” vs “Farmer Cohort” (e.g. different mastery inputs), confirm lesson menu order differs by cohort. That turns “prove θ” from implementable to demonstrated.

3. **Document federation deployment**  
  In ARCHITECTURE or a playbook, describe how sync/federation are intended to run (which process, how often, hub discovery). Keeps the “ecosystem” goal clear as more hubs are deployed.

4. **Optional: Engine build or run instructions**  
  If the engine is expected to run in environments that don’t use ts-node, add a build step or clear “run with ts-node” instructions so LMS, sneakernet, and theta’s engine-dependent features are available out of the box.

5. **Keep portal–hub as first-class**  
  Contract tests already guard the boundary. Consider documenting “running the portal against the hub” in the main README (already present) and keeping VITE_HUB_URL as the supported path for real data.

---

## 6. Conclusion

The system is **well aligned** with its goals. The standard (IR/sidecar, schema, validation), offline-first delivery, hub-centric JIT compilation, and the split between θ (theta) and adaptive selection (LMS) are in place. Trust (signing and runtime verification), state repair (migrations, lms-repair), progress portability (sneakernet), and authoring APIs (validate/preview) strengthen the core story. Sentry and graph_weights are implemented and documented, so the “cultural adaptation” loop is narrative- and code-complete; proving it in the field (e.g. Weaver vs Farmer test) remains. Refactor work (runtimeManifest, binary utils, types, migrations) has improved modularity and type safety. Remaining gaps are a **single hardware/runtime baseline**, **empirical proof of θ** (graph verification test), and **federation deployment narrative**; the portal and authoring are in good shape with contract tests and implemented APIs.
