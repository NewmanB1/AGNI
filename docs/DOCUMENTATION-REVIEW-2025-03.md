# Documentation Review — March 2025

Comprehensive review of all `*.md` files in the AGNI repository (excluding `node_modules/`) to assess **essentiality** and **completeness**.

---

## 1. Executive Summary

| Metric | Count |
|--------|-------|
| Project `.md` files (excl. node_modules) | ~90 |
| Root-level docs | 8 |
| docs/ | ~75 |
| docs/archive/ | 29 |
| Package READMEs | 10 |
| .cursor/rules | 3 |
| .github templates | 4 |
| integrations/ | 2 |

**Findings:**
- **3 empty/stub files** should be removed or populated
- **~25 essential docs** are not indexed in `docs/README.md`
- **2–3 documents** have overlap; consider consolidation
- **docs/README.md** and **AGENTS.md** Key Docs section are out of sync

---

## 2. Non-Essential or Stub Files (Candidates for Removal)

| File | Issue | Recommendation |
|------|-------|----------------|
| `docs/GOVERNANCE.md` | Empty (2 blank lines). `guides/GOVERNANCE-AUTHORITY.md` is the real guide. | **Remove** — duplicate purpose, no content |
| `docs/SCHEMA_SPEC.md` | Empty (2 blank lines). `docs/SCHEMA-FREEZE.md` and `specs/ols-v1.0-spec.md` cover schema. | **Remove** — obsolete placeholder; SPRINT-REMEDIATION noted it as non-existent |
| `docs/DRY-REMEDIATION-PLAN.md` | Active remediation plan referenced by UNRESOLVED-ISSUES-MASTER-LIST. Work may be in progress. | **Keep** but add to docs/README; if work is done, move to archive |

---

## 3. Essential Docs Missing from docs/README.md Index

These are referenced by AGENTS.md, code, or other docs but **not** listed in `docs/README.md`:

### Operations & Configuration
| Doc | Referenced by |
|-----|---------------|
| `CONFIGURATION.md` | AGENTS.md, TELEMETRY-ARCHITECTURE, CONFIGURATION.md itself |
| `RUN-ENVIRONMENTS.md` | AGENTS.md, edge-device-es5.md, RUN-ENVIRONMENTS tests |
| `DEPLOYMENT.md` | In README ✓ |
| `DEV-START.md` | Developers needing quick dev setup — **critical for onboarding** |

### Architecture & Design
| Doc | Referenced by |
|-----|---------------|
| `TELEMETRY-ARCHITECTURE.md` | AGENTS.md, playbooks/sentry.md |
| `ARCHITECTURE-DETAILED.md` | ARCHITECTURAL-VULNERABILITIES docs |
| `SUBSYSTEMS-AND-ARCHITECTURE.md` | Deep subsystem reference |
| `RUNTIME-INTEGRITY-SENSOR-BRIDGE-ARCHITECTURE.md` | Runtime/integrity design |

### Verification & Issue Tracking
| Doc | Referenced by |
|-----|---------------|
| `VERIFICATION-GUARDS.md` | AGENTS.md, sprint-verification |
| `UNRESOLVED-ISSUES-MASTER-LIST.md` | AGENTS.md, master list for all issues |
| `DOCUMENTED-TO-FIX-REMEDIATION-PLAN.md` | UNRESOLVED-ISSUES, Phase2 plans |

### Planning & Remediation
| Doc | Referenced by |
|-----|---------------|
| `LAUNCH-CHECKLIST.md` | LAUNCH-AND-COMMUNITY |
| `COLLABORATIVE-LESSONS-IMPLEMENTATION-PLAN.md` | AGENTS.md |
| `YEAR2-PREP.md` | In README ✓ |

### Technical References
| Doc | Referenced by |
|-----|---------------|
| `SCHEMA-FREEZE.md` | ols-v1.0-spec, UNRESOLVED-ISSUES |
| `ENV-VALIDATION-SPLIT.md` | CONFIGURATION, UNRESOLVED-ISSUES |
| `TIPTAP-RESEARCH.md` | YEAR2-PREP, UNRESOLVED-ISSUES |
| `BREAKING-VS-ADDITIVE.md` | ols-v1.0-spec, schema versioning |

### Audits & Findings (Active)
| Doc | Referenced by |
|-----|---------------|
| `AUDIT-HARDENING-PLAN.md` | UNRESOLVED-ISSUES source list |
| `LEN-001-MATH-ENGINE-BUGS.md` | Bug tracking |
| `SHIM-AND-CODE-AUDIT-FINDINGS.md` | UNRESOLVED-ISSUES source list |

### Integrations (Not in docs/README at all)
| Doc | Purpose |
|-----|---------|
| `integrations/KOLIBRI-INTEGRATION-GUIDE.md` | Ricecooker + HTML5 App path |
| `integrations/KOLIBRI-PLUGIN-GUIDE.md` | Native Kolibri plugin (optional) |
| `integrations/MOODLE-MOD-OLS-GUIDE.md` | Moodle OLS plugin |
| `integrations/MOODLE-LTI-SETUP.md` | Moodle LTI setup |
| `integrations/CANVAS-LTI-SETUP.md` | Canvas LTI setup |

### Accessibility
| Doc | Purpose |
|-----|---------|
| `accessibility/HAPTIC-TESTING-TEMPLATE.md` | Haptic testing procedures |
| `accessibility/INTENSITY-SETTINGS.md` | Intensity settings for haptics |

### Specs
| Doc | Purpose |
|-----|---------|
| `specs/ols-v1.0-spec.md` | OLS v1.0 formal spec — **not in README** (only threshold_grammar, utu-architecture are) |

### Playbooks (Missing from README)
| Doc | Purpose |
|-----|---------|
| `playbooks/hub.md` | Hub modifications |
| `playbooks/lms-plugins.md` | LMS plugin development |
| `playbooks/math.md` | Math engine changes |
| `playbooks/math-remediation-plan.md` | Math bug remediation |
| `playbooks/collaborative-lessons.md` | Collaborative lessons implementation |
| `playbooks/CHECK-JS-ENABLEMENT-PLAN.md` | CheckJS enablement |
| `playbooks/CHECK-JS-FINISH-PLAN.md` | CheckJS completion |

### Other
| Doc | Purpose |
|-----|---------|
| `COMMUNITY-CHECKLIST.md` | Community health checklist |
| `VERIFICATION-REPORT.md` | In README ✓ |

---

## 4. Overlap / Redundancy Analysis

| Documents | Overlap | Recommendation |
|-----------|---------|----------------|
| **ARCHITECTURE.md** vs **ARCHITECTURE-DETAILED.md** vs **SUBSYSTEMS-AND-ARCHITECTURE.md** | All describe system architecture at different depths. ARCHITECTURE = canonical high-level; ARCHITECTURE-DETAILED = implementation details; SUBSYSTEMS = subsystem-by-subsystem deep dive. | **Keep all three** — they serve different audiences. Add clear "see also" links. Ensure docs/README explains the hierarchy. |
| **KOLIBRI-INTEGRATION-GUIDE** vs **KOLIBRI-PLUGIN-GUIDE** | Different: Integration = Ricecooker path (low effort); Plugin = native plugin (high effort). Plugin guide references Integration guide. | **Keep both** — complementary. |
| **LAUNCH-CHECKLIST** vs **LAUNCH-AND-COMMUNITY** | LAUNCH-AND-COMMUNITY = context and plan; LAUNCH-CHECKLIST = actionable steps. LAUNCH-AND-COMMUNITY points to LAUNCH-CHECKLIST. | **Keep both** — complementary. |

---

## 5. Completeness Gaps

| Gap | Recommendation |
|-----|----------------|
| **docs/README does not list Integrations** | Add an "Integrations" section: Kolibri (integration + plugin), Moodle (mod_ols + LTI), Canvas LTI |
| **docs/README does not list Accessibility** | Add "Accessibility" with HAPTIC-TESTING-TEMPLATE, INTENSITY-SETTINGS |
| **docs/README does not list CONFIGURATION, RUN-ENVIRONMENTS** | Add to Operations; these are critical for hub/edge setup |
| **docs/README does not list TELEMETRY-ARCHITECTURE** | Add to Architecture & Design |
| **docs/README does not list DEV-START** | Add to Developer onboarding; DEVELOPERS guide should link to it |
| **docs/README does not list specs/ols-v1.0-spec.md** | Add to Specs — this is the formal OLS spec |
| **Package list missing @agni/cli, @agni/plugins, @agni/services** | docs/README package table lists 8 packages; AGENTS.md lists 9 (includes @agni/cli). Add @agni/cli, @agni/services, @agni/plugins |
| **AGENTS.md Key Docs omits DEV-START, LAUNCH-CHECKLIST, integrations** | Consider adding DEV-START; integrations may be situational |

---

## 6. Archive Health

- **docs/archive/** has 29 files with clear README explaining purpose
- Archive README accurately describes content
- **Recommendation:** No changes. Archive serves historical/audit purpose.

---

## 7. Root-Level Files

| File | Essential? | Notes |
|------|------------|-------|
| AGENTS.md | Yes | AI assistant guidance |
| ARCHITECTURE.md | Yes | Redirect to docs/ARCHITECTURE.md |
| CHANGELOG.md | Yes | Standard |
| CODEBASE_INDEX.md | Yes | Quick reference; overlaps slightly with AGENTS.md "Where to Find Things" |
| CONTRIBUTING.md | Yes | Standard |
| MANIFESTO.md | Yes | Project vision |
| README.md | Yes | Project entry |
| SECURITY.md | Yes | Security policy |

**CODEBASE_INDEX vs AGENTS.md:** Both have "where to find things" tables. CODEBASE_INDEX is more comprehensive for code paths; AGENTS.md is oriented to AI. **Keep both** — different audiences.

---

## 8. Recommendations Summary

### Immediate (High Priority) — DONE
1. ~~**Remove** `docs/GOVERNANCE.md` and `docs/SCHEMA_SPEC.md` (empty stubs)~~ ✓ Removed
2. ~~**Update docs/README.md** to add:~~ ✓ Updated
   - Operations: CONFIGURATION, RUN-ENVIRONMENTS, DEV-START
   - Architecture: TELEMETRY-ARCHITECTURE, ARCHITECTURE-DETAILED, SUBSYSTEMS-AND-ARCHITECTURE, RUNTIME-INTEGRITY-SENSOR-BRIDGE-ARCHITECTURE
   - Verification: VERIFICATION-GUARDS, UNRESOLVED-ISSUES-MASTER-LIST
   - Planning: LAUNCH-CHECKLIST, COLLABORATIVE-LESSONS-IMPLEMENTATION-PLAN
   - Specs: specs/ols-v1.0-spec.md
   - New sections: Integrations, Accessibility
   - Playbooks: hub, lms-plugins, math, math-remediation-plan, collaborative-lessons, CHECK-JS-*
   - Remediation refs: DOCUMENTED-TO-FIX, DRY-REMEDIATION, SCHEMA-FREEZE, ENV-VALIDATION-SPLIT, TIPTAP-RESEARCH, BREAKING-VS-ADDITIVE
   - Audits: AUDIT-HARDENING-PLAN, LEN-001, SHIM-AND-CODE-AUDIT-FINDINGS
   - Package table: @agni/cli, @agni/services, @agni/plugins

### Medium Priority — DONE
3. ~~Add "Documentation hierarchy" note: ARCHITECTURE (canonical) → ARCHITECTURE-DETAILED (implementation) → SUBSYSTEMS (deep dive)~~ ✓ Added to docs/README
4. ~~Ensure DEVELOPERS guide links to DEV-START.md~~ ✓ Added

### Low Priority
5. If DRY-REMEDIATION-PLAN work is complete, move to archive and update UNRESOLVED-ISSUES
6. Sync AGENTS.md Key Docs with updated docs/README structure

---

## 9. File Count After Cleanup

| Category | Before | After (recommended) |
|----------|--------|---------------------|
| docs/ root | ~50 | ~48 (remove 2 stubs) |
| archive | 29 | 29 |
| Total project .md (excl. node_modules) | ~90 | ~88 |

---

*Review conducted March 2025. Excludes node_modules. Based on AGENTS.md, docs/README.md, and cross-references.*
