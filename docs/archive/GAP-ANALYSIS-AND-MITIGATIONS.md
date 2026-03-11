> **Issues moved to:** [UNRESOLVED-ISSUES-MASTER-LIST.md](../UNRESOLVED-ISSUES-MASTER-LIST.md)

# OLS Known Gaps — Analysis & Proposed Mitigations

Expands on `../ARCHITECTURE.md` Appendix: Known Gaps with actionable proposals. See also `../VERIFICATION-REPORT.md`.

---

## 1. YAML Schema Versioning

**Gap:** IR has `_schemaVersion`; YAML itself is unversioned. Offline hubs may receive YAML with new fields that old compilers reject.

**Current state:** Partially addressed. `meta.yamlSchemaVersion` exists in `schemas/ols.schema.json`. `build-lesson-ir.js` checks against `KNOWN_SCHEMA_VERSIONS` and logs a warning when unknown. IR propagates `yamlSchemaVersion` to the sidecar.

**Resolved:** Versioning policy documented in `../CONVENTIONS.md` § "YAML/IR schema versioning". When introducing new schema versions, update `KNOWN_SCHEMA_VERSIONS` in `build-lesson-ir.js`.

---

## 2. DAG Validation *(Resolved)*

**Gap (was):** Cycles made lessons ineligible; theta threw at startup, bricking the hub.

**Current state:** **Resolved.** Theta gracefully degrades: prunes cycle nodes, excludes affected lessons, logs error. Hub stays up. Set `AGNI_STRICT_SKILL_GRAPH=1` for strict mode (throw). `verify:skill-dag` in `verify:all`; `scripts/check-skill-dag.js` validates. See `ARCHITECTURAL-VULNERABILITIES-REMEDIATION-PLAN.md`.

---

## 3. HTML Scrape Fallback *(Resolved)*

**Gap (was):** Theta fell back to HTML scraping when no IR sidecar existed. Brittle; markup changes could break indexing.

**Current state:** **Resolved.** Theta refuses to index lessons without a valid IR sidecar. Lessons without `index-ir.json` are skipped (not indexed); a warning is logged. HTML scraping has been removed from runtime. Single source of truth: IR only. See `../ARCHITECTURE.md` Known Gaps table.

---

## 4. Device UUID Trust

**Gap (resolved):** The Hub signs only for *authenticated* pseudoId from session (PIN or transfer token). No client-supplied UUID path. When auth is disabled, unsigned lessons are served. See `../ARCHITECTURE.md` §5.

**Proposed mitigation:**
- Document clearly: trust boundary is hub–device. P2P cloning is prevented by signature.
- Optional: add a lightweight device attestation flow (e.g. TPM-backed or app-signed token) in future phases. Not required for MVP.

**Effort:** None for current design; attestation is a larger project.

---

## 5. Federation Merge — Version/Timestamp *(Resolved)*

**Gap (was):** No explicit version/timestamp in merge. Duplicate or out-of-order merges could affect posteriors.

**Current state:** **Resolved.** `federation.js` exports `posteriorVersion` and `trainingWindow`; merge propagates them. `contentHash` and `syncId` provide dedup. `MAX_SEEN_SYNC_IDS` (500) prevents unbounded growth.

---

## 6. Service Worker on Android (addressed by baseline change)

**Former gap:** Android 6.0 (Marshmallow) WebView had inconsistent SW support.

**Resolution:** Edge hardware requirement updated to Android 7.0 (Nougat, API 24), which has reliable Service Worker support. We no longer target Marshmallow.

---

## 7. Root player.js Stub *(Resolved)*

**Finding (was):** Root `player.js` bypassed integrity for local dev.

**Current state:** **Resolved.** Root `player.js` header now clarifies it is LEGACY and bypasses integrity; canonical player is `packages/agni-runtime/ui/player.js`.

---

## Priority Summary

| Gap | Priority | Action |
|-----|----------|--------|
| YAML versioning | Medium | Add `yamlSchemaVersion` to meta |
| DAG validation | Done | Graceful degradation; AGNI_STRICT_SKILL_GRAPH for strict |
| HTML scrape | Done | Removed; Theta refuses to index without IR |
| Device UUID | Low | Documentation only |
| Federation | Low | Document contentHash behaviour |
| Service Worker | Resolved | Edge baseline now Android 7.0 (reliable SW) |
| Root player.js | Low | Clarify or remove |
