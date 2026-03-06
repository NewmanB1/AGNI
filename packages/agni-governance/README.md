# @agni/governance

Policy-driven lesson governance for the AGNI platform. Evaluates whether lessons comply with local educational policies, tracks curriculum coverage across student cohorts, and manages the approved lesson catalog.

## What's here

| Module | Purpose |
|--------|---------|
| `policy` | Loads and validates governance policy JSON against schema |
| `evaluateLessonCompliance` | Pure function: `(sidecar, policy) → { status, issues }` |
| `aggregateCohortCoverage` | Computes what percentage of required skills a cohort has covered |
| `catalog` | Manages the approved lesson catalog (add, remove, query) |
| `schema-store` | Ajv schema cache for governance policy validation |

## Architecture

Governance is designed as pure evaluation:

```
(sidecar, policy) → { status: 'ok'|'warning'|'fail', issues: [{ message, severity }] }
```

Policy loading/saving and HTTP routing happen in `@agni/hub`.

## Usage

```js
const governance = require('@agni/governance');

const result = governance.evaluateLessonCompliance(sidecar, policy);
if (result.status !== 'ok') {
  console.log('Issues:', result.issues);
}
```

## Dependencies

- `@agni/utils` — env-config and logger only

## Configuration

Paths are configurable via `@agni/utils/env-config` (from `AGNI_*` env vars):

| Env | Default | Purpose |
|-----|---------|---------|
| `AGNI_GOVERNANCE_POLICY_SCHEMA` | `{DATA_DIR}/../schemas/governance-policy.schema.json` | Schema for policy validation |
| `AGNI_APPROVED_CATALOG_SCHEMA` | `{DATA_DIR}/../schemas/approved-catalog.schema.json` | Schema for catalog validation |
| `AGNI_UTU_CONSTANTS` | `{DATA_DIR}/utu-constants.json` | UTU Spine IDs and protocol metadata |

For pure testing (no file I/O), pass `opts.utuConstants` to `evaluateLessonCompliance(sidecar, policy, { utuConstants: {...} })`.

## Contributing

Keep compliance evaluation **pure** (policy + data in → result out). If you're adding new policy rules, update both the evaluator and `schemas/governance-policy.schema.json`.
