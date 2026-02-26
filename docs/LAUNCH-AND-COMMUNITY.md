# Launch and Community Onboarding (Phase 4)

This document supports **ROADMAP Phase 4: Launch & Ecosystem (Days 76–100)**. It provides a launch checklist, suggested GitHub labels for community onboarding, and pointers to the code-as-content tutorial.

---

## 1. Launch checklist (Days 76–80)

- [ ] **Publish manifesto / intro** to HN, Reddit, Dev.to (or equivalent).
  - **One-line pitch:** AGNI compiles YAML lessons into tiny, offline-first HTML bundles that run on 10-year-old phones and use sensors (accelerometer, etc.) for interactive learning.
  - **Links:** Repo, README, CONTRIBUTING.md, and (optional) a short blog post or manifesto in `docs/` or the repo wiki.
- [ ] **Pin README and CONTRIBUTING** so new visitors see how to run, validate, and contribute.
- [ ] **Tag a release** (e.g. `v0.1.0` or `v0.2.0`) so the launch points at a stable artifact.

---

## 2. Community onboarding (Days 81–85)

### Triage and labels

- **Triage issues** regularly so contributors know what's in scope and what's already covered.
- **Suggested GitHub labels** for "Good First Issue" and discovery:
  - `good first issue` — small, well-scoped tasks (e.g. translate one lesson, fix a doc typo).
  - `translation` — adding or updating a lesson translation (see tutorial below).
  - `documentation` — docs, README, playbooks, tutorials.
  - `hub` / `runtime` / `compiler` — area of the codebase (optional).
  - `priority: high` / `priority: low` — optional priority.

### Where to point new contributors

| Interest | Point them to |
|----------|----------------|
| **Translate a lesson** | **`docs/tutorials/fork-and-translate-lesson.md`** — step-by-step fork and translate. |
| **Write a new lesson** | **CONTRIBUTING.md** — "Write a Lesson" and `lessons/gravity.yaml` as reference. |
| **Fix or extend compiler/runtime** | **ARCHITECTURE.md**, **`docs/playbooks/`** (compiler.md, runtime.md, lms.md). |
| **Governance or policy** | **`docs/playbooks/governance.md`**, **`docs/api-contract.md`**. |

---

## 3. Code-as-content tutorial (Days 86–90)

- **Tutorial doc:** **`docs/tutorials/fork-and-translate-lesson.md`**  
  Step-by-step "How to fork and translate a lesson" using the Golden Master (`gravity.yaml`) and the Spanish example (`gravity-es.yaml`). Use this as the **script or source for a short video** ("How to fork and translate a lesson").
- **Optional:** Record a 5–10 minute video walking through the tutorial and link it from the README or CONTRIBUTING.

---

## 4. References

- **ROADMAP:** `docs/ROADMAP.md` — Phase 4 (Days 76–100), Year 2 prep.
- **Contributing:** CONTRIBUTING.md.
- **Architecture and playbooks:** ARCHITECTURE.md, `docs/playbooks/`.
- **Translation stress test:** `docs/translation-stress-test.md`.
