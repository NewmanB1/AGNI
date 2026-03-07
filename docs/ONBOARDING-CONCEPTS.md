# Key concepts (onboarding)

Short glossary for new contributors. Links point to where each idea is defined or implemented.

---

## Monorepo structure

AGNI is organized as an **npm workspaces monorepo**. Each package has a clear boundary, its own README, and declared dependencies:

| Package | npm name | What it is |
|---------|----------|------------|
| [`packages/ols-schema`](../packages/ols-schema/) | `@ols/schema` | **The OLS standard itself:** JSON schema, validators, threshold grammar |
| [`packages/ols-compiler`](../packages/ols-compiler/) | `@ols/compiler` | Lesson compiler: YAML → IR → HTML/native/YAML-packet |
| [`packages/agni-utils`](../packages/agni-utils/) | `@agni/utils` | Shared utilities: logging, config, crypto, I/O (pure leaf — no deps) |
| [`packages/agni-engine`](../packages/agni-engine/) | `@agni/engine` | Learning engine: Rasch, Thompson, embeddings, PageRank, federation |
| [`packages/agni-runtime`](../packages/agni-runtime/) | `@agni/runtime` | Browser runtime: player, sensors, SVG factories (ES5, Chrome 44+) |
| [`packages/agni-governance`](../packages/agni-governance/) | `@agni/governance` | Policy enforcement, compliance evaluation, catalog management |
| [`packages/agni-hub`](../packages/agni-hub/) | `@agni/hub` | Village Hub server: HTTP routes, theta, accounts, telemetry |
| [`portal/`](../portal/) | — | Vanilla HTML/CSS/JS teacher and admin portal |

**Dependency flow** (each package only depends on packages above it):

```
@agni/utils          ← pure leaf, no monorepo deps
@agni/runtime        ← browser-only, no Node deps
@ols/schema          ← depends on @agni/utils
@agni/engine         ← depends on @agni/utils
@agni/governance     ← depends on @agni/utils
@ols/compiler        ← depends on @ols/schema + @agni/utils
@agni/hub            ← depends on all of the above
```

Read each package's `README.md` for what's inside and how to contribute to that specific area.

---

## OLS (Open Lesson Standard)

The **file format and protocol** for lessons: YAML source with `meta`, `ontology`, `gate`, and `steps`. Lessons are compiled to HTML or native bundles. The schema is **`schemas/ols.schema.json`**, exposed as `@ols/schema`. See **`docs/ARCHITECTURE.md`** and **`docs/REFERENCE-IMPLEMENTATION-VISION.md`**.

---

## Theta (θ) — adaptive ordering

**Theta** is the **lesson ordering engine**: it decides which lessons to show next based on prerequisites and a **Marginal Learning Cost (MLC)** heuristic. Implemented in **`packages/agni-hub/theta.js`** (`@agni/hub`).

- **Skill graph:** Lessons declare `requires` and `provides` skills. Theta builds a graph and only offers lessons whose prerequisites are met.
- **MLC:** Among eligible lessons, theta orders by “cost” so that lessons that fit the student’s background (e.g. weaving vs farming) are preferred. Formula: θ = BaseCost − CohortDiscount. MLC is clamped to [0, ∞) to avoid negative values. BaseCost ∈ [0, 1]; graph edge weights must be in [0, 1].
- **Pure core:** `computeLessonOrder(...)` and `applyRecommendationOverride(...)` are pure functions; HTTP and index loading are at the edge.

See **`docs/ARCHITECTURE.md`** §7 and **`docs/playbooks/sentry.md`** for Sentry → graph_weights → theta flow.

---

## Rasch model

Used inside the **LMS engine** to estimate **student ability** from quiz outcomes. Each lesson can expose “probes” (e.g. quiz items); correct/incorrect answers update a Rasch ability estimate. Implemented in **`packages/agni-engine/rasch.js`**. The engine uses this ability as a **gain** signal for embeddings and the bandit.

---

## Thompson sampling (bandit)

The **LMS engine** uses **Thompson sampling** to choose which lesson to recommend next among the set that **theta** has already filtered (by prerequisites). It balances exploration and exploitation using a Bayesian bandit over lesson features. Implemented in **`packages/agni-engine/thompson.js`**. Pure function: `selectLesson(state, studentId)`; persistence is at the edge.

---

## Skill graph / ontology

Lessons declare **`ontology.requires`** and **`ontology.provides`** (skills, e.g. `ols:physics:gravity_concept`). The **skill graph** is built from all lessons’ requires/provides. Theta uses it for BFS eligibility: a lesson is only offered if the student has “mastery” (or progress) on all required skills. Graph weights (from Sentry or defaults) tune the cost of each skill for MLC.

---

## Village Hub / hub-transform

The **Village Hub** is the edge server that compiles YAML to HTML or JSON on demand and serves the theta/LMS APIs. **`packages/agni-hub/hub-transform.js`** (server/ is a shim) turns a lesson YAML request into a PWA-style bundle. Theta runs in the same process and provides `/api/theta`, `/api/lms/...`, and governance endpoints.

---

## Where to go next

- **Package READMEs:** Start with the package closest to your area of interest — each has a self-contained `README.md`.
- **Architecture:** **`docs/ARCHITECTURE.md`** (canonical single source of truth).
- **Reference implementation:** **`docs/REFERENCE-IMPLEMENTATION-VISION.md`** (schema-based, pure core, boundaries).
- **Playbooks:** **`docs/playbooks/`** — compiler, runtime, governance, theta, thin-client targets, typing, Sentry, federation.
