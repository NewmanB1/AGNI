# Key concepts (onboarding)

Short glossary for new contributors. Links point to where each idea is defined or implemented.

---

## OLS (Open Lesson Standard)

The **file format and protocol** for lessons: YAML source with `meta`, `ontology`, `gate`, and `steps`. Lessons are compiled to HTML or native bundles. The schema is **`schemas/ols.schema.json`**. See **`docs/ARCHITECTURE.md`** and **`docs/REFERENCE-IMPLEMENTATION-VISION.md`**.

---

## Theta (θ) — adaptive ordering

**Theta** is the **lesson ordering engine**: it decides which lessons to show next based on prerequisites and a **Marginal Learning Cost (MLC)** heuristic. Implemented in **`hub-tools/theta.js`**.

- **Skill graph:** Lessons declare `requires` and `provides` skills. Theta builds a graph and only offers lessons whose prerequisites are met.
- **MLC:** Among eligible lessons, theta orders by “cost” so that lessons that fit the student’s background (e.g. weaving vs farming) are preferred. Formula: θ = BaseCost − CohortDiscount.
- **Pure core:** `computeLessonOrder(...)` and `applyRecommendationOverride(...)` are pure functions; HTTP and index loading are at the edge.

See **`docs/ARCHITECTURE.md`** §7 and **`docs/playbooks/sentry.md`** for Sentry → graph_weights → theta flow.

---

## Rasch model

Used inside the **LMS engine** to estimate **student ability** from quiz outcomes. Each lesson can expose “probes” (e.g. quiz items); correct/incorrect answers update a Rasch ability estimate. Implemented in **`src/engine/rasch.js`**. The engine uses this ability as a **gain** signal for embeddings and the bandit.

---

## Thompson sampling (bandit)

The **LMS engine** uses **Thompson sampling** to choose which lesson to recommend next among the set that **theta** has already filtered (by prerequisites). It balances exploration and exploitation using a Bayesian bandit over lesson features. Implemented in **`src/engine/thompson.js`**. Pure function: `selectLesson(state, studentId)`; persistence is at the edge.

---

## Skill graph / ontology

Lessons declare **`ontology.requires`** and **`ontology.provides`** (skills, e.g. `ols:physics:gravity_concept`). The **skill graph** is built from all lessons’ requires/provides. Theta uses it for BFS eligibility: a lesson is only offered if the student has “mastery” (or progress) on all required skills. Graph weights (from Sentry or defaults) tune the cost of each skill for MLC.

---

## Village Hub / hub-transform

The **Village Hub** is the edge server that compiles YAML to HTML or JSON on demand and serves the theta/LMS APIs. **`server/hub-transform.js`** turns a lesson YAML request into a PWA-style bundle. Theta runs in the same process and provides `/api/theta`, `/api/lms/...`, and governance endpoints.

---

## Where to go next

- **Architecture:** **`docs/ARCHITECTURE.md`** (canonical), root **`ARCHITECTURE.md`** (implementation overview).
- **Reference implementation:** **`docs/REFERENCE-IMPLEMENTATION-VISION.md`** (schema-based, pure core, boundaries).
- **Playbooks:** **`docs/playbooks/`** — compiler, runtime, governance, theta, thin-client targets, typing, Sentry, federation.
