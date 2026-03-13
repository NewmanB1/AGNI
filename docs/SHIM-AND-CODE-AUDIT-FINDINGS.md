# Shim & Code Audit Findings

This document tracks findings from a codebase audit covering shim fragility, svg-stage bugs, and yaml-safe security. Prioritized by risk.

---

## 1. Shim export fragility (low risk)

**Files:** `server/hub-transform.js`, `src/runtime/ui/player.js`, `src/runtime/ui/factory-loader.js`, and other `src/` re-exports.

**Issue:** `module.exports = require('@agni/hub').hubTransform` breaks if the canonical module changes to default export (`module.exports = hubTransform`). `hub.hubTransform` would be `undefined`.

**Safer pattern:**
```js
var hub = require('@agni/hub');
module.exports = hub.hubTransform || hub;
```

**Status:** Low priority. Canonical packages use named exports; change is theoretical. Document as convention; fix only high-traffic shims if desired.

---

## 2. yaml-safe.js — Security (high priority)

| # | Issue | Risk | Fix |
|---|-------|------|-----|
| 1 | `str.length` counts UTF-16 code units, not bytes | Multi-byte UTF-8 can exceed memory limits | Use `Buffer.byteLength(str, 'utf8')` |
| 2–4 | Anchor/alias regex bypasses in edge cases | Billion-laughs DoS | Broader patterns or scan for `&` / `*` before regex |
| 5 | `JSON_SCHEMA` allows Date, binary, omap | Unexpected types | **Done** — JSON_SCHEMA rejects !!timestamp/!!binary; post-parse hasUnsafeTypes rejects Date/Buffer/Map/Set |
| 6 | Recursion depth limit | — | **Implemented** in `depthOf()` |
| 7 | Key count limit | — | **Implemented** in `depthOf()` per object |
| 8 | Prototype pollution (`__proto__`, `constructor`) | High | Reject keys named `__proto__` or `constructor` post-parse |
| 9 | Stack trace leakage on yaml.load throw | Low | Wrap in try/catch, rethrow with sanitized message |
| 10 | Regex DoS on pathological strings | Medium | Short-circuit: `if (str.indexOf('&') === -1 && str.indexOf('*') === -1)` before regex |

**Most critical:** #1 (byte length), #8 (prototype pollution).

---

## 3. svg-stage.js — Bugs (medium priority)

| # | Issue | Risk | Fix |
|---|-------|------|-----|
| 1 | NodeList.forEach ES5 inconsistency | Low | `Object.keys(attrs)` is fine; document only |
| 2 | RAF: tick handlers may run one frame after destroy | Low | **Done** — _rafLoop checks _destroyed at top and before each callback |
| 3 | Tick handler ID: `Date.now() + Math.random()` not unique | Low | Use monotonic counter |
| 4 | Layer ID injection (`name` with `"`, `>`, `<`) | Medium | Sanitize: `name.replace(/[^\w-]/g, '_')` |
| 5 | `container.innerHTML = ''` destroys listeners | Medium | Use `while(container.firstChild) container.removeChild(container.firstChild)` |
| 6 | SVG namespace injection | Low | Document; layers use createElementNS |
| 7 | `lastSensorValues.get()` — Map is ES2015 | Note | Chrome 51 supports Map; RUN-ENVIRONMENTS ES5 is “vanilla JS” not strict ES5 |
| 8 | `unsub()` when unsub not a function | Medium | Check `typeof unsub === 'function'` before call |
| 9 | `subscribeToSensor` returns undefined | Medium | Only push if `unsub && typeof unsub === 'function'` |
| 10 | btoa/unescape for large SVG | Low | Consider Blob + createObjectURL for large exports |
| 11 | PNG export: tainted canvas → silent `''` | Low | Detect taint; return explicit error |
| 12 | sensorValue Map mid-read race | Low | Rare; acceptable |
| 13 | destroy() double-call | Low | Add `if (_destroyed) return` at start |
| 14 | _layers map never cleared | Low | **Done** — destroy() clears _layers = {} (P2-23) |
| 15 | RAF race: quick add/remove tick | Low | Edge case |
| 16 | Container removed from DOM, RAF continues | Low | Document; optional orphan check |

**Most critical:** #4 (ID injection), #5 (innerHTML), #8/#9 (unsub), #13 (destroy guard).

---

## 4. Implementation status

| Item | Status |
|------|--------|
| Byte-length check (yaml-safe) | **Done** — Buffer.byteLength when available |
| Prototype pollution (__proto__, constructor, prototype) | **Done** — hasUnsafeKeys() rejects |
| Anchor/alias regex DoS short-circuit | **Done** — indexOf before test() |
| try/catch around yaml.load | **Done** — sanitized error message |
| Date/binary/omap restriction (yaml-safe #5) | **Done** — JSON_SCHEMA rejects tags; hasUnsafeTypes post-parse |
| Layer ID sanitization (svg-stage) | **Done** — replace(/[^\w-]/g, '_') |
| innerHTML → removeChild (svg-stage) | **Done** — destroy + init |
| unsub type check, subscribeToSensor guard | **Done** |
| destroy() double-call guard | **Done** — if (_destroyed) return |
| RAF tick handlers after destroy (3-2) | **Done** — _rafLoop checks _destroyed at top and before each callback (no automated test; code guard in svg-stage.js) |
| _layers map cleared on destroy (3-14) | **Done** — destroy() sets _layers = {} to release DOM references |
| lastSensorValues.get guard | **Done** — typeof shared.lastSensorValues.get === 'function' |
| Safer shim (hub-transform) | **Done** — hub.hubTransform \|\| hub |

---

## References

- `docs/RUN-ENVIRONMENTS.md` — Edge (Chrome 51), Hub (Node 14+)
- `docs/archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md` — Prior audit
- `packages/agni-runtime/rendering/svg-stage.js` — Stage system v1.8.0
- `packages/agni-utils/yaml-safe.js` — Safe YAML load
