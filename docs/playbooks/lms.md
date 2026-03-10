# How to modify the LMS Engine

Use this when changing adaptive selection, Rasch, embeddings, bandit, or federation.

## Entry points

- **Service:** `packages/agni-services/lms.js` — wrapper used by theta and HTTP. Exposes `selectBestLesson`, `recordObservation`, `seedLessons`, `getStatus`, `exportBanditSummary`, `mergeRemoteSummary`.
- **Engine:** `packages/agni-engine/index.js` (canonical). Internal API: state load/save, seeding, selection, observation. Consumed by `@agni/services/lms`. ES5 JavaScript only; no TypeScript, no compile step.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Change state shape (Rasch, embedding, bandit) | `packages/agni-engine/index.js` (`buildDefaultState`, load/save). Update `packages/types/index.d.ts` (`LMSState`, `RaschState`, `EmbeddingState`, `BanditState`). **Add migration in `packages/agni-engine/migrations.js`** — migrations are mandatory; do not rely on "delete state file" as an upgrade path. |
| Change ability estimation | `packages/agni-engine/rasch.js` — `updateAbility()`. Contract: receives probeResults, updates state.rasch.students, returns gain proxy. |
| Change student/lesson vectors | `packages/agni-engine/embeddings.js` — `ensureStudentVector`, `ensureLessonVector`, `updateEmbedding()`. Dimension is `state.embedding.dim`. |
| Change bandit (selection or update) | `packages/agni-engine/thompson.js` — `selectLesson()`, `updateBandit()`, `ensureBanditInitialized()`. Invariant: `featureDim === embeddingDim * 2`; feature vector = concat(studentVec, lessonVec). |
| Change top-K cap for selection | `AGNI_TOP_K_CANDIDATES` (default 500). `packages/agni-engine/index.js` caps candidates to topK before Thompson/Markov/PageRank scoring; theta returns topK lessons. Reduces CPU on Pi for 10k+ lessons. |
| Change federation merge | `packages/agni-engine/federation.js` — `getBanditSummary()`, `mergeBanditSummaries()`. **Contract:** `BanditSummary.embeddingDim` must match across federating hubs; all must deploy with identical `AGNI_EMBEDDING_DIM`. |
| Change Markov (transitions, cooldowns) | `packages/agni-engine/markov.js`. Cooldowns use `observationIndex` (sequence-based) for time-skew resilience; `packages/agni-utils/json-store.js` uses write → fsync file → rename → fsync parent dir. |
| Change math (linear algebra) | `packages/agni-engine/math.js` — pure helpers; no state. See `docs/playbooks/math.md` for conventions and testing. |

## Do not

- Bypass `@agni/services/lms` from theta or HTTP; keep a single entry point for the engine.
- Change `featureDim` or embedding dim without a migration in `packages/agni-engine/migrations.js`. "Delete state file" is not acceptable — village deployments have no internet; data loss would be permanent.
- Add new dependencies inside `packages/agni-engine/` without ensuring Node 14+ compatibility (per `docs/ARCHITECTURE.md` and `package.json` engines — hub target).

## Types

- `packages/types/index.d.ts`: `LMSState`, `BanditSummary`, `RaschState`, `EmbeddingState`, `BanditState`. JSDoc in engine files uses `import('@agni/types')` or path to `packages/types/`.
