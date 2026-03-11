# Edge Device ES5 — Android Nougat Constraint

**Scope:** Code that runs in the student's browser/WebView on edge devices (Android 7.0 Nougat, API 24, Chrome 51).

**Single source of truth:** `docs/RUN-ENVIRONMENTS.md`.

## Constraint

Edge device code MUST be **strict ES5**. No ES6+ syntax or APIs not available in Chrome 51.

## In-scope paths

| Path | Role |
|------|------|
| `packages/agni-runtime/**/*.js` | Player, sensors, factories, telemetry |
| `packages/agni-hub/sw.js` | Service Worker |
| `packages/agni-hub/pwa/*.js` | PWA shell, precache, shared |

## Forbidden (causes parse/runtime errors on Chrome 51)

- `let`, `const` → use `var`
- Arrow functions `=>` → use `function () {}`
- Template literals `` `foo` `` → use string concatenation
- `class` keyword
- Spread/rest `...`
- `for...of`
- `async`/`await`
- Optional catch binding `catch { }` → use `catch (e) {}` or `catch (_) {}`
- Optional chaining `?.`
- Nullish coalescing `??`
- Object.assign, Array.from, .includes(), .find(), .findIndex(), Symbol, etc. (unless polyfilled in polyfills.js)

## Verification

- **CI gate:** `npm run test:es5` (`scripts/check-es5.js`) — runs in verify:core
- **Before commit:** Run `npm run test:es5` when editing any in-scope file

## When editing edge device code

1. Use `var`, not `let`/`const`
2. Use `function () {}`, not `=>`
3. Use `catch (e)` or `catch (_)`, never `catch { }`
4. Do not introduce Object.assign, .includes(), etc. unless polyfills.js covers them
