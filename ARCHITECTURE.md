# AGNI Architecture — Overview

**Summary.** AGNI compiles OLS (Open Lesson Standard) YAML lessons into single-file HTML or native bundles. The system is offline-first: a Village Hub compiles lessons on demand and serves them to devices. The LMS engine (Rasch, Thompson bandit) adapts lesson selection to student progress.

---

## Data flow

```
YAML lesson  →  Compiler (IR)  →  HTML / native bundle
                     ↓
              lesson-ir.json (sidecar)
                     ↓
              Theta (lesson ordering) + LMS (selection)
                     ↓
              Hub serves lesson to device  →  Player runs in browser
```

---

## Key directories

| Path | Role |
|------|------|
| `packages/ols-compiler/` | Lesson compiler: YAML → IR → output |
| `packages/agni-runtime/` | Browser player, sensors, SVG factories |
| `packages/agni-engine/` | LMS engine (Rasch, Thompson, embeddings) |
| `packages/agni-utils/` | Shared utilities |
| `server/hub-transform.js` | On-demand lesson delivery |
| `hub-tools/theta.js` | Lesson ordering, skill graph, MLC |
| `schemas/` | OLS and related JSON schemas |
| `lessons/` | Example and production lesson YAML |

---

## Full architecture

For detailed design, phases, governance, and technical constraints, see:

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — canonical single source of truth.
