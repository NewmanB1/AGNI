# How to modify the LMS Engine

Use this when changing adaptive selection, Rasch, embeddings, bandit, or federation.

## Entry points

- **Service:** `src/services/lms.js` — wrapper used by theta and HTTP. Exposes `selectBestLesson`, `recordObservation`, `seedLessons`, `getStatus`, `exportBanditSummary`, `mergeRemoteSummary`.
- **Engine:** `packages/agni-engine/index.js` (canonical); `src/engine/index.js` re-exports from `@agni/engine`. Internal API: state load/save, seeding, selection, observation. Consumed by `src/services/lms.js`. ES5 JavaScript only; no TypeScript, no compile step.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Change state shape (Rasch, embedding, bandit) | `packages/agni-engine/index.js` (`buildDefaultState`, load/save). Update `src/types/index.d.ts` (`LMSState`, `RaschState`, `EmbeddingState`, `BanditState`). **Add migration in `packages/agni-engine/migrations.js`** — migrations are mandatory; do not rely on "delete state file" as an upgrade path. |
| Change ability estimation | `packages/agni-engine/rasch.js` — `updateAbility()`. Contract: receives probeResults, updates state.rasch.students, returns gain proxy. |
| Change student/lesson vectors | `packages/agni-engine/embeddings.js` — `ensureStudentVector`, `ensureLessonVector`, `updateEmbedding()`. Dimension is `state.embedding.dim`. |
| Change bandit (selection or update) | `packages/agni-engine/thompson.js` — `selectLesson()`, `updateBandit()`, `ensureBanditInitialized()`. Invariant: `featureDim === embeddingDim * 2`; feature vector = concat(studentVec, lessonVec). |
| Change federation merge | `packages/agni-engine/federation.js` — `getBanditSummary()`, `mergeBanditSummaries()`. **Contract:** `BanditSummary.embeddingDim` must match across federating hubs; all must deploy with identical `AGNI_EMBEDDING_DIM`. |
| Change math (linear algebra) | `packages/agni-engine/math.js` — pure helpers; no state. See `docs/playbooks/math.md` for conventions and testing. |

## Do not

- Bypass `@agni/services/lms` (or `src/services/lms.js` re-export) from theta or HTTP; keep a single entry point for the engine.
- Change `featureDim` or embedding dim without a migration in `packages/agni-engine/migrations.js`. "Delete state file" is not acceptable — village deployments have no internet; data loss would be permanent.
- Add new dependencies inside `packages/agni-engine/` without ensuring Node 18+ compatibility (per `docs/ARCHITECTURE.md` and `package.json` engines — hub target).

## Types

- `src/types/index.d.ts`: `LMSState`, `BanditSummary`, `RaschState`, `EmbeddingState`, `BanditState`. JSDoc in engine files uses `import('../types')` or `import('../../types')` from engine subfolder.
