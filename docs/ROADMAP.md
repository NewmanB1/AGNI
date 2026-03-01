# 🗺️ The Open Lesson Standard (OLS) Roadmap: First 100 Days

This document outlines the strategic plan to launch the Open Lesson Standard (OLS)—a file format and runtime for offline, sensor-rich, and culturally adaptive education.

**Goal:** Establish the `.ols` file standard, build the reference player, and prove the "Skill Collapse" ($\theta$) navigation model.

**Sprint planning:** Prioritized tasks for the next development sprint are in **`docs/SPRINT-PLAN.md`** (Sentry/θ documentation, contract tests, authoring APIs, validation, and tech-debt items).

**Current status (as of latest update):** The core pipeline is in place: CLI compiler, IR + sidecar, HTML and native builders, hub-transform for on-demand PWA delivery, theta (lesson graph + MLC), LMS engine (Rasch, embeddings, Thompson bandit, federation), governance (policy, compliance, cohort coverage APIs), runtime verification (Ed25519 + TweetNaCl fallback), and a typed portal API client. **Backlog completed:** LMS state migration/repair (`src/engine/migrations.js`, CLI `lms-repair`), IR/runtime types in `src/types/index.d.ts` and engine `.d.ts`, runtimeManifest (`src/utils/runtimeManifest.js`), consolidated binary utils (`src/utils/binary.js`, `src/runtime/binary-utils.js`), sneakernet export/import (`scripts/sneakernet.js`, `npm run sneakernet`). Authoring APIs (validate/preview) are implemented. Remaining: Sentry adaptation feedback loop, QR/Base45 for progress if desired, Phase 5–6 and community/launch tasks.

## 🏗️ Phase 1: The Standard & The Golden Master (Days 1–25)
**Objective:** Define a robust JSON Schema that supports hardware sensors, localization, and Set Theory categorization.

- [x] **Day 1-5: The Manifesto & Setup**
    - [x] Initialize Repo with README, LICENSE, and CONTRIBUTING.
    - [x] Configure GitHub Pages for documentation.
- [x] **Day 6-12: The Schema Design (v1.4)**
    - [x] Define Metadata Layer (Dublin Core + Set Theory `subject` tags).
    - [x] Define Hardware Layer (Threshold Syntax: `freefall > 0.2s`).
    - [x] Define Logic Layer (Gate w/ `skill_target`).
    - [x] **Action:** Finalize `graph_weights.schema.json` for the Sentry (Sprint A: schema aligned with Sentry output; edge pattern supports multi-colon skill IDs).
- [x] **Day 13-18: The "Golden Master" Lesson**
    - [x] Write "Understanding Gravity" in YAML.
    - [x] Req: User must drop the phone to unlock the next step (gravity.yaml freefall step; sensor/gate in runtime).
    - [x] Req: Validator passes threshold syntax (scripts/validate-all.js + src/utils/threshold-syntax.js).
- [x] **Day 19-25: Validation Tools**
    - [x] Build GitHub Actions workflow (`validate.yml`).
    - [x] Translation Stress Test: Golden Master translated to Spanish (`lessons/gravity-es.yaml`); validate and compile pass. See `docs/translation-stress-test.md`.

## 📲 Phase 2: The Player & The Graph Engine (Days 26–50)
**Objective:** Build the runtime that transforms YAML into an interactive experience and implements the "Skill Collapse" navigation logic.

- [x] **Day 26-30: The Compiler (Unified/Remark)**
    - [x] Build pipeline to parse YAML + Markdown (config.js, buildLessonIR, CLI).
    - [x] Prerequisite gate: theta and ontology.requires/provides drive eligibility; LMS selects within eligible set.
- [x] **Day 31-35: The Navigation Logic ($\theta$)**
    - [x] Theta (hub-tools/theta.js): lesson index, graph weights, MLC sorting.
    - [x] Sorting by Marginal Learning Cost; formula $\theta = \text{BaseCost} - \text{CohortDiscount}$.
- [x] **Day 36-40: The Hardware Bridge**
    - [x] JS runtime for DeviceMotion and vibration (sensor-bridge.js, shared-runtime).
    - [x] Feature detection and sensor abstraction in the player.
    - [x] Parser/validator for threshold syntax in gate (e.g. `freefall > 0.2s`) — `src/utils/threshold-syntax.js`; `scripts/validate-all.js` validates thresholds.
- [x] **Day 41-45: Portable Sovereignty (Sneakernet)** *(partial)*
    - [x] Gzip + base64 export/import of bandit summary (`scripts/sneakernet.js`; `npm run sneakernet -- export|import [--out|--in file]`). Merge into local LMS state via `mergeRemoteSummary`.
    - [ ] Optional: Base45 encoding for QR-friendly payloads; QR generation/scan (deferred).
- [x] **Day 46-50: The Universal Export**
    - [x] Build process: `npm run build` / `agni` compiles lesson to HTML (<500KB target).
    - [ ] Test on Android 6.0 device (Airplane Mode).

## 🛡️ Phase 3: Governance & Adaptation (Days 51–75)
**Objective:** Implement the "Web of Trust" and the Sentry logic that generates cultural adaptations.

- [x] **Day 51-55: The Sentry Protocol (Trust)**
    - [x] Signing: hub and CLI sign lesson content; device binding (OLS_SIGNATURE, OLS_PUBLIC_KEY, OLS_INTENDED_OWNER).
    - [x] Runtime verification in player.js (verifyIntegrity: SubtleCrypto + TweetNaCl fallback).
- [x] **Day 56-60: The Sentry Protocol (Adaptation)** *(partial)*
    - [x] Sentry logic and `graph_weights.json` output (`hub-tools/sentry.js`); schema finalized (`schemas/graph_weights.schema.json`). Flow documented in `docs/playbooks/sentry.md`.
    - [ ] Log aggregator / anonymized telemetry ingestion (optional); full cohort-specific weight updates in production.
- [x] **Day 61-65: The "Signing Desk"**
    - [x] Signing in utils/crypto.js; CLI and hub-transform use it; lessonAssembly injects globals.
- [ ] **Day 66-70: Outreach & Pitch**
    - [ ] Create "Integration Guide" for Learning Equality (Kolibri).
    - [ ] Build demo of OLS running inside an `<iframe>`.
- [ ] **Day 71-75: Sensory & Accessibility Review**
    - [ ] Test haptics with neurodivergent volunteers.
    - [ ] Refine "Intensity" schema settings.

## 🚀 Phase 4: Launch & Ecosystem (Days 76–100)
**Objective:** Public release, community intake, and preparing for the WYSIWYG editor.

**Already implemented (hub & ecosystem):** On-demand PWA delivery (hub-transform), LMS engine (Rasch, embeddings, Thompson bandit, federation) and theta HTTP APIs (`/api/lms/select`, `POST /api/lms/observation`, etc.), governance APIs (`/api/governance/report`, `/api/governance/policy`, `POST /api/governance/compliance`), UTU/teaching_mode in schema and sidecar, typed portal API client (`portal/src/lib/api.ts`), services layer (compiler, lms, governance, lessonAssembly). Portal uses mock data unless `VITE_HUB_URL` is set.

- [ ] **Day 76-80: Public Launch**
    - [ ] Publish Manifesto to HN, Reddit, Dev.to. See **`docs/LAUNCH-AND-COMMUNITY.md`** for checklist and one-line pitch.
- [ ] **Day 81-85: Community Onboarding**
    - [ ] Triage Issues.
    - [ ] Label "Good First Issues" (e.g., Translation). See **`docs/LAUNCH-AND-COMMUNITY.md`** for suggested labels and where to point contributors.
- [ ] **Day 86-90: The "Code-as-Content" Tutorial**
    - [x] Tutorial doc: **`docs/tutorials/fork-and-translate-lesson.md`** (step-by-step fork and translate).
    - [ ] Record video: "How to Fork and Translate a Lesson" (optional; use the tutorial as script).
- [x] **Day 91-95: Graph Verification Test** (Phase 1)
    - [x] Simulate a "Weaver Cohort" vs "Farmer Cohort."
    - [x] Prove that the Lesson Menu reorders itself differently for each group using the same content (`npm run test:graph`).
- [ ] **Day 96-100: Year 2 Prep**
    - [ ] Research TipTap for WYSIWYG editor. See **`docs/YEAR2-PREP.md`** for options and requirements.
    - [ ] Finalize v1.0 Spec. See **`docs/YEAR2-PREP.md`** for checklist.

## 🔭 Future Horizons (Year 2)
*   **The Editor:** A drag-and-drop GUI that generates valid OLS YAML.
*   **The Plugins:** Official plugins for Moodle, Kolibri, and Canvas.
*   **The Mesh:** Enabling Village Hubs to sync `graph_weights.json` via LoRa to share cultural adaptations between villages.
*   **Reference implementation refactor:** Move toward a schema-based, functionally styled design so AGNI is a true reference implementation of OLS (schemas as source of truth, pure pipelines where it helps, side effects at the edges). See **`docs/REFERENCE-IMPLEMENTATION-VISION.md`**.
