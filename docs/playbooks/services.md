# How to modify the Services layer

Use this when adding or changing the top-down API used by the hub, CLI, or other consumers. The services layer (`packages/agni-services/`) is the **canonical API** for accounts, author, governance, LMS, lesson assembly, and lesson chain.

## Entry points

- **Package:** `packages/agni-services/` — all service modules
- **Index:** `packages/agni-services/index.js` — exports public API; add new exports here so callers use the index, not deep paths
- **Hub wiring:** `packages/agni-hub/context/services.js` — binds service instances into `ctx` for route handlers

## Where to change what

| Goal | Location |
|------|----------|
| Add a new service module | Create a file in `packages/agni-services/` (e.g. `my-service.js`), export from `index.js`, wire in `context/services.js` if the hub needs it |
| Change accounts (login, students, creators) | `packages/agni-services/accounts.js` |
| Change author (load/save/validate lessons) | `packages/agni-services/author.js` |
| Change governance (policy, catalog, compliance) | `packages/agni-services/governance.js` |
| Change LMS (bandit, observations) | `packages/agni-services/lms.js` — delegates to `@agni/engine` |
| Change lesson assembly (compile on demand) | `packages/agni-services/lesson-assembly.js` |
| Change lesson chain / content hash | `packages/agni-services/lesson-chain.js` |

## Conventions

- **Error return:** Service functions called by route handlers must return `{ error: string }` on failure and `{ data... }` (or similar) on success. Callers check `.error`; no try/catch in the request path. See `docs/CONVENTIONS.md` § Error return conventions.
- **No direct I/O in route handlers:** Business logic and I/O live in services; route handlers only call services and send responses.
- **Export from index:** New public functions must be exported from `packages/agni-services/index.js` so they are discoverable and `verify:canonical-imports` is satisfied.

## Verification

- `npm run verify:services-docs` — service modules must have header/docs
- `npm run verify:services-lint` — ESLint on `packages/agni-services/`
- `npm run verify:services-no-scripts` — no script dependencies in package.json for services
