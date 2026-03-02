# @agni/hub

The AGNI Village Hub — the edge server that runs on a Raspberry Pi or local machine, serving lessons to students over a local network.

This is the **top of the dependency tree**: it depends on all other packages and wires them together into an HTTP server.

## What's here

### Core Services
| Module | Purpose |
|--------|---------|
| `theta` | Adaptive lesson ordering: skill graph BFS + Marginal Learning Cost (MLC) |
| `sentry` | Telemetry aggregation: event buffering, statistical analysis, graph weight computation |
| `sync` | Hub-to-hub federation sync |
| `hub-transform` | On-demand YAML → HTML compilation for lesson serving |

### Account & Content Management
| Module | Purpose |
|--------|---------|
| `accounts` | Student/creator account management with scrypt passwords |
| `author` | Lesson authoring pipeline: compile, validate, publish |
| `lesson-chain` | Content hash chain for integrity verification and fork tracking |
| `lesson-assembly` | Assembles runtime files into lesson bundles |

### HTTP Routes (`hub-tools/routes/`)
| Route | Endpoints |
|-------|-----------|
| `theta` | `GET /api/theta` — next lesson recommendations |
| `lms` | `POST /api/lms/observe`, `GET /api/lms/state` — learning engine |
| `governance` | `GET /api/governance/compliance`, `POST /api/governance/policy` |
| `accounts` | `POST /api/accounts/register`, `POST /api/accounts/login` |
| `student` | `GET /api/student/progress`, `GET /api/student/streaks` |
| `parent` | `GET /api/parent/children`, `GET /api/parent/progress` |
| `author` | `POST /api/author/compile`, `POST /api/author/publish` |
| `telemetry` | `POST /api/telemetry/events` |
| `admin` | `GET /api/admin/status`, `POST /api/admin/config` |

### PWA Shell (`server/pwa/`)
| File | Purpose |
|------|---------|
| `shell.html` | PWA app shell with offline support |
| `shared.js` | Shared constants for PWA |
| `shell-boot.js` | Bootstrap script for initial load |
| `sw.js` | Service worker for caching and offline access |

## Dependencies

- `@agni/utils` — shared utilities
- `@agni/engine` — learning engine (via LMS service)
- `@agni/governance` — policy evaluation
- `@ols/schema` — lesson validation
- `@ols/compiler` — lesson compilation

## Contributing

When adding a new API endpoint, create a route file in `hub-tools/routes/` and register it in `hub-tools/theta.js` (the main server entry point). Keep business logic in the appropriate package (engine, governance, compiler) and use routes only for HTTP wiring.
