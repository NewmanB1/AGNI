# How to modify the Portal

Use this when changing the teacher/admin UI that talks to the hub API. The portal is **vanilla HTML/CSS/JS** (no build step) and runs in the browser.

## Entry points

- **Portal root:** `portal/` — static files served by the hub or a static server
- **API client:** `portal/js/api.js` — all HTTP calls to the hub; must stay in sync with `docs/api-contract.md`
- **Pages:** `portal/*.html` — each page loads scripts and calls `api.js` for data

## Where to change what

| Goal | Location |
|------|----------|
| Add or change an API call | `portal/js/api.js` — add a function that calls the hub; document the endpoint in `docs/api-contract.md` if new |
| Change UI for a page | Edit the corresponding `portal/*.html` and any inline or linked CSS/JS |
| Add a new page | Add a new HTML file under `portal/`, link from nav or existing pages, use `api.js` for data |
| Change auth (login, session) | `portal/js/api.js` and the auth flow; hub routes in `packages/agni-hub/routes/accounts.js` |

## Conventions

- **No build:** The portal does not use a bundler or transpiler; keep JS and CSS compatible with the browsers used by teachers/admins.
- **API contract sync:** Any new or changed hub endpoint used by the portal must be documented in `docs/api-contract.md` and reflected in `portal/js/api.js`. CI runs `verify:api-contract-routes` and `verify:api-contract-auth`.
- **Hub as backend:** The portal never requires compiler/engine/services directly; it uses the HTTP API only.

## Verification

- After changing hub routes or responses, run `npm run verify:api-contract-routes` and `npm run verify:api-contract-auth`.
- Manually test portal flows (login, author, governance) against a running hub when changing API or UI.
