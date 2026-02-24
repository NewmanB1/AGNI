# How to modify Governance

Use this when changing policy-driven compliance or cohort coverage reporting.

## Entry points

- **Service:** `src/services/governance.js` — `loadPolicy()`, `evaluateLessonCompliance(sidecar, policy?)`, `aggregateCohortCoverage(index, masterySummary, policy?)`. Policy path from `AGNI_GOVERNANCE_POLICY` or `data/governance_policy.json`.
- **Module:** `src/governance/index.js` — re-exports `loadPolicy`, `evaluateLessonCompliance`, `aggregateCohortCoverage`. Implementations in `policy.js`, `evaluateLessonCompliance.js`, `aggregateCohortCoverage.js`.

## Where to change what

| Goal | Files to touch |
|------|-----------------|
| Add a new policy rule (e.g. max lesson length) | `src/governance/evaluateLessonCompliance.js` — read from `policy`, compare to `sidecar`, push to `issues` and set `status`. Document the new key in `docs/api-contract.md` (GET /api/governance/policy) and in `src/types/index.d.ts` (`GovernancePolicy`). |
| Change coverage aggregation (e.g. by UTU only) | `src/governance/aggregateCohortCoverage.js` — `byUtu`, `bySkill`, and mastery threshold (currently 0.6, aligned with theta). |
| Change policy file format or location | `src/governance/policy.js` — `loadPolicy(filePath)`. Update `src/services/governance.js` default path and env var. |
| Expose governance over HTTP | **Done (Phase 7):** theta.js exposes `GET /api/governance/report`, `GET /api/governance/policy`, `POST /api/governance/compliance`; they call `services.governance`. See `docs/api-contract.md`. |

## Do not

- Hard-code policy rules in the lesson compiler or theta; keep governance in `src/governance/` and policy in JSON.
- Assume lesson index or sidecar have fields that aren’t yet threaded (e.g. `utu`, `teaching_mode` come from sidecar and theta index when built from sidecar).

## Types

- `src/types/index.d.ts`: `GovernancePolicy`, `ComplianceResult`, `CohortCoverageReport`. Sidecar type includes `utu`, `teaching_mode` for compliance.
