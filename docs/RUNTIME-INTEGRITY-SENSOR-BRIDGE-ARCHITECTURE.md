# Browser Runtime: Integrity & Sensor Bridge Architecture

This document describes the architecture, implementation details, and hardening of the AGNI browser runtime — the code that runs on student devices (Android 7.0 Nougat, Chrome 51 WebView, iOS 9+) in potentially untrusted or offline environments. It is the most exposed-to-untrusted-environments piece of the AGNI stack.

**Canonical code:** `packages/agni-runtime/`

---

## 1. Overview

The browser runtime consists of:

- **Lesson player** (`ui/player.js`) — step routing, init chain, UI lifecycle
- **Integrity module** (`integrity/integrity.js`) — Ed25519 verification of lesson content
- **Sensor bridge** (`sensors/sensor-bridge.js`) — DeviceMotion, DeviceOrientation, Phyphox postMessage
- **Shared runtime** (`shared-runtime.js`) — sensor pub/sub, canonicalJSON, binary helpers, HTML sanitizer
- **Factory loader** (`ui/factory-loader.js`) — on-demand script loading with SRI verification
- **Threshold evaluator** (`sensors/threshold-evaluator.js`) — sensor subscription + hardware_trigger evaluation

**ES5 constraint:** All runtime code targets Android 7.0 (Chrome 51) and must avoid `let`/`const`, arrow functions, template literals, `class`, spread. See `docs/RUN-ENVIRONMENTS.md`.

---

## 2. `verifyIntegrity()` — Implementation Details

### 2.1 Location and Entry Point

- **Module:** `packages/agni-runtime/integrity/integrity.js`
- **Registration:** Exposes `window.AGNI_INTEGRITY = { verify, lastVerifyMs }`
- **Invocation:** `player.js` calls `AGNI_INTEGRITY.verify(LESSON_DATA)` during `initPlayer()`, after `loadDependencies()` resolves and before sensors are started

```javascript
// player.js init chain
loadDependencies(lesson)
  .then(() => verifyIntegrity())
  .then(valid => { if (!valid) showIntegrityError(); else initSensors(); ... })
```

### 2.2 Signature Scope (v2.2 — narrow scope)

The signed content is:

```
contentString = canonicalJSON(LESSON_DATA) + '\x00' + OLS_INTENDED_OWNER
bindingHash   = SHA-256(contentString)
signature     = Ed25519(bindingHash)
```

- **Signed:** Lesson IR (`LESSON_DATA`) only — not the HTML wrapper, factories, or player code
- **NUL separator:** Prevents concatenation-ambiguity attacks (no boundary-shift between content and deviceId)
- **Device binding:** `OLS_INTENDED_OWNER` is the intended device pseudoId; verification compares it to session or URL identity

Signatures from v2.1 (full-script scope) will fail verification; lessons must be re-signed.

### 2.3 Crypto Provider Selection

The verifier tries **TweetNaCl first**, then **SubtleCrypto** as fallback:

1. **TweetNaCl** (`global.nacl`) — Pure JS Ed25519; works on Chrome 51 (no Ed25519 in SubtleCrypto), iOS 9–14
2. **Web Crypto SubtleCrypto** — Ed25519 via `crypto.subtle.importKey` + `verify`; used when TweetNaCl fails or is unavailable

```javascript
// integrity.js _doVerify() flow
return verifyWithTweetNaCl(lesson).then(result => {
  if (result !== false) return result;
  // Fallback to SubtleCrypto
  if (canUseSubtle) return verifyWithSubtleCrypto(lesson);
  return false;
});
```

### 2.4 SubtleCrypto Path

```javascript
// integrity.js verifyWithSubtleCrypto()
crypto.subtle.importKey('spki', pubKeyBytes, { name: 'Ed25519' }, false, ['verify'])
  .then(publicKey =>
    buildBindingHash(content, owner).then(bindingHash =>
      crypto.subtle.verify({ name: 'Ed25519' }, publicKey, sigBytes, bindingHash)
    )
  );
```

- **SPKI format:** Public key is base64 SPKI DER; `importKey('spki', ...)` — raw 32-byte import would be wrong
- **bindingHash:** SHA-256 of `contentBytes || NUL || deviceIdBytes`

### 2.5 TweetNaCl Path

```javascript
// integrity.js verifyWithTweetNaCl()
// Extract raw 32-byte key from SPKI (last 32 bytes of DER)
var rawPubKey = spkiBytes.slice(spkiBytes.length - 32);
// SHA-256 via sha256Fallback (crypto.subtle.digest or js-sha256)
sha256Fallback(combined).then(bindingHash => {
  var valid = nacl.sign.detached.verify(bindingBytes, sigBytes, rawPubKey);
  return valid;
});
```

**Important:** TweetNaCl provides SHA-512 via `nacl.hash`; the code explicitly does **not** use it. SHA-256 is obtained from `crypto.subtle.digest`, or `global.sha256` if loaded as a factory, or fails.

### 2.6 SHA-256 Fallback (ES5)

```javascript
// integrity.js sha256Fallback()
if (global.crypto?.subtle?.digest) {
  return global.crypto.subtle.digest('SHA-256', data);
}
if (global.sha256) {
  return Promise.resolve(global.sha256.arrayBuffer(data));
}
return Promise.reject(new Error('No SHA-256 implementation available'));
```

### 2.7 UTF-8 Encoding (Chrome 51 Compatibility)

`TextEncoder` may be missing. Pure-JS fallback:

```javascript
function utf8Encode(str) {
  if (typeof TextEncoder === 'function')
    return new TextEncoder().encode(str);
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xC0|(c>>6), 0x80|(c&0x3F));
    // ... surrogate pairs, BMP ...
  }
  return new Uint8Array(bytes);
}
```

### 2.8 Deferred Execution (UI Blocking Mitigation)

Verification is deferred to the next tick to avoid blocking the main thread:

```javascript
function verify(lesson) {
  return new Promise(resolve => {
    setTimeout(() => {
      var t0 = performance.now();
      _doVerify(lesson).then(result => {
        AGNI_INTEGRITY.lastVerifyMs = Math.round(performance.now() - t0);
        resolve(result);
      }).catch(() => { resolve(false); });
    }, 0);
  });
}
```

Target: <100 ms on Android 7. `lastVerifyMs` is exposed for QA.

### 2.9 P2-11 Hardening

| Check | Purpose |
|-------|---------|
| Placeholder/sentinel rejection | Rejects `{{`, `}}`, `PLACEHOLDER`, `__SIGNATURE__`, `CHANGE_ME`, `REPLACE_ME` in signature/key |
| Base64 validation | Valid format (A-Za-z0-9+/=), min length (sig ≥84, key ≥50) before decode |
| Inconsistent state | Both `OLS_SIGNATURE` and `OLS_PUBLIC_KEY` must be present or both absent |
| canonicalJSON required | No `JSON.stringify` fallback — determinism required |
| Watermark check (P2-12) | `OLS_INTENDED_OWNER` must match device identity from session API or URL |

### 2.10 Dev Mode and Trust Boundary

**Critical:** Dev mode is derived from **URL parameter** (`?dev=1`) or localhost hostname — **never** from `LESSON_DATA._devMode`. The lesson payload must not control whether its own integrity verification is skipped.

```javascript
// integrity.js isDevMode()
if (S._urlDevMode) return true;
if (loc.search.indexOf('dev=1') !== -1) return true;
if (['localhost','127.0.0.1','[::1]'].includes(loc.hostname)) return true;
return false;
```

In dev mode, unsigned lessons (both signature and key absent) pass. In production, missing or invalid signature fails.

### 2.11 Device Identity (P2-12)

- **Online:** `GET /api/session/identity` returns hub-validated `pseudoId`
- **Offline/sneakernet:** URL `?pseudoId=...` as fallback (forgeable; acceptable for offline)
- **No identity:** Passes watermark check (allows unsigned/offline lessons)

---

## 3. Sensor Subscription / Teardown Lifecycle

### 3.1 Architecture

```
┌─────────────────────┐     publishSensorReading()      ┌──────────────────────┐
│  sensor-bridge.js   │ ──────────────────────────────► │  shared-runtime.js   │
│  DeviceMotion, etc. │                                 │  sensorSubscriptions │
└─────────────────────┘                                 │  lastSensorValues    │
                                                        └──────────┬───────────┘
                                                                   │ subscribeToSensor()
                                                                   │ unsubscribe / clear
                                                                   ▼
┌─────────────────────┐     watch() / bindSensor()      ┌──────────────────────┐
│ threshold-evaluator │ ◄────────────────────────────── │  step-renderers      │
│ svg-stage           │                                 │  hardware_trigger    │
└─────────────────────┘                                 └──────────────────────┘
```

### 3.2 Subscription API (shared-runtime.js)

Three unsubscribe paths:

| Path | API | Use case |
|------|-----|----------|
| **A** | `unsub = subscribeToSensor(id, fn); unsub();` | Preferred; store and call the returned closure |
| **B** | `unsubscribeFromSensor(id, fn)` | Callers that store `{sensorId, fn}` pairs |
| **C** | `clearSensorSubscriptions()` or `clearSensorSubscriptions(id)` | Bulk clear on step transition |

```javascript
// shared-runtime.js
var sensorSubscriptions = new Map();  // sensorId -> Set<callback>
var lastSensorValues = new Map();

function subscribeToSensor(sensorId, callback) {
  if (!sensorSubscriptions.has(sensorId))
    sensorSubscriptions.set(sensorId, new Set());
  sensorSubscriptions.get(sensorId).add(callback);
  return function unsubscribe() {
    var subs = sensorSubscriptions.get(sensorId);
    if (subs) subs.delete(callback);
  };
}

function publishSensorReading(reading) {
  lastSensorValues.set(reading.sensorId, reading.value);
  var subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) subs.forEach(cb => { try { cb(reading); } catch (e) { ... } });
}
```

### 3.3 Step Transition Teardown

On every `routeStep()` → `renderStep()`:

1. **`S.destroyStepVisual()`** — Destroys current stage (if any)
2. **`S.currentStageHandle?.stage?.destroy()`** — SVG stage cleanup
3. **`S.clearSensorSubscriptions()`** — Clears all sensor subscriptions
4. **`speechSynthesis.cancel()`** — Stops narration
5. **`clearStepHintTimer()`** — Clears adaptive hint timeouts

```javascript
// player.js renderStep()
if (S.destroyStepVisual)        S.destroyStepVisual();
if (S.currentStageHandle?.stage) S.currentStageHandle.stage.destroy();
if (S.clearSensorSubscriptions) S.clearSensorSubscriptions();
```

### 3.4 SVG Stage Destroy (svg-stage.js)

Stage holds `_sensorUnsubs` — the unsubscribe closures from `subscribeToSensor`. On `destroy()`:

```javascript
_sensorUnsubs.forEach(unsub => {
  if (typeof unsub === 'function') try { unsub(); } catch (e) { /* ignore */ }
});
_sensorUnsubs = [];
_stopLoop();  // cancel RAF
_layers = {};
// clear SVG DOM
```

### 3.5 Threshold Evaluator `watch()` Lifecycle

`thresholdEvaluator.watch(thresholdStr, primarySensor, onMet, opts)` returns a `cancel` function:

```javascript
var unsub = S.subscribeToSensor(primarySensor, fn);
var _triggerCancel = S.thresholdEvaluator.watch(...);

// On threshold met: unsub(), _triggerCancel() called internally
// On step transition: clearSensorSubscriptions() removes callback;
//   cancel() should be called to clear timeout (via registerStepCleanup if available)
```

**Note:** `registerStepCleanup` is declared in `index.d.ts` but may not be wired in all code paths. The primary teardown is `clearSensorSubscriptions()`, which removes callbacks. Any pending `setTimeout` from `watch()`’s `timeoutMs`/`onTimeout` is cleared when `cancel()` runs; if `registerStepCleanup` is absent, that timeout may fire once after navigation (minor leak).

### 3.6 Sensor Bridge Start / Stop

**Start:** `sensorBridge.start()` — idempotent; attaches `devicemotion` and optionally `deviceorientation` listeners, starts throttle timer.

**Stop:** `sensorBridge.stop()` — `clearInterval(_motionThrottleTimer)`, `removeEventListener` for both, clears buffer.

The bridge is **not** stopped on step transition; it runs for the whole lesson. Only **subscriptions** (who receives readings) are cleared. This avoids permission re-prompts and listener churn.

### 3.7 Throttling (Chrome 51 Event-Loop Fix)

- **Problem:** DeviceMotion can fire 60–120 Hz; pure JS processing blocks the UI.
- **Solution:** Buffer readings, flush at 100 ms intervals (`MOTION_THROTTLE_MS`).
- **Effect:** Publish rate ≤10 Hz; CI asserts this in `architectural-remediation-verification.test.js`.

---

## 4. Factory Loading + SRI Verification Flow

### 4.1 Load Order

The factory-loader enforces a three-phase strategy:

| Phase | Files | Rationale |
|-------|-------|-----------|
| 1 | `polyfills.js` | ES5 shims before any runtime |
| 2 | `shared-runtime.js`, `binary-utils.js` | No cross-deps; `AGNI_SHARED` must exist |
| 3 | `integrity.js`, `sensor-bridge.js`, `svg-stage.js`, etc. | Depend on AGNI_SHARED / AGNI_SVG |

Phase 3 loads in parallel (`Promise.all`). Each factory executes synchronously on append; dependencies are satisfied because phase 2 completes first.

### 4.2 Source of Factory List

- **Build time:** `html.js` / `hub-transform` builds `ir.requires.factories` from:
  - Core: `polyfills`, `binary-utils`, `shared-runtime`, `integrity`
  - Feature-inferred: `sensor-bridge`, `svg-factories`, etc. (from `getOrderedFactoryFiles`)
- **Runtime:** `AGNI_LOADER.loadDependencies(LESSON_DATA)` uses `lessonData.requires.factories`

### 4.3 Fetch + Cache Flow

```
loadOne(dep)
  → readFromCache(url)           // Cache API, keyed by versioned URL
  → if miss: fetchFromHub(url)   // timeout: LOAD_TIMEOUT (default 8s)
  → writeToCache(url, text)      // fire-and-forget
  → verifyAndExecute(text)
```

- **Versioned URLs:** `?v=<RUNTIME_VERSION>` for cache busting
- **Deduplication:** `_pending[key]` prevents duplicate in-flight fetches

### 4.4 SRI Verification

**Format:** `sha384-<base64>`

**When:** Before `executeScript(text, url)` for every factory that has an `integrity` field.

```javascript
// factory-loader.js verifySRI()
if (!integrity || typeof integrity !== 'string') return Promise.resolve(true);
var match = /^sha384-(.+)$/i.exec(integrity);
var data = utf8Encode(text);
return crypto.subtle.digest('SHA-384', data).then(hashBuffer => {
  var actualB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  return actualB64 === expectedB64;
});
```

**Fallback:** If `crypto.subtle` is unavailable (e.g. non-HTTPS Pi), SRI is skipped (returns `true`) and a warning is logged. MitM on factory fetch is still mitigated when the lesson is served over HTTPS from the hub.

**Source of integrity hashes:** Injected at compile time by `html.js` via `computeSRI(fs.readFileSync(srcPath))` into each `dep.integrity`. These hashes are part of `LESSON_DATA`, which is signed — so the integrity hashes are covered by the lesson signature.

### 4.5 Hub-Signed Manifest (Optional)

When `OLS_PUBLIC_KEY` is present, the loader may fetch `/factories/manifest.json` and verify its signature before using manifest integrity values. If verification fails or no manifest, it falls back to per-dep `integrity` from the lesson. See `fetchAndVerifyManifest`, `verifyManifestSignature` in factory-loader.js.

### 4.6 Script Execution (CSP-Safe)

Replaces `new Function(text)` with dynamic `<script>` injection:

```javascript
var script = document.createElement('script');
script.dataset.loaderSrc = url;
script.textContent = text;
if (AGNI_CSP_NONCE) script.setAttribute('nonce', AGNI_CSP_NONCE);
document.head.appendChild(script);
document.head.removeChild(script);
```

- **CSP:** No `unsafe-eval`; `script-src 'self' 'nonce-<...>'` allows same-origin scripts and nonce.
- **Debugging:** `data-loader-src` appears in DevTools Sources.
- **Errors:** Stored in `AGNI_LOADER.lastError` for surfacing.

---

## 5. Additional Hardening

### 5.1 HTML Sanitizer (R10 P1.2)

`shared-runtime.js` provides `setSafeHtml(element, html)` which:

- Strips `<script>` tags
- Removes `on*` attributes
- Removes `javascript:` URIs
- Decodes numeric entities (with allowlist for `&`, `<`, `>`, quotes)

Used before assigning `innerHTML` for lesson content. Compile-time sanitization (rehype-sanitize) is primary; this is a runtime backstop.

### 5.2 Phyphox postMessage Origin Allowlist (R10 P1.3)

`sensor-bridge.js` validates `event.origin` before processing Phyphox messages:

```javascript
function _isAllowedOrigin(origin) {
  if (origin === location.origin) return true;
  if (origin === 'null') return true;  // file:// sandboxed iframe
  if (lesson.phyphoxOrigins) {
    for (var i = 0; i < lesson.phyphoxOrigins.length; i++)
      if (origin === lesson.phyphoxOrigins[i]) return true;
  }
  return false;
}
```

`phyphoxOrigins` comes from lesson data (compiled in). Only listed origins can inject sensor data via postMessage.

### 5.3 Canonical JSON Contract

`canonicalJSON` in `shared-runtime.js` must match `@agni/utils/crypto` `canonicalJSON` for verification to succeed. Both sort object keys recursively. A cross-impl test exists (P2-11).

### 5.4 Binary Helpers

- **base64ToBytes:** From `OLS_BINARY` (binary-utils.js) when loaded, else inline in shared-runtime
- **concatBytes:** Same; concatenates Uint8Arrays for binding hash construction

### 5.5 Lesson Data Isolation

Lesson content does not control:

- Dev mode (URL only)
- Integrity verification bypass
- Module load order

---

## 6. Threat Model Summary

| Threat | Mitigation |
|--------|------------|
| Tampered lesson content | Ed25519 verify; P2-11 placeholder/base64 checks |
| Copied lesson to other device | OLS_INTENDED_OWNER watermark vs session/URL |
| Malicious factory injection | SRI per factory; hashes in signed lesson |
| MitM on factory fetch | SRI; HTTPS when available |
| XSS via lesson HTML | setSafeHtml; rehype-sanitize at compile |
| Phyphox message spoofing | Origin allowlist |
| Sensor event-loop exhaustion | 100 ms throttle; publish ≤10 Hz |
| UI freeze during verify | setTimeout(0) defer; narrow scope (v2.2) |

---

## 7. File Reference

| File | Role |
|------|------|
| `integrity/integrity.js` | verifyIntegrity, TweetNaCl/SubtleCrypto, P2-11 checks |
| `integrity/binary-utils.js` | base64ToBytes, concatBytes |
| `shared-runtime.js` | sensor pub/sub, canonicalJSON, base64ToBytes, setSafeHtml |
| `sensors/sensor-bridge.js` | DeviceMotion, orientation, Phyphox, simulation |
| `sensors/threshold-evaluator.js` | watch(), compile(), duration/steady/freefall |
| `ui/factory-loader.js` | loadDependencies, verifySRI, executeScript |
| `ui/player.js` | init chain, verifyIntegrity call, routeStep, renderStep teardown |
| `rendering/svg-stage.js` | bindSensor, destroy (unsub closures) |
| `ui/step-renderers.js` | hardware_trigger, registerStepCleanup usage |
| `@agni/utils/crypto.js` | signContent, computeSRI, canonicalJSON (Node) |
| `packages/ols-compiler/builders/html.js` | Factory list, SRI injection, lesson assembly |
| `packages/agni-utils/runtimeManifest.js` | FACTORY_LOAD_ORDER, resolveFactoryPath |

---

## 8. Related Documentation

- **Architecture:** `docs/ARCHITECTURE.md` §5 (integrity), §6 (security)
- **Run environments:** `docs/RUN-ENVIRONMENTS.md` (ES5, Chrome 51)
- **Village security:** `docs/playbooks/village-security.md`
- **Architectural remediation:** `docs/archive/ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md`
