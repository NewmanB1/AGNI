# Environment Validation: env-config vs env-validate

This document describes the split between `@agni/utils/env-config` and `@agni/utils/env-validate`, and any remaining discrepancies. See `docs/CONFIGURATION.md` for the main configuration reference.

---

## Summary

| Module | Role | When used |
|--------|------|-----------|
| **env-config.js** | Canonical reader; parses and validates at require time; **throws** on invalid values | All modules that need config values |
| **env-validate.js** | Pre-load step for hub processes; **warns and clamps** invalid values, mutates `process.env` | theta, sentry, sync (called *before* requiring env-config) |

**Flow for hub processes:** `loadHubConfig()` → `validateEnv()` → `require('env-config')`. The first two populate and sanitize `process.env`; env-config reads and enforces final bounds.

---

## Discrepancies (Remaining Splits)

These variables have different ranges or behavior between the two modules. When both run, the **stricter** effectively wins.

### 1. AGNI_EMBEDDING_DIM

| Module | Range | Behavior |
|--------|-------|----------|
| env-config | 1–1024 | `validRange(intVal(...), 1, 1024)` — throws if outside |
| env-validate | 4–256 | Clamps to [4, 256]; warns if outside |

**Effect when both run:** A value of 512 is clamped to 256 by env-validate; env-config then reads 256 and passes. Effective range becomes **4–256** for hub processes. Non-hub processes that only load env-config can use 1–1024.

**Fix options:** (a) Align env-validate to 1–1024 to match env-config; or (b) Document that hub processes use 4–256 as the effective limit and update env-config’s docstring accordingly.

### 2. Ports (AGNI_THETA_PORT, AGNI_SERVE_PORT, AGNI_SENTRY_PORT)

| Module | Range | Behavior |
|--------|-------|----------|
| env-config | 1–65535 | `validPort()` — throws if &lt; 1 or &gt; 65535 |
| env-validate | 0–65535 | Accepts 0; clamps to [0, 65535] |

**Effect:** env-config rejects port 0; env-validate allows it. If user sets port 0, env-validate keeps it; env-config then throws. **env-config is stricter** — this is acceptable. Port 0 is invalid for binding anyway.

### 3. Variables validated only in env-validate

env-validate applies range checks (with clamp/warn) to variables that env-config reads without validation:

| Variable | env-validate range | env-config |
|----------|--------------------|------------|
| AGNI_MIN_LOCAL_SAMPLE | 1–100000 | `intVal` only (no range check) |
| AGNI_MIN_LOCAL_EDGES | 1–100000 | `intVal` only |
| AGNI_EMBEDDING_LR | 0.0001–1 | `floatVal` only |
| AGNI_EMBEDDING_REG | 0–1 | `floatVal` only |
| AGNI_DATA_DIR, AGNI_YAML_DIR, etc. | `dirEnv` (rejects empty string) | `strVal` (accepts any string) |

**Effect:** For hub processes, env-validate provides extra sanitization. For non-hub processes (CLI, scripts), env-config is the only validator.

---

## Consolidation Status

- **Single source of truth for reading:** env-config. All modules import from it.
- **Validation logic:** Split. env-config does strict validation (throw); env-validate does soft validation (warn/clamp) for hub startup.
- **Range definitions:** Duplicated. Numeric bounds exist in both modules. Aligning them would require either:
  - Extracting shared constants (e.g. `ENV_RANGES`) used by both, or
  - Making env-validate import ranges from env-config (would need env-config to export bounds before parsing).

---

## References

- `packages/agni-utils/env-config.js` — canonical reader
- `packages/agni-utils/env-validate.js` — hub pre-load validator
- `docs/CONFIGURATION.md` — full config reference
- `docs/archive/SPRINT-R11-REMEDIATION.md` — P4.13 env-config/env-validate range discrepancy (historical)
