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

### HTTP Routes (`packages/agni-hub/routes/`)
| Route | Endpoints |
|-------|-----------|
| `theta` | `GET /api/theta` — next lesson recommendations |
| `lms` | `POST /api/lms/observation`, `GET /api/lms/status` — learning engine |
| `governance` | `GET /api/governance/report`, `GET /api/governance/policy`, `POST /api/governance/compliance` |
| `accounts` | `POST /api/auth/register`, `POST /api/auth/login` |
| `student` | `GET /api/student/streaks`, `POST /api/checkpoint`, `GET /api/diagnostic` |
| `parent` | `GET /api/parent/children`, `GET /api/parent/child/:pseudoId/progress` |
| `author` | `POST /api/author/validate`, `POST /api/author/save`, `POST /api/author/preview`, `DELETE /api/author/delete/:slug` |
| `telemetry` | `POST /api/telemetry` |
| `chain` | `GET /api/chain/:slug`, `POST /api/chain/verify`, `GET /api/fork-check` |
| `admin` | `GET /api/admin/config`, `PUT /api/admin/config`, `POST /api/admin/sync-test` |

### PWA Shell (`packages/agni-hub/pwa/`)
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

When adding a new API endpoint, create a route file in `packages/agni-hub/routes/` and register it in `packages/agni-hub/theta.js` (the main server entry point). Keep business logic in the appropriate package (engine, governance, compiler) and use routes only for HTTP wiring.
