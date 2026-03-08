# Documentation Index

## Start Here: Reading Guide by Role

| You are a... | Start with | Then read |
|:---|:---|:---|
| **Teacher** | [Teachers Guide](guides/TEACHERS.md) | [Lesson Creators Guide](guides/LESSON-CREATORS.md) if you want to write lessons |
| **Parent** | [Parents Guide](guides/PARENTS.md) | *(that's all you need)* |
| **Lesson Creator** | [Lesson Creators Guide](guides/LESSON-CREATORS.md) | [Threshold Grammar](specs/threshold_grammar.md), [AI Prompts](prompts/lesson-design-stack.md), [Translation Tutorial](tutorials/fork-and-translate-lesson.md) |
| **Governance Authority** | [Governance Authority Guide](guides/GOVERNANCE-AUTHORITY.md) | [UTU Architecture](specs/utu-architecture.md) for the skill coordinate system |
| **Field Tech / Sysadmin** | [Field Tech Guide](guides/FIELD-TECH.md) | [Deployment Guide](DEPLOYMENT.md), [API Contract](api-contract.md) |
| **Open Source Developer** | [Developers Guide](guides/DEVELOPERS.md) | [Onboarding Concepts](ONBOARDING-CONCEPTS.md), [Architecture](ARCHITECTURE.md), [Conventions](CONVENTIONS.md) |
| **Student** | *(no docs needed — open a lesson in your browser and learn)* | |

---

## Full Index

### Guides (by audience)

- [guides/TEACHERS.md](guides/TEACHERS.md) — Portal walkthrough, student monitoring, lesson overrides, group management
- [guides/PARENTS.md](guides/PARENTS.md) — Linking to your child, viewing progress
- [guides/GOVERNANCE-AUTHORITY.md](guides/GOVERNANCE-AUTHORITY.md) — Setting policy, managing the approved catalog, compliance
- [guides/FIELD-TECH.md](guides/FIELD-TECH.md) — Hub deployment, configuration, maintenance, troubleshooting
- [guides/LESSON-CREATORS.md](guides/LESSON-CREATORS.md) — Writing YAML lessons, validation, sensor steps, publishing
- [guides/DEVELOPERS.md](guides/DEVELOPERS.md) — Architecture, dev setup, conventions, contribution workflow

## Package Structure

AGNI is an **npm workspaces monorepo**. Each package has its own README with detailed docs:

| Package | What to work on |
|---------|----------------|
| [`@ols/schema`](../packages/ols-schema/) | The OLS standard: JSON schema, validators, threshold grammar |
| [`@ols/compiler`](../packages/ols-compiler/) | Lesson compiler pipeline (YAML → IR → artifacts) |
| [`@agni/utils`](../packages/agni-utils/) | Shared utilities (logging, config, crypto, I/O) |
| [`@agni/engine`](../packages/agni-engine/) | Learning engine (Rasch, Thompson, embeddings, PageRank) |
| [`@agni/runtime`](../packages/agni-runtime/) | Browser runtime (player, sensors, SVG factories — ES5) |
| [`@agni/governance`](../packages/agni-governance/) | Policy enforcement and compliance evaluation |
| [`@agni/hub`](../packages/agni-hub/) | Village Hub server (HTTP routes, theta, accounts) |
| [`portal/`](../portal/) | Vanilla HTML/CSS/JS teacher and admin portal |

## Architecture & Design

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture for AGNI/OLS: phases, governance, and design decisions. **Canonical single source of truth.**
- [OLS-QUICK-REFERENCE.md](OLS-QUICK-REFERENCE.md) — Condensed flow, components, and key paths.
- [VERIFICATION-REPORT.md](VERIFICATION-REPORT.md) — Cross-check of architectural claims vs codebase.
- [GAP-ANALYSIS-AND-MITIGATIONS.md](GAP-ANALYSIS-AND-MITIGATIONS.md) — Known gaps, severity, and proposed mitigations.
- [REFERENCE-IMPLEMENTATION-VISION.md](REFERENCE-IMPLEMENTATION-VISION.md) — Future refactor direction toward a schema-based, functional reference implementation.
- [ONBOARDING-CONCEPTS.md](ONBOARDING-CONCEPTS.md) — Short glossary of key concepts for new contributors.

## Planning & Roadmap

- [ROADMAP.md](ROADMAP.md) — Strategic plan for the first 100 days of OLS launch.
- [SPRINT-PLAN.md](SPRINT-PLAN.md) — Master sprint plan tracking all numbered sprints, remediation tasks, and status. Start here for project status.
- [YEAR2-PREP.md](YEAR2-PREP.md) — Year 2 preparation: WYSIWYG editor research and v1.0 spec finalization.
- [LAUNCH-AND-COMMUNITY.md](LAUNCH-AND-COMMUNITY.md) — Launch checklist and community onboarding plan.

## Operations

- [DEPLOYMENT.md](DEPLOYMENT.md) — Setting up a Village Hub on Raspberry Pi.
- [api-contract.md](api-contract.md) — HTTP API contract for all hub endpoints.

## Standards

- [CONVENTIONS.md](CONVENTIONS.md) — Coding conventions for navigability and safe LLM-assisted changes.
- [translation-stress-test.md](translation-stress-test.md) — Translation stress test record for the Golden Master lesson.

## Playbooks

- [playbooks/compiler.md](playbooks/compiler.md) — How to modify the YAML-to-IR and IR-to-artifact compiler.
- [playbooks/federation.md](playbooks/federation.md) — Sync contracts and graph_weights deployment for federation.
- [playbooks/governance.md](playbooks/governance.md) — How to modify policy-driven compliance and cohort coverage.
- [playbooks/lms.md](playbooks/lms.md) — How to modify the LMS engine (adaptive selection, Rasch, embeddings, bandit).
- [playbooks/runtime.md](playbooks/runtime.md) — How to modify the browser-side lesson player, sensors, and SVG system.
- [playbooks/schema-to-types.md](playbooks/schema-to-types.md) — Keeping TypeScript types and validators aligned with JSON schemas via codegen.
- [playbooks/sentry.md](playbooks/sentry.md) — How Sentry telemetry becomes graph_weights and feeds theta.
- [playbooks/step-sensor-dependency.md](playbooks/step-sensor-dependency.md) — Step-level sensor dependency tracking for analytics and offline behaviour.
- [playbooks/thin-client-targets.md](playbooks/thin-client-targets.md) — Building lesson artifacts for thin clients (native Android, Flutter, minimal YAML).
- [playbooks/typing-and-languages.md](playbooks/typing-and-languages.md) — Where TypeScript vs JavaScript is used and how types are maintained.
- [playbooks/village-security.md](playbooks/village-security.md) — Village deployment hardening: hub, WiFi, edge kiosk, safe state writes.

## Specs

- [specs/threshold_grammar.md](specs/threshold_grammar.md) — OLS Threshold Expression Syntax for sensor-based step advancement.
- [specs/utu-architecture.md](specs/utu-architecture.md) — UTU 3D coordinate engine: Spine, Band, Protocol skill triplets.

## Tutorials

- [tutorials/fork-and-translate-lesson.md](tutorials/fork-and-translate-lesson.md) — How to fork an existing OLS lesson and translate it into another language.

## Prompts

- [prompts/lesson-design-stack.md](prompts/lesson-design-stack.md) — Structured prompt sequence for AI or human lesson designers.

## Archive

Completed sprint documents are preserved in [`archive/`](archive/) for historical reference:

- `SPRINT-TECH-DEBT.md` — 6 sprints: structural debt, security, runtime testability
- `SPRINT-DRY-REFACTOR.md` — 6 sprints: DRY violations, God Functions, patterns
- `SPRINT-REMEDIATION.md` — 8 phases: bugs, data integrity, config drift, security
- `SPRINT-R9-FIXES.md` — Post-audit remediation
- `SPRINT-R10-HARDENING.md` — Security hardening and completion verification
- `SPRINT-R11-REMEDIATION.md` — Superseded by R16
- `SPRINT-R15-REMEDIATION.md` — Load order, PWA shell, lock timing
- `SPRINT-R16-OPEN-BUGS.md` — Final 12 verified open bugs (all resolved)
- `SPRINT-CONFIGURATION-WIZARDS.md` — Guided setup flows for each persona
