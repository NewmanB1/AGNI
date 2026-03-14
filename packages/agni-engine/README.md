# @agni/engine

The AGNI learning engine. Pure algorithmic core for student modelling, adaptive lesson selection, and cross-hub federation.

## What's here

| Module | Purpose |
|--------|---------|
| `rasch` | Rasch IRT model — estimates student ability from quiz outcomes |
| `thompson` | Linear Thompson Sampling — Bayesian bandit for lesson selection |
| `embeddings` | Online matrix factorization for student/lesson embedding vectors |
| `pagerank` | PageRank over curriculum graphs and student transition matrices |
| `markov` | Markov chain transition tracking for learning path analysis |
| `federation` | Precision-weighted Bayesian summary merging across village hubs |
| `math` | Linear algebra primitives (Cholesky, matrix ops) used by the above |
| `sm2` | SM-2 spaced repetition algorithm for review scheduling |
| `migrations` | LMS state schema migrations for backward compatibility |
| `index` | Engine orchestrator: state management, observation recording, lesson selection |

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the detailed architecture document (modules, state model, algorithms, invariants, integration).

The engine is designed as **pure functions with persistence at the edges**:

```
(state, observation) → newState     // applyObservation
(state, studentId)   → lessonId     // selectLesson (Thompson)
(local, remote)      → merged       // mergeBanditSummaries (federation)
```

State loading/saving happens in `@agni/services/lms` (the service wrapper), not in the engine itself.

## Usage

```js
const engine = require('@agni/engine');

// Record a quiz outcome
const newState = engine.applyObservation(state, {
  studentId: 'student_123',
  lessonId: 'physics:gravity',
  outcome: 'correct',
  responseTimeMs: 4500
});

// Select next lesson
const pick = engine.selectLesson(newState, 'student_123');
```

## Dependencies

- `@agni/utils` — logger and env-config only

## Contributing

Keep engine functions **pure** (input → output, no I/O). If you need to read/write files or make network calls, that belongs in `@agni/hub` (the service/route layer).
