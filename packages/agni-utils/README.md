# @agni/utils

Shared Node.js utilities used across all AGNI packages. This is the **leaf** of the dependency tree — it depends on nothing else in the monorepo.

## What's here

| Module | Purpose |
|--------|---------|
| `logger` | Structured console logging with `createLogger(tag)` |
| `env-config` | Environment variable loader (`DATA_DIR`, `PORT`, etc.) |
| `hub-config` | Hub-specific config loader (reads `hub-config.json`) |
| `json-store` | Atomic JSON file read/write with locking |
| `file-lock` | Advisory file locking for concurrent access |
| `feature-flags` | Runtime feature flag system |
| `crypto` | Content hashing and verification |
| `csp` | Content Security Policy header generation |
| `io` | File I/O helpers (safe read/write) |
| `binary` | Binary buffer utilities |
| `http-helpers` | HTTP request parsing, CORS, rate-limit wiring |
| `rate-limiter` | Token-bucket rate limiter |
| `router` | Minimal URL router for the hub |
| `streak` | Student streak tracking helpers |
| `archetype-match` | Cohort archetype matching for theta |
| `runtimeManifest` | Lists all browser runtime files for bundling |
| `katex-css-builder` | KaTeX CSS extraction for offline math rendering |

## Usage

```js
// Individual module (preferred)
const { createLogger } = require('@agni/utils/logger');

// Barrel import
const utils = require('@agni/utils');
const log = utils.logger.createLogger('my-module');
```

## Contributing

These utilities should remain **pure Node.js** with no dependencies on other AGNI packages. If a utility needs engine, compiler, or hub functionality, it belongs in a different package.
