# Documented-to-Fix Remediation Plan

**Policy:** Items previously marked "Documented" (limitation accepted, no fix planned) are now treated as **fix required**. The most architecturally significant items are fixed first; none are deferred.

**Source:** `UNRESOLVED-ISSUES-MASTER-LIST.md` — P2-12, P2-13, P2-20, P2-24, Gap 4.

---

## Priority 1: Device ID Trust Boundary (P2-12, Gap 4)

**Architectural significance: 8/10**

**Problem:** `OLS_INTENDED_OWNER` is compared to device identity. Integrity checks pseudoId from URL (`?pseudoId=...`). A student can change the URL to bypass anti-copy — lesson signed for Alice runs on Bob's device if Bob uses `?pseudoId=alice`.

**Current mitigation:** Hub signs only for *authenticated* pseudoId from session. No client-supplied UUID path. But runtime identity comes from URL, which the student controls.

**Fix (implementation options, in order of feasibility):**

1. **Hub-issued device binding token**  
   - On first session (verify-pin / claim), hub issues a short-lived `deviceBinding` value derived from `pseudoId + deviceFingerprint + nonce`, stored in HttpOnly cookie.  
   - Integrity checks `OLS_INTENDED_OWNER` against the binding in cookie (or session), not URL.  
   - URL `?pseudoId=` used only for routing; identity comes from session.  
   - **Location:** `packages/agni-services/accounts.js`, `packages/agni-hub/hub-transform/route-handlers.js`, `packages/agni-runtime/integrity/integrity.js`, portal/player launcher.

2. **Hardware-backed identifier (longer-term)**  
   - Use Web Authentication / credential storage, or platform-specific device attestation (Android SafetyNet/Play Integrity).  
   - Requires broader platform integration.

**Tasks:**
- [x] Design device-binding flow (session API returns hub-validated pseudoId)
- [x] Add GET /api/session/identity — returns { pseudoId } when student session valid
- [x] Update integrity.js to fetch session API first; use URL as fallback (offline/sneakernet)
- [x] Watermark check: require OLS_INTENDED_OWNER === session.pseudoId when online with session

---

## Priority 2: Session Token Replay Risk (P2-13)

**Architectural significance: 6/10**

**Problem:** 24h session; token can be copied between devices. Client IP binding exists but is bypassable when attacker is on same network.

**Fix:**

1. **Device fingerprint binding**  
   - Store a hash of User-Agent + viewport + stable client hints (or minimal fingerprint) at session creation.  
   - Reject session if fingerprint changes beyond threshold.  
   - **Location:** `packages/agni-services/accounts.js`, `packages/agni-hub/routes/accounts.js`.

2. **Shorter TTL + refresh**  
   - Reduce `STUDENT_SESSION_TTL_MS` from 24h to 4–6h.  
   - Add refresh endpoint; extend TTL on activity.  
   - **Location:** `packages/agni-services/accounts.js`.

3. **Single-session-per-student (strict)**  
   - Invalidate previous session when new session created (verify-pin / claim).  
   - Prevents token sharing across devices.  
   - **Location:** `packages/agni-services/accounts.js`.

**Tasks:**
- [x] Implement single-session-per-student invalidation
- [x] Reduce TTL to 6h (configurable via AGNI_STUDENT_SESSION_TTL_MS)
- [x] Add device fingerprint binding (User-Agent hash stored at session creation; validated on each request)

---

## Priority 3: Pi serveDir/lessons Disk Exhaustion (P2-20)

**Architectural significance: 5/10**

**Problem:** Many YAML versions → disk fills. No automatic GC for compiled output when YAML is removed. No automatic GC for old YAML backups.

**Fix:**

1. **GC on YAML removal**  
   - When YAML file is removed or slug no longer in catalog, prune `serveDir/lessons/{slug}/` (index.html, index-ir.json, index-ir-full.json).  
   - **Location:** `packages/agni-hub/hub-transform/cache.js`, `packages/agni-hub/theta.js` (rebuildLessonIndex), or new GC script/cron.

2. **Version retention policy**  
   - Add `AGNI_YAML_MAX_VERSIONS` (e.g. 3) and `AGNI_SERVE_MAX_BYTES` (optional).  
   - Prune oldest YAML backups beyond limit.  
   - **Location:** `packages/agni-utils/env-config.js`, GC logic.

3. **Periodic GC job**  
   - Hub startup or scheduled task: scan `serveDir/lessons`, compare to catalog + yamlDir, delete orphan compiled dirs.  
   - **Location:** New `packages/agni-hub/gc-disk-lessons.js` or integrated into hub-transform.

**Tasks:**
- [x] Add `pruneOrphanLessons(serveDir, catalog, yamlDir)` — delete lessons not in catalog (gc-disk-lessons.js)
- [x] Run prune on hub startup (or via init-data / admin endpoint) — in rebuildLessonIndex
- [ ] Add `AGNI_YAML_MAX_VERSIONS` and backup pruning (optional)
- [x] Document GC policy in RUN-ENVIRONMENTS.md

---

## Priority 4: Edge Device SW Cache Eviction (P2-24)

**Architectural significance: 5/10**

**Problem:** Chrome may evict Cache API entries under storage pressure. Offline lesson load fails when evicted — student sees "Connect to hub" banner.

**Fix:**

1. **Request persistent storage**  
   - Use `navigator.storage.persist()` when available so Chrome is less likely to evict.  
   - **Location:** `packages/agni-hub/pwa/` shell or factory-loader / shell-boot.

2. **Explicit eviction strategy in SW**  
   - Document and enforce: lesson cache LRU (already MAX_LESSON_CACHE_ENTRIES=20); factory cache versioned.  
   - Add `cache.delete()` on eviction (already present per check-precache-regression).  
   - Ensure eviction order is deterministic (oldest first).

3. **Quota awareness**  
   - Use `navigator.storage.estimate()` to log quota usage; optionally warn when near limit.  
   - **Location:** shell-boot or telemetry.

4. **Graceful degradation**  
   - Already implemented: `_offlineResponse` when cache miss. Ensure UI clearly guides user to reconnect.

**Tasks:**
- [ ] Call `navigator.storage.persist()` in PWA shell/shell-boot
- [ ] Add quota logging (optional) for diagnostics
- [ ] Document eviction strategy in sw.js header and RUN-ENVIRONMENTS.md
- [ ] Verify LRU eviction uses `cache.delete()` (per check-precache-regression)

---

## Status Tracking

| ID | Issue | Status |
|----|-------|--------|
| P2-12 | Device ID trust boundary | **Done** — session API + integrity.js |
| Gap 4 | Device UUID trust | **Done** (same as P2-12) |
| P2-13 | Session token replay risk | **Done** — single-session + 6h TTL |
| P2-20 | Pi serveDir/lessons disk exhaustion | **Done** — gc-disk-lessons.js, prune on startup + author delete |
| P2-24 | Edge device SW cache eviction | Open — fix required |

---

## References

- `docs/archive/ARCHITECTURAL-VULNERABILITIES-PHASE2-PLAN.md` §§12, 13, 20, 24
- `docs/archive/GAP-ANALYSIS-AND-MITIGATIONS.md` §4
- `docs/playbooks/village-security.md`
- `docs/RUN-ENVIRONMENTS.md`
- `packages/agni-runtime/integrity/integrity.js`
- `packages/agni-services/accounts.js`
- `packages/agni-hub/sw.js`
