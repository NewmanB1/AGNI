# Documentation Index

Navigational index for the `docs/` directory.

## Architecture & Design

- [ARCHITECTURE.md](ARCHITECTURE.md) -- System architecture for AGNI/OLS: phases, governance, and design decisions.
- [REFERENCE-IMPLEMENTATION-VISION.md](REFERENCE-IMPLEMENTATION-VISION.md) -- Future refactor direction toward a schema-based, functional reference implementation.
- [ONBOARDING-CONCEPTS.md](ONBOARDING-CONCEPTS.md) -- Short glossary of key concepts for new contributors.

## Planning & Roadmap

- [ROADMAP.md](ROADMAP.md) -- Strategic plan for the first 100 days of OLS launch.
- [SPRINT-PLAN.md](SPRINT-PLAN.md) -- Multi-sprint plan tracking all numbered sprints and remediation tasks.
- [SPRINT-TECH-DEBT.md](SPRINT-TECH-DEBT.md) -- Six sprints addressing structural debt, security, and runtime testability.
- [SPRINT-DRY-REFACTOR.md](SPRINT-DRY-REFACTOR.md) -- Six sprints addressing DRY violations, God Functions, and inconsistent patterns.
- [SPRINT-REMEDIATION.md](SPRINT-REMEDIATION.md) -- Eight phases of bug fixes, data integrity, and architectural cleanup.
- [SPRINT-CONFIGURATION-WIZARDS.md](SPRINT-CONFIGURATION-WIZARDS.md) -- Guided setup wizards for each user role.
- [YEAR2-PREP.md](YEAR2-PREP.md) -- Year 2 preparation: WYSIWYG editor research and v1.0 spec finalization.
- [LAUNCH-AND-COMMUNITY.md](LAUNCH-AND-COMMUNITY.md) -- Launch checklist and community onboarding plan.

## Standards

- [CONVENTIONS.md](CONVENTIONS.md) -- Coding conventions for navigability and safe LLM-assisted changes.
- [api-contract.md](api-contract.md) -- HTTP API contract for all hub endpoints.
- [translation-stress-test.md](translation-stress-test.md) -- Translation stress test record for the Golden Master lesson.

## Playbooks

- [playbooks/compiler.md](playbooks/compiler.md) -- How to modify the YAML-to-IR and IR-to-artifact compiler.
- [playbooks/federation.md](playbooks/federation.md) -- Sync contracts and graph_weights deployment for federation.
- [playbooks/governance.md](playbooks/governance.md) -- How to modify policy-driven compliance and cohort coverage.
- [playbooks/lms.md](playbooks/lms.md) -- How to modify the LMS engine (adaptive selection, Rasch, embeddings, bandit).
- [playbooks/runtime.md](playbooks/runtime.md) -- How to modify the browser-side lesson player, sensors, and SVG system.
- [playbooks/schema-to-types.md](playbooks/schema-to-types.md) -- Keeping TypeScript types and validators aligned with JSON schemas via codegen.
- [playbooks/sentry.md](playbooks/sentry.md) -- How Sentry telemetry becomes graph_weights and feeds theta.
- [playbooks/step-sensor-dependency.md](playbooks/step-sensor-dependency.md) -- Step-level sensor dependency tracking for analytics and offline behaviour.
- [playbooks/thin-client-targets.md](playbooks/thin-client-targets.md) -- Building lesson artifacts for thin clients (native Android, Flutter, minimal YAML).
- [playbooks/typing-and-languages.md](playbooks/typing-and-languages.md) -- Where TypeScript vs JavaScript is used and how types are maintained.

## Specs

- [specs/threshold_grammar.md](specs/threshold_grammar.md) -- OLS Threshold Expression Syntax for sensor-based step advancement.
- [specs/utu-architecture.md](specs/utu-architecture.md) -- UTU 3D coordinate engine: Spine, Band, Protocol skill triplets.

## Tutorials

- [tutorials/fork-and-translate-lesson.md](tutorials/fork-and-translate-lesson.md) -- How to fork an existing OLS lesson and translate it into another language.

## Prompts

- [prompts/lesson-design-stack.md](prompts/lesson-design-stack.md) -- Structured prompt sequence for AI or human lesson designers.
