> **Issues moved to:** [UNRESOLVED-ISSUES-MASTER-LIST.md](../UNRESOLVED-ISSUES-MASTER-LIST.md)

# Architectural Vulnerabilities — Phase 2 Plan

This document extends the Phase 1 remediation (`ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md`, in archive) with 28 additional issues identified in deep architectural analysis. Prioritized for implementation.

---

## Priority Overview

| Priority | Count | Focus |
|----------|-------|-------|
| **P0 (Critical)** | 6 | Silent corruption, supply-chain, DoS |
| **P1 (High)** | 8 | Data integrity, race conditions |
| **P2 (Medium)** | 11 | UX, validation, cleanup |
| **P3 (Low)** | 3 | Documentation, advisory |

---

## P0 — Critical (Implement First)

### 1. Disk Cache Consistency Race / Non-Atomic Compilation

**Problem:** `_writeDiskCache` writes `index.html`, `index-ir.json`, `index-ir-full.json` directly into `lessons/<slug>/`. Concurrent compiles, hub restart, or power loss can leave `index.html` present but `index-ir.json` missing → lesson silently disappears from curriculum.

**Fix:** Transactional compilation. Write to `lessons/<slug>.tmp/`, fsync each file, rename dir, then fsync parent directory. Never write individual files into the final directory.

**Location:** `packages/agni-hub/hub-transform.js` — `_writeDiskCache`, `_getDiskCachePaths`, `_tryReadDiskCache`.

---

### 2. Power-Loss Corruption During Compilation

**Problem:** hub-transform streams HTML to response; disk cache writes are non-atomic. Power loss during write → truncated index.html served indefinitely.

**Fix:** Same as #1 — atomic directory swap. Also: on cache read, validate IR schema and (optionally) content hash; if invalid, force recompile.

**Location:** `hub-transform.js`.

---

### 3. YAML Parser DoS — Deep Nesting

**Problem:** YAML can create pathological nesting (`a: { b: { c: ... } }`) under 2MB, exhausting stack or breaking recursion.

**Fix:** Add `maxDepth` (e.g. 50) after parsing or use a depth-limited parse. `js-yaml` does not expose depth; wrap with a post-parse depth check or use a custom loader.

**Location:** `packages/agni-utils/yaml-safe.js`.

---

### 4. YAML Parser DoS — Key Explosion

**Problem:** `steps: { step1: ..., step2: ..., ... step500000 }` can generate hundreds of thousands of nodes under 2MB.

**Fix:** Enforce `MAX_STEPS` (e.g. 500) and `MAX_KEYS` at top level. Reject or truncate.

**Location:** `packages/agni-utils/yaml-safe.js`, schema validation.

---

### 5. Factory Loader Supply-Chain Vulnerability

**Problem:** Shared resources (shared-runtime.js, svg-stage.js) are not per-lesson signed. Mitigation: SRI (sha384) is injected into LESSON_DATA at compile time; factory-loader verifies each fetch before execution. MitM on factory fetch fails SRI. Integrity hashes are in the signed lesson. Remaining: hub-signed manifest not implemented (SRI + signed lesson is sufficient for MitM protection).

**Fix:** Hub signs resource manifest; device verifies. Or bundle runtime into lesson signature. Higher effort.

**Location:** `packages/agni-hub/hub-transform.js`, `packages/agni-runtime/ui/factory-loader.js`, Service Worker.

---

### 6. Markdown Pipeline XSS / Injection

**Problem:** Markdown can produce `[link](javascript:...)`, `<img src="data:... huge">`. HTML output may contain XSS or resource exhaustion.

**Fix:** Sanitize `href`, `src`, inline HTML in Markdown pipeline output. Use allowlist (e.g. only `https://`, `mailto:`).

**Location:** Markdown renderer (KaTeX, markdown-it or equivalent in compiler).

---

## P1 — High

### 7. IR Sidecar Fragility (Single Point of Failure)

**Problem:** Theta skips lessons without valid IR sidecar. Partial write or missing file = lesson disappears.

**Fix:** Atomic compile (#1) addresses write race. Add schema validation on read; invalid → recompile.

---

### 8. Directory Fsync Missing

**Problem:** `rename` not durable until parent directory is fsync'd. Power loss may lose the rename.

**Fix:** After `rename(tmp, final)`, call `fsyncSync(parentDirFd)` or `fsync` on parent. Add to `atomicWriteWithFsync` helper.

**Location:** `packages/agni-utils/json-store.js`, `packages/agni-engine/index.js`.

---

### 9. Service Worker Update / Version Mismatch Trap

**Problem:** SW update can fail partially. Old SW + new runtime → `undefined` factory, broken visuals.

**Fix:** Runtime manifest version check before lesson execution. Reject or prompt update if version mismatch.

**Location:** `factory-loader.js`, `runtimeManifest.js`, SW.

---

### 10. PWA Race — Factories vs. Lesson Execution

**Problem:** Factories may not be loaded when lesson starts. `AGNI_SVG` undefined.

**Fix:** Player uses `loadDependencies(LESSON_DATA).then(...)` — handshake exists. Verify all entry paths (shell-boot, standalone) await `loadDependencies` before render. Audit shell-boot, factory-loader.

---

### 11. Signature Placeholder Fragility

**Problem:** Verification replaces signature with placeholder; DOM/whitespace differences can break verification. Minification, encoding differences.

**Fix:** Sign binary blob (hash of script bytes), not reconstructed DOM. Verification fetches raw script.

**Location:** `packages/agni-utils/crypto.js`, `packages/agni-runtime/integrity/integrity.js`.

---

### 12. Device ID Trust Boundary

**Problem:** `OLS_INTENDED_OWNER` compared to device UUID. If UUID in localStorage, student can change it → anti-copy bypassed.

**Fix:** Hub-issued device secret or hardware-backed identifier. Document limitation.

---

### 13. Session Token Replay Risk

**Problem:** 24h session; token can be copied between devices.

**Fix:** Bind session to deviceId; or shorter TTL. Document.

---

### 14. Theta Rebuild Hazard (Partial File)

**Problem:** `rebuildLessonIndex` may read IR sidecar while compile is writing → partial/corrupt JSON.

**Fix:** Atomic compile (#1). Rebuild should validate schema and parse; invalid → skip with warning.

---

## P2 — Medium

### 15. Graph Weight Runaway

**Problem:** Weight update logic could exceed [0,1] without clamp.

**Fix:** Sentry already clamps in `computeEdgesFromGlobalPairs`. Theta merge path must clamp. Audit all update paths.

---

### 16. Skill Cycle Handling Silently Hides Curriculum

**Problem:** Pruning cycles removes lessons without operator visibility.

**Fix:** Already have `AGNI_STRICT_SKILL_GRAPH=1`. Add governance event or sentry dashboard alert for cycle detection.

---

### 17. UTU Band Validation Advisory Only

**Problem:** Band mismatch could deliver wrong-age content.

**Fix:** Enforce band validation or record override in features.

---

### 18. Step Spec Schema Validation

**Problem:** No strict schema for `step.spec`; malformed params crash runtime.

**Fix:** JSON Schema validation per step type. OLS schema may already cover; verify.

---

### 19. Sensor Dependency Mismatch

**Problem:** Lesson requires accelerometer; device lacks it → runtime crash.

**Fix:** Check sensor availability before execution; reject or show fallback.

---

### 20. Pi `serveDir/lessons` Disk Exhaustion

**Problem:** Many YAML versions → disk fills. No GC policy.

**Fix:** Garbage collection or version retention. Document policy.

---

### 21. Sneakernet Import Integrity

**Problem:** Unsigned LMS state export can be tampered.

**Fix:** Sign sneakernet packets. Verify on import.

---

### 22. Catalog / IR Drift

**Problem:** Catalog and YAML can diverge → orphans.

**Fix:** Validation step: catalog ↔ yaml ↔ IR consistency.

---

### 23. SVG Stage Memory Leak

**Problem:** `destroyStepVisual()` may not remove listeners → memory leak across steps.

**Fix:** Audit svg-stage.js, ensure all subscriptions/listeners cleared on destroy.

---

### 24. Edge Device SW Cache Eviction

**Problem:** Chrome evicts cache arbitrarily. Offline lesson load fails.

**Fix:** Document eviction strategy; consider explicit quota/versioning.

---

### 25. Spec.Type Whitelist (Prototype Pollution)

**Problem:** `spec.type: "__proto__"` could cause prototype pollution.

**Fix:** SVG registry uses `Registry.get(id)` — whitelist lookup. Unknown id returns null. **Audit confirms:** spec.factory is looked up in _registry; not used for property access. Mitigated.

---

### 26. LMS Federation Merge Correctness

**Problem:** Double-count, out-of-order merges, no epoch/version.

**Fix:** Add `posteriorVersion`, `trainingWindow`; design merge semantics.

---

## P3 — Low

### 27. Memory Budget (LRU by Bytes)

**Problem:** 100 entries × 300KB IR ≈ 30MB. Pi can OOM.

**Fix:** Cache by bytes, not count. Or reduce MAX_CACHE_ENTRIES on Pi.

---

### 28. Compile Concurrency Starvation

**Problem:** 3 compiles can freeze hub event loop.

**Fix:** Already have `compileConcurrency: 1` on Pi. Consider `min(cores-2, 2)` formula.

---

## Implementation Order

1. **Transactional compile** (#1, #2, #7) — single change fixes multiple issues ✅
2. **YAML DoS limits** (#3, #4) ✅
3. **Directory fsync** (#8) ✅
4. **Markdown sanitization** (#6) ✅
5. **Audit & document** (#10, #15, #25) ✅

---

## Implementation Status

| # | Status | Location |
|---|--------|----------|
| 1, 2, 7 | Done | hub-transform transactional compile, IR validation |
| 3, 4 | Done | yaml-safe.js: depthOf, MAX_STEPS, maxKeys |
| 5 | Done | SRI + versioned URLs; hub-signed manifest at /factories/manifest.json; device verifies before loading factories |
| 6 | Done | rehype-sanitize with protocols allowlist (href: https/mailto, src: https only) |
| 8 | Done | json-store, atomic-write, engine, hub-transform: parent dir fsync |
| 9 | Done | Version in factory URL; _runtimeVersion in LESSON_DATA |
| 10 | Done | Audited: shell-boot and player await loadDependencies |
| 12, 13 | Documented | village-security.md: device ID, session replay |
| 14 | Done | Addressed by atomic compile |
| 15 | Done | Audited: sentry, sync clamp weights |
| 16 | Done | skill-graph-cycles.json written on cycle detection |
| 20, 24 | Documented | RUN-ENVIRONMENTS.md: disk policy, SW eviction |
| 25 | Done | Audited: Registry whitelist |
| 26 | Done | federation.js: posteriorVersion, trainingWindow |

---

## References

- Phase 1: `ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md` (same archive)
- Status: `ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md` (same archive)
- hub-transform: `packages/agni-hub/hub-transform.js`
- yaml-safe: `packages/agni-utils/yaml-safe.js`
- svg-registry: `packages/agni-runtime/rendering/svg-registry.js`
