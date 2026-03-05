# How to modify the Hub

Use this when adding routes, changing auth, or wiring hub services.

## Entry points

- **Server:** `packages/agni-hub/theta.js` (canonical) or `node hub-tools/theta.js` (CLI wrapper) — main HTTP server
- **Shared context:** `packages/agni-hub/shared.js` — assembles `ctx` passed to route modules (auth, services, data paths)
- **Auth:** `packages/agni-hub/context/auth.js` — `requireHubKey`, `authOnly`, `adminOnly`, `roleOnly`
- **Routes:** `packages/agni-hub/routes/*.js` — each file registers routes with the router

## Where to change what

| Goal | Files to touch |
|------|----------------|
| Add a new API endpoint | Create or edit a file in `packages/agni-hub/routes/`. Register in `packages/agni-hub/theta.js` (routes are auto-loaded). |
| Add auth to a route | Wrap the handler with `requireHubKey`, `authOnly`, or `adminOnly` from `ctx`. See auth rules below. |
| Change auth middleware | `packages/agni-hub/context/auth.js` |
| Change service layer | Business logic: `@agni/services` (canonical). `src/services/` are shims. Wiring: `packages/agni-hub/context/services.js` — binds services into `ctx` for routes. |
| Change data paths | `packages/agni-hub/context/data-paths.js` |
| Change HTTP helpers | `packages/agni-hub/context/http.js` |

## Auth rules

| Auth | Middleware | Use for |
|------|------------|---------|
| None | — | Public: `/health`, `/api/admin/onboarding-status`, `/api/auth/register`, `/api/auth/login`, `/api/accounts/student/claim`, `/api/accounts/student/verify-pin` |
| HubKey | `requireHubKey(handler)` | Student/device endpoints: theta, telemetry, checkpoint, LMS, chain, fork-check. Requires `X-Hub-Key` header. |
| Bearer | `authOnly(handler)` | Creator session: author load/validate/save/preview, governance read, auth/me, auth/logout |
| Admin | `adminOnly(handler)` | Admin-only: config, sync-test, theta/override, accounts, groups, governance write, learning-paths CRUD |

**Important:** When `AGNI_HUB_API_KEY` is not set, `requireHubKey` returns 503. Set the key in `.env` or deployment config. See `docs/DEPLOYMENT.md`.

## Do not

- Add `router.post` or `router.put` or `router.delete` without wrapping in auth middleware (except allowlisted paths). CI runs `npm run verify:unauthed-routes`.
- Put business logic in route handlers; keep it in services or packages.
- Change `docs/api-contract.md` Auth column without updating routes (or vice versa). CI runs `npm run verify:api-contract-auth`.

## Regression guards

- `npm run verify:unauthed-routes` — fails if any mutating route lacks auth
- `npm run verify:api-contract-auth` — fails if api-contract Auth column differs from route middleware
- `tests/unit/hub-auth-regression.test.js` — proves chain routes reject unauthenticated requests
