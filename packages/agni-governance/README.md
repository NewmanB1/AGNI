# @agni/governance

Policy-driven lesson governance for the AGNI platform. Evaluates whether lessons comply with local educational policies, tracks curriculum coverage across student cohorts, and manages the approved lesson catalog.

## What's here

| Module | Purpose |
|--------|---------|
| `policy` | Loads and validates governance policy JSON against schema |
| `evaluateLessonCompliance` | Pure function: `(policy, lessonSidecar) → ComplianceResult` |
| `aggregateCohortCoverage` | Computes what percentage of required skills a cohort has covered |
| `catalog` | Manages the approved lesson catalog (add, remove, query) |
| `schema-store` | Ajv schema cache for governance policy validation |

## Architecture

Governance is designed as pure evaluation:

```
(policy, lessonSidecar) → { compliant: boolean, violations: [], warnings: [] }
```

Policy loading/saving and HTTP routing happen in `@agni/hub`.

## Usage

```js
const governance = require('@agni/governance');

const result = governance.evaluateLessonCompliance(policy, sidecar);
if (!result.compliant) {
  console.log('Violations:', result.violations);
}
```

## Dependencies

- `@agni/utils` — env-config and logger only

## Contributing

Keep compliance evaluation **pure** (policy + data in → result out). If you're adding new policy rules, update both the evaluator and `schemas/governance-policy.schema.json`.
