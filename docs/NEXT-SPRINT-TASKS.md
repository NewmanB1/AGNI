# Next Sprint — Recommended Tasks

Prioritized tasks for the **upcoming** sprint. Drawn from ROADMAP, ARCHITECTURE-EVALUATION, and `docs/SPRINT-PLAN.md`.

**Multi-sprint plan:** See **`docs/SPRINT-PLAN.md`** for the full 6-sprint sequence (UTU Architecture, Config wizards, Groups + Save API, WYSIWYG foundation, WYSIWYG full, Parent/Student/Launch).

**Context:** Config wizards G1–G4 (Governance) done. Common top page done.

---

## Launch and community (ROADMAP Phase 4)

| # | Task | Source | Success |
|---|------|--------|---------|
| **L1** | **Public launch** — Publish manifesto/intro (e.g. HN, Reddit, Dev.to); one-line pitch; tag a release (e.g. v0.2.0). | ROADMAP Day 76–80, `docs/LAUNCH-AND-COMMUNITY.md` | Launch checklist started or done; release tagged. |
| **L2** | **Community onboarding** — Triage issues; add labels (good first issue, translation, documentation); point contributors to CONTRIBUTING and `docs/tutorials/fork-and-translate-lesson.md`. | ROADMAP Day 81–85, LAUNCH-AND-COMMUNITY | Labels and triage process in place. |
| **L3** | **Year 2 prep** — Research TipTap (or equivalent) for WYSIWYG; update v1.0 spec checklist in `docs/YEAR2-PREP.md`. | ROADMAP Day 96–100 | YEAR2-PREP.md updated with options and checklist. |

---

## Quality and baseline

| # | Task | Source | Success |
|---|------|--------|---------|
| **Q1** | **Hardware baseline (if not already locked)** — Confirm one line in ARCHITECTURE and README (e.g. "Android 6.0+, ES5 in runtime"); add Compatibility subsection if missing. | ARCHITECTURE-EVALUATION §6 rec 1 | Single baseline documented; no 4.0 vs 6.0 inconsistency. |
| **Q2** | **Portal–hub default** — Document "Running portal against hub" in README or portal docs if not already clear; keep VITE_HUB_URL as the supported path. | ARCHITECTURE-EVALUATION §6 rec 5 | Contributors can run portal against real hub without guessing. |

---

## Optional / follow-on

| # | Task | Source | Success |
|---|------|--------|---------|
| **O1** | **Test on Android 6.0 (Airplane Mode)** — Run compiled lesson on a real device; note any gaps. | ROADMAP Day 46–50 | Documented in README or playbook (or issue) what was tested. |
| **O2** | **Outreach and pitch** — Kolibri integration guide stub or OLS-in-iframe demo. | ROADMAP Day 66–70 | One deliverable (doc or demo) for external platforms. |
| **O3** | **Browse by UTU / discovery API** — GET /api/lessons?utu=... or similar for authors to discover lessons by taxonomy. | ARCHITECTURE-EVALUATION §5.3 | Authors can query lessons by UTU/skill. |

---

## Next sprint: UTU Architecture (Sprint 1)

From `docs/SPRINT-PLAN.md`:

| # | Task | Deliverable |
|---|------|-------------|
| U1 | Extend OLS schema `meta.utu` | Add protocol (1–5); formalize spineId; document Spine enum |
| U2 | UTU constants reference | `docs/specs/utu-architecture.md` |
| U3 | Extend governance policy | Protocol-progression rules; failure-mode hints |
| U4 | Policy wizard: UTU/Protocol | Update policy wizard with Protocol, Spine picker |

## Configuration wizards (remaining)

G1–G4 done. Remaining in **`docs/SPRINT-PLAN.md`** Sprint 2–3:

| Sprint | Focus | Tasks |
|--------|-------|-------|
| **Sprint 2** | Admin, Field Tech, Teacher | A1, A3, F1, F2, T1, T4 |
| **Sprint 3** | Groups + Save API | T2, T3, Lesson save API, Lesson discovery |

---

## Suggested focus

- **Launch and community:** **L1 + L2** — Public launch and onboarding so the project is discoverable and contributors know where to start.
- **Year 2:** **L3** — When preparing for WYSIWYG and v1.0 spec.
- **Quality:** **Q1** if the hardware baseline is still inconsistent across docs; **Q2** if "running portal against hub" is not yet obvious.
- **Optional:** **O1–O3** as capacity allows (device test, outreach, discovery API).

---

## References

- **Multi-sprint plan:** `docs/SPRINT-PLAN.md`
- **Configuration wizards:** `docs/SPRINT-CONFIGURATION-WIZARDS.md`
- **Full task list and history:** `docs/SPRINT-NEXT.md`
- **Roadmap:** `docs/ROADMAP.md`
- **Launch checklist:** `docs/LAUNCH-AND-COMMUNITY.md`
- **Evaluation and recommendations:** `docs/ARCHITECTURE-EVALUATION.md`
