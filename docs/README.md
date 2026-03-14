# Documentation Index

This is the **single entry point** for AGNI documentation. For code layout, see **`AGENTS.md`** (repo root) — canonical code lives in `packages/`.

## Documentation Structure

| Layer | Contents |
|-------|----------|
| **Guides** | Role-based: teachers, parents, lesson creators, developers, field tech |
| **Architecture** | `ARCHITECTURE.md` (canonical), detailed analysis, telemetry, subsystems |
| **Planning** | `ROADMAP.md` (strategic), `SPRINT-PLAN.md` (tactical status) |
| **Playbooks** | How to modify compiler, runtime, LMS, governance, hub, etc. |
| **Specs** | OLS v1.0, threshold grammar, UTU architecture |
| **Operations** | Configuration, deployment, run environments, API contract |
| **Integrations** | Kolibri, Moodle, Canvas LTI |
| **Accessibility** | Haptic testing, intensity settings |
| **Archive** | Completed sprints and superseded plans (`docs/archive/`) |

---

## Start Here: Reading Guide by Role

| You are a... | Start with | Then read |
|:---|:---|:---|
| **Teacher** | [Teachers Guide](guides/TEACHERS.md) | [Lesson Creators Guide](guides/LESSON-CREATORS.md) if you want to write lessons |
| **Parent** | [Parents Guide](guides/PARENTS.md) | *(that's all you need)* |
| **Lesson Creator** | [Lesson Creators Guide](guides/LESSON-CREATORS.md) | [Threshold Grammar](specs/threshold_grammar.md), [Translation Tutorial](tutorials/fork-and-translate-lesson.md) — template-based wizard |
| **Governance Authority** | [Governance Authority Guide](guides/GOVERNANCE-AUTHORITY.md) | [UTU Architecture](specs/utu-architecture.md) for the skill coordinate system |
| **Field Tech / Sysadmin** | [Field Tech Guide](guides/FIELD-TECH.md) | [Deployment Guide](DEPLOYMENT.md), [API Contract](api-contract.md) |
| **Open Source Developer** | [Developers Guide](guides/DEVELOPERS.md) | [Dev Start](DEV-START.md), [Onboarding Concepts](ONBOARDING-CONCEPTS.md), [Architecture](ARCHITECTURE.md), [Conventions](CONVENTIONS.md) |
| **Student** | *(no docs needed — open a lesson in your browser and learn)* | |

---

## Full Index

### Guides (by audience)

- [guides/TEACHERS.md](guides/TEACHERS.md) — Portal walkthrough, student monitoring, lesson overrides, group management
- [guides/PARENTS.md](guides/PARENTS.md) — Linking to your child, viewing progress
- [guides/GOVERNANCE-AUTHORITY.md](guides/GOVERNANCE-AUTHORITY.md) — Setting policy, managing the approved catalog, compliance
- [guides/FIELD-TECH.md](guides/FIELD-TECH.md) — Hub deployment, configuration, maintenance, troubleshooting
- [guides/LESSON-CREATORS.md](guides/LESSON-CREATORS.md) — Template-based wizard, YAML validation, sensor steps, publishing
- [guides/DEVELOPERS.md](guides/DEVELOPERS.md) — Architecture, dev setup, conventions, contribution workflow

## Package Structure

AGNI is an **npm workspaces monorepo**. Each package has its own README with detailed docs:

| Package | What to work on |
|---------|----------------|
| [`@agni/cli`](../packages/agni-cli/) | CLI entry point: compile, validate, hub wizards |
| [`@ols/schema`](../packages/ols-schema/) | The OLS standard: JSON schema, validators, threshold grammar |
| [`@ols/compiler`](../packages/ols-compiler/) | Lesson compiler pipeline (YAML → IR → artifacts) |
| [`@agni/utils`](../packages/agni-utils/) | Shared utilities (logging, config, crypto, I/O) |
| [`@agni/engine`](../packages/agni-engine/) | Learning engine (Rasch, Thompson, embeddings, PageRank) |
| [`@agni/runtime`](../packages/agni-runtime/) | Browser runtime (player, sensors, SVG factories — ES5) |
| [`@agni/governance`](../packages/agni-governance/) | Policy enforcement and compliance evaluation |
| [`@agni/services`](../packages/agni-services/) | Top-down API: accounts, author, LMS, lesson-chain |
| [`@agni/hub`](../packages/agni-hub/) | Village Hub server (HTTP routes, theta, accounts) |
| [`@agni/plugins`](../packages/agni-plugins/) | Plugin registry: SVG factories, step types, sensors |
| [`portal/`](../portal/) | Vanilla HTML/CSS/JS teacher and admin portal |

## Architecture & Design

**Document hierarchy:** [ARCHITECTURE.md](ARCHITECTURE.md) (canonical overview) → [ARCHITECTURE-DETAILED.md](ARCHITECTURE-DETAILED.md) (implementation details) → [SUBSYSTEMS-AND-ARCHITECTURE.md](SUBSYSTEMS-AND-ARCHITECTURE.md) (deep subsystem reference).

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture for AGNI/OLS: phases, governance, and design decisions. **Canonical single source of truth.**
- [ARCHITECTURE-DETAILED.md](ARCHITECTURE-DETAILED.md) — Implementation details, data flows, cross-component contracts.
- [SUBSYSTEMS-AND-ARCHITECTURE.md](SUBSYSTEMS-AND-ARCHITECTURE.md) — Deep subsystem-by-subsystem description.
- [TELEMETRY-ARCHITECTURE.md](TELEMETRY-ARCHITECTURE.md) — Sentry / telemetry engine: graph_weights, MLC flow.
- [RUNTIME-INTEGRITY-SENSOR-BRIDGE-ARCHITECTURE.md](RUNTIME-INTEGRITY-SENSOR-BRIDGE-ARCHITECTURE.md) — Runtime integrity and sensor bridge design.
- [ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md](archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md) — Plan to address seven architectural vulnerabilities (cache poisoning, fsync, cycles, sensors, integrity, time-skew, memory); archived (see master list).
- [ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md](archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md) — Implementation status and remaining work; archived (see master list).
- [ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN.md](archive/ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN.md) — Phase 2: 28 additional issues (disk cache, YAML DoS, Markdown XSS, directory fsync, etc.); archived (see master list).
- [ARCHITECTURAL-AUDIT-FINDINGS.md](archive/ARCHITECTURAL-AUDIT-FINDINGS.md) — Audit findings for spec.type whitelist, graph weight clamping, PWA/factory handshake, factory supply chain; archived.
- [OLS-QUICK-REFERENCE.md](OLS-QUICK-REFERENCE.md) — Condensed flow, components, and key paths.
- [VERIFICATION-REPORT.md](VERIFICATION-REPORT.md) — Cross-check of architectural claims vs codebase.
- [GAP-ANALYSIS-AND-MITIGATIONS.md](archive/GAP-ANALYSIS-AND-MITIGATIONS.md) — Known gaps, severity, and proposed mitigations; archived (see master list).
- [REFERENCE-IMPLEMENTATION-VISION.md](REFERENCE-IMPLEMENTATION-VISION.md) — Future refactor direction toward a schema-based, functional reference implementation.
- [ONBOARDING-CONCEPTS.md](ONBOARDING-CONCEPTS.md) — Short glossary of key concepts for new contributors.

## Planning & Roadmap

- [ROADMAP.md](ROADMAP.md) — Strategic plan for OLS launch: phases, status, remaining work. **Single source of truth for roadmap.**
- [SPRINT-PLAN.md](SPRINT-PLAN.md) — Master sprint plan tracking numbered sprints and status.
- [YEAR2-PREP.md](YEAR2-PREP.md) — Year 2 preparation: WYSIWYG editor research and v1.0 spec finalization.
- [LAUNCH-AND-COMMUNITY.md](LAUNCH-AND-COMMUNITY.md) — Launch checklist and community onboarding plan.
- [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) — Actionable launch steps (R1–R4, L1, L4, L5).
- [COLLABORATIVE-LESSONS-IMPLEMENTATION-PLAN.md](COLLABORATIVE-LESSONS-IMPLEMENTATION-PLAN.md) — Collaborative lessons: discovery, beacon, teacher deny.

*Historical improvement plans (CONSOLIDATED-ROADMAP, REMAINING-IMPROVEMENTS-PLAN) are in [archive/](archive/); their work is complete.*

## Operations

- [CONFIGURATION.md](CONFIGURATION.md) — Hub configuration: env vars, defaults, bootstrap order, hub-config.json.
- [RUN-ENVIRONMENTS.md](RUN-ENVIRONMENTS.md) — Edge (Android 7.0/ES5) vs Hub (Pi) vs Portal; verification commands.
- [DEPLOYMENT.md](DEPLOYMENT.md) — Setting up a Village Hub on Raspberry Pi.
- [api-contract.md](api-contract.md) — HTTP API contract for all hub endpoints.
- [DEV-START.md](DEV-START.md) — Minimal setup for tests: init data, start hub, run tests.

## Verification & Issue Tracking

- [VERIFICATION-GUARDS.md](VERIFICATION-GUARDS.md) — CI gates layout: core, runtime, hub, services, governance.
- [UNRESOLVED-ISSUES-MASTER-LIST.md](UNRESOLVED-ISSUES-MASTER-LIST.md) — Master list of all documented issues; see also remediation plans below.

## Standards

- [CONVENTIONS.md](CONVENTIONS.md) — Coding conventions for navigability and safe LLM-assisted changes.
- [translation-stress-test.md](translation-stress-test.md) — Translation stress test record for the Golden Master lesson.

## Playbooks

- [playbooks/compiler.md](playbooks/compiler.md) — How to modify the YAML-to-IR and IR-to-artifact compiler.
- [playbooks/federation.md](playbooks/federation.md) — Sync contracts and graph_weights deployment for federation.
- [playbooks/mesh-lora.md](playbooks/mesh-lora.md) — The Mesh (R9): graph_weights sync via LoRa — design and implementation phases.
- [playbooks/governance.md](playbooks/governance.md) — How to modify policy-driven compliance and cohort coverage.
- [playbooks/hub.md](playbooks/hub.md) — How to modify the Village Hub.
- [playbooks/lms.md](playbooks/lms.md) — How to modify the LMS engine (adaptive selection, Rasch, embeddings, bandit).
- [playbooks/lms-plugins.md](playbooks/lms-plugins.md) — LMS plugin development.
- [playbooks/math.md](playbooks/math.md) — Math engine (KaTeX, numerics) changes.
- [playbooks/math-remediation-plan.md](playbooks/math-remediation-plan.md) — Math engine bug remediation.
- [playbooks/runtime.md](playbooks/runtime.md) — How to modify the browser-side lesson player, sensors, and SVG system.
- [playbooks/schema-to-types.md](playbooks/schema-to-types.md) — Keeping TypeScript types and validators aligned with JSON schemas via codegen.
- [playbooks/sentry.md](playbooks/sentry.md) — How Sentry telemetry becomes graph_weights and feeds theta.
- [playbooks/step-sensor-dependency.md](playbooks/step-sensor-dependency.md) — Step-level sensor dependency tracking for analytics and offline behaviour.
- [playbooks/thin-client-targets.md](playbooks/thin-client-targets.md) — Building lesson artifacts for thin clients (native Android, Flutter, minimal YAML).
- [playbooks/typing-and-languages.md](playbooks/typing-and-languages.md) — Where TypeScript vs JavaScript is used and how types are maintained.
- [playbooks/village-security.md](playbooks/village-security.md) — Village deployment hardening: hub, WiFi, edge kiosk, safe state writes.
- [playbooks/collaborative-lessons.md](playbooks/collaborative-lessons.md) — Collaborative lessons implementation.
- [playbooks/CHECK-JS-ENABLEMENT-PLAN.md](playbooks/CHECK-JS-ENABLEMENT-PLAN.md) — CheckJS enablement plan.
- [playbooks/CHECK-JS-FINISH-PLAN.md](playbooks/CHECK-JS-FINISH-PLAN.md) — CheckJS completion plan.

## Specs

- [specs/ols-v1.0-spec.md](specs/ols-v1.0-spec.md) — Open Lesson Standard v1.0 formal spec (frozen).
- [specs/threshold_grammar.md](specs/threshold_grammar.md) — OLS Threshold Expression Syntax for sensor-based step advancement.
- [specs/utu-architecture.md](specs/utu-architecture.md) — UTU 3D coordinate engine: Spine, Band, Protocol skill triplets.

## Tutorials

- [tutorials/fork-and-translate-lesson.md](tutorials/fork-and-translate-lesson.md) — How to fork an existing OLS lesson and translate it into another language.

## Integrations

- [integrations/KOLIBRI-INTEGRATION-GUIDE.md](integrations/KOLIBRI-INTEGRATION-GUIDE.md) — Integrate OLS lessons into Kolibri via Ricecooker + HTML5 App.
- [integrations/KOLIBRI-PLUGIN-GUIDE.md](integrations/KOLIBRI-PLUGIN-GUIDE.md) — Native Kolibri plugin for OLS (optional, higher effort).
- [integrations/MOODLE-MOD-OLS-GUIDE.md](integrations/MOODLE-MOD-OLS-GUIDE.md) — Moodle OLS plugin.
- [integrations/MOODLE-LTI-SETUP.md](integrations/MOODLE-LTI-SETUP.md) — Moodle LTI setup.
- [integrations/CANVAS-LTI-SETUP.md](integrations/CANVAS-LTI-SETUP.md) — Canvas LTI setup.

## Accessibility

- [accessibility/HAPTIC-TESTING-TEMPLATE.md](accessibility/HAPTIC-TESTING-TEMPLATE.md) — Haptic testing procedures.
- [accessibility/INTENSITY-SETTINGS.md](accessibility/INTENSITY-SETTINGS.md) — Intensity settings for haptics.

## Remediation & Reference

- [DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md](DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md) — Fix tasks for formerly "documented" limitations.
- [DRY-REMEDIATION-PLAN.md](DRY-REMEDIATION-PLAN.md) — DRY violation remediation.
- [SCHEMA-FREEZE.md](SCHEMA-FREEZE.md) — OLS schema freeze policy for v1.0.
- [ENV-VALIDATION-SPLIT.md](ENV-VALIDATION-SPLIT.md) — env-config vs env-validate split.
- [BREAKING-VS-ADDITIVE.md](BREAKING-VS-ADDITIVE.md) — Policy for schema changes post-freeze.
- [TIPTAP-RESEARCH.md](TIPTAP-RESEARCH.md) — WYSIWYG editor research (Year 2).
- [AUDIT-HARDENING-PLAN.md](AUDIT-HARDENING-PLAN.md) — Audit hardening tasks.
- [LEN-001-MATH-ENGINE-BUGS.md](LEN-001-MATH-ENGINE-BUGS.md) — Math engine bug tracking.
- [SHIM-AND-CODE-AUDIT-FINDINGS.md](SHIM-AND-CODE-AUDIT-FINDINGS.md) — Shim and code audit findings.
- [COMMUNITY-CHECKLIST.md](COMMUNITY-CHECKLIST.md) — Community health checklist.
- [DOCUMENTATION-REVIEW-2025-03.md](DOCUMENTATION-REVIEW-2025-03.md) — Documentation essentiality and completeness review (March 2025).

## Prompts

- [prompts/lesson-design-stack.md](prompts/lesson-design-stack.md) — Structured prompt sequence for AI or human lesson designers.

## Archive

Completed sprint documents and superseded plans are preserved in [`archive/`](archive/) for historical reference:

**Sprints**

- `SPRINT-TECH-DEBT.md` — 6 sprints: structural debt, security, runtime testability
- `SPRINT-DRY-REFACTOR.md` — 6 sprints: DRY violations, God Functions, patterns
- `SPRINT-REMEDIATION.md` — 8 phases: bugs, data integrity, config drift, security
- `SPRINT-R9-FIXES.md` — Post-audit remediation
- `SPRINT-R10-HARDENING.md` — Security hardening and completion verification
- `SPRINT-R11-REMEDIATION.md` — Superseded by R16
- `SPRINT-R15-REMEDIATION.md` — Load order, PWA shell, lock timing
- `SPRINT-R16-OPEN-BUGS.md` — Final 12 verified open bugs (all resolved)
- `SPRINT-CONFIGURATION-WIZARDS.md` — Guided setup flows for each persona
- `SPRINT-SENTRY-IMPROVEMENTS.md` — Sentry enhancements (completed 2026-03-05)

**Improvement plans** (all completed; work merged into ROADMAP)

- `HUB-IMPROVEMENT-PLAN.md`, `HUB-CANONICAL-MIGRATION-PLAN.md`, `SERVICES-IMPROVEMENT-PLAN.md`
- `PACKAGES-IMPROVEMENT-PLAN.md`, `RUNTIME-IMPROVEMENT-PLAN.md`, `RUNTIME-MANIFEST-IMPROVEMENT-PLAN.md`, `BACKLOG-REMEDIATION-PLAN.md`
- `SVG-TOOLS-IMPROVEMENT-PLAN.md`, `sensor-toolkit-improvement-plan.md`, `OPPORTUNISTIC-PRECACHE-PLAN.md`
- `GOVERNANCE-IMPROVEMENT-PLAN.md`, `LESSON-CREATOR-IMPROVEMENT-PLAN.md`
- `CONSOLIDATED-ROADMAP.md`, `REMAINING-IMPROVEMENTS-PLAN.md` — tactical task lists (all tiers complete)

**Audits & reviews**

- `DOCUMENT-REVIEW-2025-03.md` — March 2025 doc accuracy audit (fixes applied)
- `check-hub-config-pi-audit.md` — check-hub-config-pi.js bug audit (patches applied)
