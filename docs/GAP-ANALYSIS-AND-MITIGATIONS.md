# OLS Known Gaps — Analysis & Proposed Mitigations

Expands on `docs/ARCHITECTURE.md` Appendix: Known Gaps with actionable proposals. See also `docs/VERIFICATION-REPORT.md`.

---

## 1. YAML Schema Versioning

**Gap:** IR has `_schemaVersion`; YAML itself is unversioned. Offline hubs may receive YAML with new fields that old compilers reject.

**Current state:** Partially addressed. `meta.yamlSchemaVersion` exists in `schemas/ols.schema.json`. `build-lesson-ir.js` checks against `KNOWN_SCHEMA_VERSIONS` and logs a warning when unknown. IR propagates `yamlSchemaVersion` to the sidecar.

**Remaining:** Ensure `KNOWN_SCHEMA_VERSIONS` is kept up to date when new schema versions are introduced. Document the versioning policy in CONVENTIONS or a playbook.

---

## 2. DAG Validation

**Gap:** Cycles make lessons permanently ineligible. Theta throws at startup.

**Current state:** `verify:skill-dag` in `verify:all`; `scripts/check-skill-dag.js` uses `@agni/utils/skill-dag-validate`.

**Proposed mitigation (already in place):**
- Run `npm run verify:skill-dag` before deployment.
- Consider adding a pre-commit hook or CI gate that runs when `curriculum.json` or `lesson-index.json` changes.

**Effort:** None for core; optional CI hook is low effort.

---

## 3. HTML Scrape Fallback *(Resolved)*

**Gap (was):** Theta fell back to HTML scraping when no IR sidecar existed. Brittle; markup changes could break indexing.

**Current state:** **Resolved.** Theta refuses to index lessons without a valid IR sidecar. Lessons without `index-ir.json` are skipped (not indexed); a warning is logged. HTML scraping has been removed from runtime. Single source of truth: IR only. See `docs/ARCHITECTURE.md` Known Gaps table.

---

## 4. Device UUID Trust

**Gap:** Hub binds content to client-supplied UUID. UUID is not authenticated or hardware-bound.

**Proposed mitigation:**
- Document clearly: trust boundary is hub–device. P2P cloning is prevented by signature.
- Optional: add a lightweight device attestation flow (e.g. TPM-backed or app-signed token) in future phases. Not required for MVP.

**Effort:** None for current design; attestation is a larger project.

---

## 5. Federation Merge — Version/Timestamp

**Gap:** No explicit version/timestamp in merge. Duplicate or out-of-order merges could affect posteriors.

**Current state:** `federation.js` uses `contentHash` (embeddingDim, mean, precision, sampleSize) for dedup. `MAX_SEEN_SYNC_IDS` (500) prevents unbounded growth. Merge is idempotent for same inputs.

**Proposed mitigation:**
- Document that content-based dedup via `contentHash` provides practical idempotency.
- Optional: add `mergeTimestamp` to export payload for audit; not required for correctness.

**Effort:** None for core; optional audit field is low.

---

## 6. Service Worker on Android Marshmallow

**Gap:** Android Marshmallow WebView has inconsistent SW support.

**Proposed mitigation:**
- Detect SW availability; if absent, fall back to no-cache mode (fetch lesson on each load).
- Document degraded behaviour in `docs/RUN-ENVIRONMENTS.md`.

**Effort:** Medium. Requires runtime feature detection and fallback path.

---

## 7. Root player.js Stub (Verification Finding)

**Finding:** Root `player.js` has `verifyIntegrity()` that returns `true` with a TODO. Canonical player is `packages/agni-runtime/ui/player.js`.

**Proposed mitigation:**
- If root `player.js` is used for local dev or standalone testing: add a comment clarifying it bypasses integrity for dev convenience.
- If obsolete: consider removing or redirecting to canonical player.

**Effort:** Low (comment or removal).

---

## Priority Summary

| Gap | Priority | Action |
|-----|----------|--------|
| YAML versioning | Medium | Add `yamlSchemaVersion` to meta |
| DAG validation | Done | CI hook optional |
| HTML scrape | Done | Removed; Theta refuses to index without IR |
| Device UUID | Low | Documentation only |
| Federation | Low | Document contentHash behaviour |
| Service Worker | Medium | Fallback for no-SW devices |
| Root player.js | Low | Clarify or remove |
