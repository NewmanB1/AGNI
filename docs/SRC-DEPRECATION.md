# src/ Directory — Deprecation Complete

**Status:** The `src/` directory has been fully migrated to `packages/`. It is deprecated and no longer used.

## Migration Summary

| Former location | Current location |
|-----------------|------------------|
| `src/compiler/` | `packages/ols-compiler/` |
| `src/builders/` | `packages/ols-compiler/builders/` |
| `src/utils/` | `packages/agni-utils/` |
| `src/engine/` | `packages/agni-engine/` |
| `src/runtime/` | `packages/agni-runtime/` |
| `src/services/` | `packages/agni-services/` |
| `src/governance/` | `packages/agni-governance/` |
| `src/types/` | `packages/types/` |

## What Changed

- **CI paths:** `src/**` removed from `.github/workflows/validate.yml` and `.github/workflows/build.yml` path triggers.
- **Format check:** `src/**/*.{js,ts}` removed from Prettier scope in CI.
- **Knip:** `src/**/*.{js,ts}` removed from `knip.json` project scope.
- **Imports:** `verify:canonical-imports` fails if tests or scripts require from `src/`. Use `@agni/*` or `@ols/*` instead.

## For Maintainers

- **AGENTS.md** — canonical ownership lives in `packages/`; no `src/` re-exports.
- **CODEBASE_INDEX.md** — all paths point to `packages/`.
- **Archive docs** — `docs/archive/` may still reference `src/` for historical context; those documents describe past state.

## If You See src/ References

- In **active docs** (AGENTS.md, ARCHITECTURE.md, CODEBASE_INDEX.md, playbooks): update to `packages/` paths.
- In **archive docs**: leave as-is for historical accuracy, or add a note that the migration is complete.
