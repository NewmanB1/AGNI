# docs/archive — Historical Plans & Remediation Records

This directory holds **completed** or **superseded** planning documents. They are kept for historical context and audit trail. For current guidance, use the main docs:

- **Architecture:** `docs/ARCHITECTURE.md`
- **Conventions:** `docs/CONVENTIONS.md`
- **Configuration:** `docs/CONFIGURATION.md`
- **Deployment:** `docs/DEPLOYMENT.md`
- **Run environments:** `docs/RUN-ENVIRONMENTS.md`
- **Playbooks:** `docs/playbooks/` (compiler, runtime, lms, governance, hub, etc.)
- **Verification:** `docs/VERIFICATION-GUARDS.md`

---

## What's Here

### Sprint & Remediation Plans (completed work)

| Document | Summary |
|----------|---------|
| `SPRINT-REMEDIATION.md` | R1–R8 codebase remediation (engine de-TypeScript, env centralization, tests, schemas) |
| `SPRINT-R9-FIXES.md` | R9 follow-up fixes |
| `SPRINT-R10-HARDENING.md` | Security hardening (trust boundaries, concurrency, CI, algorithm extraction) |
| `SPRINT-R11-REMEDIATION.md` | R11 remediation items |
| `SPRINT-R15-REMEDIATION.md` | R15 follow-up |
| `SPRINT-R16-OPEN-BUGS.md` | R16 open bug tracking |
| `SPRINT-DRY-REFACTOR.md` | D7–D12 dry refactor phases |
| `SPRINT-CONFIGURATION-WIZARDS.md` | Hub setup wizard work |
| `SPRINT-SENTRY-IMPROVEMENTS.md` | Sentry telemetry improvements |
| `SPRINT-TECH-DEBT.md` | Tech debt backlog |

### Improvement Plans (addressed or superseded)

| Document | Summary |
|----------|---------|
| `BACKLOG-REMEDIATION-PLAN.md` | Backlog remediation |
| `CONSOLIDATED-ROADMAP.md` | Consolidated roadmap |
| `REMAINING-IMPROVEMENTS-PLAN.md` | Remaining improvements |
| `GOVERNANCE-IMPROVEMENT-PLAN.md` | Governance package improvements |
| `HUB-IMPROVEMENT-PLAN.md` | Hub server improvements |
| `HUB-CANONICAL-MIGRATION-PLAN.md` | Migration from src/ to packages/agni-hub |
| `PACKAGES-IMPROVEMENT-PLAN.md` | Monorepo package layout |
| `RUNTIME-IMPROVEMENT-PLAN.md` | Runtime (player, sensors) improvements |
| `RUNTIME-MANIFEST-IMPROVEMENT-PLAN.md` | runtimeManifest.js DRY refactor, API cleanup, CI guards (all Done) |
| `sensor-toolkit-improvement-plan.md` | Sensor toolkit enhancements: orientation, shake, Phyphox sound, fallback (all Done) |
| `ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md` | Phase 1: seven architectural vulnerabilities (all Done) |
| `ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN.md` | Phase 2: 28 additional vulns (P2-1–28); some Open, see master list |
| `ARCHITECTURAL-AUDIT-FINDINGS.md` | Audit: spec.type, graph clamp, PWA handshake, supply chain (all addressed) |
| `SERVICES-IMPROVEMENT-PLAN.md` | Services layer improvements |
| `SVG-TOOLS-IMPROVEMENT-PLAN.md` | SVG factory and tools |
| `LESSON-CREATOR-IMPROVEMENT-PLAN.md` | Lesson authoring improvements |

### Other Archived Docs

| Document | Summary |
|----------|---------|
| `OPPORTUNISTIC-PRECACHE-PLAN.md` | Edge device precaching strategy (all phases complete) |
| `DOCUMENT-REVIEW-2025-03.md` | Document review snapshot |
| `check-hub-config-pi-audit.md` | Hub config Pi audit notes |

---

## When to Reference the Archive

- **Historical context:** Understanding why a design decision was made
- **Completed sprints:** What was done in R9, R10, etc.
- **Superseded approaches:** e.g. HUB-CANONICAL-MIGRATION documents the migration that moved hub code to `packages/agni-hub`

## When to Use Main Docs Instead

- **Changing compiler, runtime, LMS, governance:** Use `docs/playbooks/`
- **Configuring the hub:** Use `docs/CONFIGURATION.md` and `docs/DEPLOYMENT.md`
- **Understanding architecture:** Use `docs/ARCHITECTURE.md`
