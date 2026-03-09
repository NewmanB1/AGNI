# OLS Architecture Verification Report

Cross-check of key architectural claims against the codebase. Generated for traceability.

---

## 1. Device Binding & Runtime Verification

**Claim:** Hub signs content bound to device UUID; player verifies identity + signature.

| Item | Status | Location |
|------|--------|----------|
| Signing (Ed25519, Hash(Content+NUL+deviceId)) | ✅ Verified | `packages/agni-utils/crypto.js` — `signContent()` |
| Globals injection (OLS_SIGNATURE, OLS_PUBLIC_KEY, OLS_INTENDED_OWNER) | ✅ Verified | `packages/ols-compiler/services/lesson-assembly.js` |
| CLI + hub-transform use same path | ✅ Verified | Both call lessonAssembly with options; hub-transform gets signature from crypto.signContent |
| Runtime verification (SubtleCrypto + TweetNaCl fallback) | ✅ Verified | `packages/agni-runtime/integrity/integrity.js` |
| Player delegates to AGNI_INTEGRITY | ✅ Verified | `packages/agni-runtime/ui/player.js` — `verifyIntegrity()` |

**Note:** Root `player.js` (standalone/minimal player) has a stub `verifyIntegrity()` that returns `true` with a TODO. The **canonical** player used by compiled bundles is `packages/agni-runtime/ui/player.js`, which delegates to `AGNI_INTEGRITY.verify()`. The root file appears to be a legacy or dev-only entry point.

---

## 2. Theta — Skill Graph & BFS

**Claim:** Theta enforces prerequisites via BFS; cycle guard prevents infinite loops.

| Item | Status | Location |
|------|--------|----------|
| buildSkillGraph from lesson index / curriculum | ✅ Verified | `packages/agni-hub/theta.js` — `buildSkillGraph()` |
| detectSkillGraphCycles (DFS, back-edge = cycle) | ✅ Verified | `theta.js` — `detectSkillGraphCycles()` |
| Theta exits on cycle at startup | ✅ Verified | `updateSharedCacheIfNeeded()` throws when cycle detected |
| computeLessonOrder filters by mastery | ✅ Verified | `theta.js` — `computeLessonOrder()` checks `studentSkills[req] >= MASTERY_THRESHOLD` |
| MLC clamp [0, ∞) | ✅ Verified | `MIN_MLC` (0.001) used in `computeLessonTheta()` |

---

## 3. DAG Validation (Compile-Time)

**Claim:** `verify:skill-dag` and `check-skill-dag.js` validate cycles before deployment.

| Item | Status | Location |
|------|--------|----------|
| Script exists | ✅ Verified | `scripts/check-skill-dag.js` |
| Uses skill-dag-validate | ✅ Verified | `@agni/utils/skill-dag-validate` |
| In verify:all | ✅ Verified | `package.json` |
| Exit 1 on cycles, 0 on acyclic | ✅ Verified | Script logic |

---

## 4. Federation Merge

**Claim:** Precision-weighted Bayesian merge; hub-to-hub posterior merging without raw data.

| Item | Status | Location |
|------|--------|----------|
| contentHash for dedup | ✅ Verified | `packages/agni-engine/federation.js` — `contentHash()` |
| MAX_SEEN_SYNC_IDS (FIFO eviction) | ✅ Verified | `federation.js` |
| Precision-weighted merge | ✅ Verified | Merge logic uses precision matrices |
| MEAN_CLIP (poisoning mitigation) | ✅ Verified | `federation.js` |

---

## 5. IR & Sidecar

**Claim:** Sidecar `{lesson}-ir.json` or `index-ir.json` alongside HTML.

| Item | Status | Location |
|------|--------|----------|
| HTML builder writes sidecar | ✅ Verified | `packages/ols-compiler/builders/html.js` |
| Theta reads `serveDir/lessons/{slug}/index-ir.json` | ✅ Verified | `theta.js` — `rebuildLessonIndex()` |
| Lessons without IR | ✅ Verified | Theta refuses to index; no HTML scrape fallback. Single source of truth (IR only). See ARCHITECTURE Known Gaps. |

---

## Summary

All major architectural claims are **verified** in the codebase. The only discrepancy is the root `player.js` stub — that file is not the canonical player for compiled bundles; the canonical implementation lives in `packages/agni-runtime/`.
