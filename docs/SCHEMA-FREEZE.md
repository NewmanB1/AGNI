# OLS Schema Freeze for v1.0

**Effective:** v1.0 release  
**Status:** Frozen

---

## Decision

The OLS (Open Lesson Standard) schema is **frozen** for v1.0. This means:

1. **No breaking changes** to lesson YAML, IR, sidecar, graph-weights, or governance schemas.
2. **Additive changes only** — new optional fields, new step types, extended enums are permitted.
3. **Required fields and top-level structure** are stable and will not change until v2.0.

---

## Frozen Artifacts

| Artifact | Version | Location |
|----------|---------|----------|
| OLS lesson schema | 1.8.0 | `schemas/ols.schema.json` |
| Lesson IR schema | — | `schemas/lesson-ir.schema.json` |
| Lesson sidecar schema | — | `schemas/lesson-sidecar.schema.json` |
| Graph weights schema | 1.7.0 | `schemas/graph-weights.schema.json` |
| Governance policy schema | — | `schemas/governance-policy.schema.json` |

---

## Policy

- **Breaking changes** require a major version bump (1.x → 2.0) and migration guidance.
- **Additive changes** follow `docs/BREAKING-VS-ADDITIVE.md` — optional fields, new step types with graceful runtime handling.

See `docs/specs/ols-v1.0-spec.md` for the full v1.0 spec.
