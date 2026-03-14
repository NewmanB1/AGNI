# Guide: Open Source Developers

How to understand the codebase, set up a dev environment, and contribute to AGNI.

---

## What is AGNI?

AGNI is a compiler and runtime for the **Open Lesson Standard (OLS)** — a file format for offline, sensor-rich education. It turns YAML lesson files into single-file HTML bundles that run on 10-year-old Android phones with no internet.

The system has three main parts:

1. **Compiler** (`packages/ols-compiler/`) — YAML → IR → HTML/JSON pipeline. Use `@ols/compiler`.
2. **Village Hub** (`packages/agni-hub/`, `hub-tools/` wrappers, `server/`) — Node.js server that compiles and serves lessons, runs the adaptive ordering engine (theta), and collects telemetry. Canonical code in `@agni/hub`.
3. **Portal** (`portal/`) — Vanilla HTML/CSS/JS web app for teachers, administrators, and governance

---

## Dev environment setup

For a minimal setup (init data, start hub, run tests), see **[docs/DEV-START.md](../DEV-START.md)**.

```bash
git clone https://github.com/NewmanB1/AGNI.git
cd AGNI
npm ci

# Run all tests (722 tests across 186 suites)
npm test

# Compile a lesson
npm run build

# Validate all lessons against the OLS schema
npm run validate

# Run verification scripts (dead files, ES5 check, factory order)
npm run verify:all
```

### Running the hub locally

```bash
# Terminal 1: start the hub
node hub-tools/theta.js

# Terminal 2: serve the portal (use ?hub=http://localhost:8082 or set Hub URL in Settings)
npx serve portal -l 3000
```

---

## Architecture overview

Read **[docs/ARCHITECTURE.md](../ARCHITECTURE.md)** for the full picture. Here's the short version:

```
YAML lesson ──► Compiler (@ols/compiler) ──► IR ──► HTML bundle
                                                        │
                                              served by hub-transform
                                                        │
Student phone ◄─── WiFi ◄─── Village Hub (Raspberry Pi)
                                   │
                              theta.js (adaptive ordering)
                              sentry.js (telemetry → graph weights)
                              routes/ (REST API)
```

### Key directories

**Canonical code lives in `packages/`.** See `AGENTS.md` for the full layout.

| Directory | What's in it |
|-----------|-------------|
| `packages/ols-compiler/` | YAML → IR → HTML/native. Builders: `html.js`, `native.js`, `yaml-packet.js`. Use `@ols/compiler`. |
| `packages/agni-engine/` | LMS engine: `rasch.js`, `thompson.js`, `embeddings.js`, `pagerank.js`, `math.js`, `sm2.js`. Use `@agni/engine`. |
| `packages/agni-runtime/` | Browser-side: player, sensors, SVG factories, telemetry. **Must be ES5** (Chrome 51). Use `@agni/runtime`. |
| `packages/agni-services/` | Accounts, lesson assembly, governance, LMS. Use `@agni/services`. |
| `packages/agni-utils/` | Logger, env config, crypto, I/O, yaml-safe. Use `@agni/utils`. |
| `packages/agni-hub/` | Hub: `theta.js`, `sentry.js`, `routes/`, `context/`, hub-transform, PWA. Use `@agni/hub`. |
| `hub-tools/` | CLI wrappers that delegate to packages (e.g. `node hub-tools/theta.js`) |
| `server/` | Shim: `hub-transform.js` re-exports from `@agni/hub` |
| `portal/` | Vanilla HTML/CSS/JS teacher/admin portal |
| `schemas/` | JSON Schema definitions for OLS, graph weights, governance |
| `tests/` | Unit and integration tests |
| `scripts/` | CI verification scripts |

---

## Critical constraint: ES5 in the runtime

Everything under `packages/agni-runtime/` runs in the browser on Chrome 51 (Android 7.0+). This means **strict ES5 only**:

- No `let`/`const` — use `var`
- No arrow functions — use `function () {}`
- No template literals, destructuring, spread, `class`, `Promise` (use polyfill)
- No `for...of`, `Map`, `Set`, `Symbol`

The CI runs `scripts/check-es5.js` to enforce this. If you add or modify a runtime file, run:

```bash
node scripts/check-es5.js
```

Server-side code (`hub-tools/`, `packages/agni-hub/`, `packages/agni-services/`, `packages/agni-engine/`) runs in Node 14+ and can use modern syntax.

---

## How to find your way around

### Playbooks (subsystem guides)

Each major subsystem has a playbook that explains how it works and where to make changes:

| Playbook | Subsystem |
|----------|-----------|
| [compiler.md](../playbooks/compiler.md) | YAML → IR → HTML pipeline |
| [runtime.md](../playbooks/runtime.md) | Browser-side player, sensors, SVG |
| [lms.md](../playbooks/lms.md) | Adaptive engine: Rasch, Thompson, embeddings |
| [sentry.md](../playbooks/sentry.md) | Telemetry → graph weights → theta |
| [governance.md](../playbooks/governance.md) | Policy, compliance, catalog |
| [federation.md](../playbooks/federation.md) | Hub-to-hub sync, sneakernet |
| [village-security.md](../playbooks/village-security.md) | Village deployment hardening, hub/edge security |
| [typing-and-languages.md](../playbooks/typing-and-languages.md) | TypeScript vs JavaScript, type definitions |

### Concepts glossary

See **[docs/ONBOARDING-CONCEPTS.md](../ONBOARDING-CONCEPTS.md)** for a short glossary of key terms: OLS, theta, Rasch, Thompson sampling, skill graph, village hub.

---

## Testing

```bash
# Run all tests
npm test

# Run a specific test file
node --test tests/unit/regressions.test.js

# Run verification scripts
node scripts/check-es5.js         # ES5 compliance
node scripts/check-dead-files.js  # No orphaned source files
node scripts/check-factory-order.js  # Factory loading order
```

Tests use Node.js built-in `node:test` and `node:assert/strict`. No test framework dependency.

The regression test file (`tests/unit/regressions.test.js`) is particularly important — it encodes security invariants and bug fixes as permanent assertions. If you're fixing a bug, add a regression test.

---

## Contribution workflow

1. **Fork** the repo and create a branch from `main`.
2. **Read the relevant playbook** for the subsystem you're modifying.
3. **Make your changes.** Follow the conventions in **[docs/CONVENTIONS.md](../CONVENTIONS.md)**.
4. **Run tests and verification:**
   ```bash
   npm test
   node scripts/check-es5.js      # if you touched packages/agni-runtime/
   node scripts/check-dead-files.js
   ```
5. **Commit** with a descriptive message (see CONTRIBUTING.md for prefix conventions).
6. **Open a PR** against `main`.

### What makes a good PR

- Focused: one logical change per PR
- Tested: new behavior has tests, regressions have regression tests
- ES5-safe: if you touched `packages/agni-runtime/`, the ES5 check passes
- Documented: if you added an API endpoint or changed behavior, update `docs/api-contract.md`

---

## Coding conventions

See **[docs/CONVENTIONS.md](../CONVENTIONS.md)** for the full list. Highlights:

- **File locking**: any code that does load → mutate → save on a JSON file in `data/` must use `withLock()` from `@agni/utils/file-lock`.
- **Input validation**: all user-supplied values (URL params, query strings, JSON bodies) must be validated at the route handler level before passing to service functions.
- **Logging**: use `createLogger('component-name')` from `@agni/utils/logger`. No raw `console.log` in production code.
- **Config**: all environment variables go through `@agni/utils/env-config`. Don't parse `process.env` inline.
- **Auth**: mutating endpoints require `adminOnly` or `requireHubKey`. Read endpoints that expose student data require at least `requireHubKey`.

---

## What to read next

1. **[ONBOARDING-CONCEPTS.md](../ONBOARDING-CONCEPTS.md)** — glossary of key terms
2. **[ARCHITECTURE.md](../ARCHITECTURE.md)** — full system architecture
3. **[CONVENTIONS.md](../CONVENTIONS.md)** — coding rules
4. **The playbook** for whichever subsystem you want to work on
5. **[CONTRIBUTING.md](../../CONTRIBUTING.md)** — PR process and commit conventions
