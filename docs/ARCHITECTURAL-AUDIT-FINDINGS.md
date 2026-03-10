# Architectural Audit Findings

Audit of three items from the Phase 2 plan: `spec.type` whitelist (SVG registry), graph weight clamping, and PWA/factory load order. Conducted as part of architectural vulnerability remediation.

---

## 1. spec.factory / spec.type Whitelist (SVG Registry)

**Question:** Can untrusted lesson data (e.g. `spec.factory: "__proto__"` or arbitrary strings) cause prototype pollution or arbitrary code execution via the SVG registry?

**Location:** `packages/agni-runtime/rendering/svg-registry.js`

**Finding: Safe.** Whitelist is enforced.

| Check | Result |
|-------|--------|
| Lookup mechanism | `Registry.get(id)` uses `_registry.find(d => d.id === id)` — strict equality against a fixed array. Unknown IDs return `null`. |
| Property access from spec | Only `spec.factory`, `spec.opts`, `spec.compose`, `spec.layers` (and stage opts) are read. No generic property enumeration. |
| Prototype pollution | `spec.factory = "__proto__"` or `"constructor"` yields no descriptor; `Registry.get` returns null. No assignment to `Object.prototype` or similar. |
| Code path | `fromSpec` → `Registry.preview(spec.factory, container, spec.opts)` → `Registry.get(id)`. If `!desc`, returns null and logs a warning. |

**Conclusion:** The SVG registry acts as a whitelist. Only registered factory IDs in `_registry` can produce visuals. Unknown or malicious IDs are rejected.

---

## 2. Graph Weight Clamping

**Question:** Are graph edge weights clamped to [0, 1] everywhere they are written or merged, to avoid numeric instability or out-of-range values?

**Location:** `packages/agni-hub/sentry.js`, `sentry-analysis.js`, `sync.js`, `theta.js`

**Finding: Safe.** Clamping is applied at all write/merge points.

| Location | Behavior |
|----------|----------|
| `sentry.js:386` | `Object.assign({}, e, { weight: Math.max(0, Math.min(1, newWeight)) })` — every edge written has weight ∈ [0, 1]. |
| `sentry-analysis.js:54` | `evidencedLevel: Math.max(0, Math.min(1, lev))` |
| `sentry-analysis.js:114` | `weight: Math.max(0, Math.min(1, weight))`, `confidence: Math.max(0, Math.min(1, ...))` |
| `sync.js:247-248` | Incoming graph_weights edges: `weight: Math.max(0, Math.min(1, e.weight))`, `confidence: Math.max(0, Math.min(1, e.confidence))` |
| `theta.js` | Reads graph weights only; does not write. Values on disk come from sentry (clamped) or sync (clamped). |

**Conclusion:** Weights and confidence values are clamped to [0, 1] at every write and merge path. Theta does not modify graph weights directly.

---

## 3. PWA / Factory Load Order (Handshake)

**Question:** Does the PWA shell and player render lesson content only after shared runtime and factory dependencies are loaded, avoiding render-before-init races?

**Location:** `packages/agni-hub/pwa/shell-boot.js`, `packages/agni-runtime/ui/factory-loader.js`, `packages/agni-runtime/shared-runtime.js`, `packages/agni-runtime/ui/player.js`

**Finding: Safe.** Both entry points await `loadDependencies` before rendering.

| Entry Point | Flow |
|-------------|------|
| **shell-boot.js** | If `AGNI_LOADER` and `LESSON_DATA.requires` exist: `loadDependencies(LESSON_DATA).then(renderLesson).catch(renderLesson)`. If no loader, renders immediately (no SVG steps). |
| **player.js** | Uses `AGNI_SVG.fromSpec` for SVG steps. `AGNI_SVG` is provided by factory files loaded via `loadDependencies`. The player is initialized only after `loadDependencies` completes (lesson bootstrap in HTML/player setup). |
| **shared-runtime.js** | `setSafeHtml` and `AGNI_SHARED.svg.fromSpec` depend on `AGNI_SVG`; these run only after factory-loader has loaded SVG modules. |

**Conclusion:** Dependencies are loaded before lesson render. There is no render-before-init race: the shell and player both wait for `loadDependencies` before displaying SVG steps.

---

## 4. Factory Supply Chain (P0 #5) — Partial Mitigation

**Problem:** Shared resources (shared-runtime.js, svg-factories.js) are not per-lesson signed; could be vulnerable if integrity were not verified.

**Current mitigation:** Hub computes SRI (sha384) for each factory file and embeds it in LESSON_DATA (part of the signed lesson script). Factory-loader verifies SRI before executing each fetch. MitM on factory fetch fails SRI. Factory URLs include `?v=<version>` for cache versioning. SRI protects against local-network MitM on factory fetches. Hub-signed resource manifest not implemented (SRI + signed lesson is sufficient for MitM protection).

---

## Summary

| Audit Item | Status | Notes |
|------------|--------|-------|
| spec.factory whitelist | ✅ Safe | Registry lookup rejects unknown IDs; no prototype pollution. |
| Graph weight clamping | ✅ Safe | All write/merge paths clamp weight and confidence to [0, 1]. |
| PWA/factory handshake | ✅ Safe | Shell and player await `loadDependencies` before render. |
| Factory supply chain | ⚠ Partial | SRI + versioned URLs; full hub-signed manifest not implemented. |
