# AGNI Portal

SvelteKit web application for teachers, administrators, and governance authorities to manage Village Hub operations.

## Pages

| Route | Purpose |
|-------|---------|
| `/hub` | Teacher hub — lesson management, student overview |
| `/students` | Student roster, progress tracking |
| `/groups` | Student group management and lesson assignment |
| `/governance` | Governance authority tools — policy, catalog |
| `/learn` | Student-facing lesson view |
| `/settings` | Hub configuration |
| `/admin/accounts` | Creator account management |
| `/admin/hub` | Hub status and diagnostics |
| `/admin/sync` | Federation sync controls |
| `/admin/flags` | Feature flag management |
| `/admin/deploy` | Deployment tools |
| `/admin/onboarding` | First-run setup wizard |

## Development

```bash
# From the repo root — start the hub first
node hub-tools/theta.js

# In a separate terminal — start the portal dev server
cd portal
VITE_HUB_URL=http://localhost:8082 npm run dev
```

With `VITE_HUB_URL` set, the portal uses real hub APIs (theta, LMS, governance, authoring) instead of mock data. Without it, the portal runs in standalone mode.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (port 5173) |
| `npm run build` | Production build (static adapter) |
| `npm run preview` | Preview production build |
| `npm run check` | TypeScript + Svelte type checking |
| `npm run lint` | ESLint (zero warnings policy) |
| `npm run test` | Run Vitest unit tests |

## Tech Stack

- **SvelteKit** with static adapter (no server-side rendering — the hub is the server)
- **TypeScript** throughout
- **Vite** for bundling
- API client in `src/lib/api.ts` — all hub communication goes through `authGet()` / `authPost()`

## References

- **Hub API contract:** `docs/api-contract.md`
- **Architecture:** `docs/ARCHITECTURE.md`
