# Opportunistic Lesson Precaching Plan

Plan to enable proactive precaching of multiple lessons on edge devices when the hub is reachable, reducing latency and improving offline resilience.

**Reference:** `docs/ARCHITECTURE.md` (Section 4: Bandwidth optimization, packet sizes), `packages/agni-hub/sw.js` (current caching strategy).

---

## Current State

| Asset Type | Caching Strategy | When Populated |
|------------|------------------|----------------|
| **Factory files** | Precached on SW install (`PRECACHE_FACTORIES`) | Install event |
| **KaTeX CSS** | Cache-first on first use | On-demand |
| **Lessons** | Network-first with offline fallback (`LESSON_CACHE`) | On-demand when user navigates |

**Lesson delivery paths:**
- `GET /lessons/:slug` — full compiled HTML (~5–500 KB per lesson)
- `GET /shell/:slug` + `GET /lesson-data.js?slug=X` — PWA shell + IR as script

**Theta API:** `GET /api/theta?pseudoId=X` returns ordered lessons (`lessonId`, `slug`, `title`, …), `graphWeights`, and `precacheSlugs` based on skill graph, mastery, and MLC.

**Edge Theta (implemented):** `packages/agni-runtime/engine/edge-theta.js` runs on the device to order precached lessons when offline. Uses stored theta snapshot (from precache) + SW cache keys to discover precached lessons, then calls `AGNI_NAVIGATOR.sortLessons()`. Village Library at `/library` uses this.

---

## Goals

1. **Proactively cache** the next N lessons for a student when online.
2. **Use theta ordering** so cached lessons are those the student is most likely to need next.
3. **Stay within storage limits** on low-RAM devices (512MB–1GB).
4. **Non-blocking** — precaching runs in background, does not block lesson load or navigation.

---

## Scope

| Phase | Focus | Regression Guard | Proof of Completion |
|-------|-------|------------------|---------------------|
| **Phase 1** | API: theta returns precache hints | verify:all | `GET /api/theta` includes `precacheSlugs` |
| **Phase 2** | Client: precache orchestrator | Manual / integration | Device precaches when online |
| **Phase 3** | SW: bounded lesson cache + LRU | Unit test | Eviction works; storage bounded |
| **Phase 4** | Integration & tuning | verify:all | End-to-end precache flow works |

---

## Phase 1: Theta Precache Hints

**Problem:** The client needs a list of slugs to precache. Theta already computes the ordered lesson list; we add a small `precacheSlugs` field.

### P1.1 Add precacheSlugs to theta response

| # | Task | File | Change |
|---|------|------|--------|
| P1.1a | Compute hints | `packages/agni-hub/theta.js` | After `computeLessonOrder`, take first N slugs (e.g. 5) and add `precacheSlugs: slugs[]` to the response shape used by the route. |
| P1.1b | Route passthrough | `packages/agni-hub/routes/theta.js` | Include `precacheSlugs` in the JSON returned by `GET /api/theta`. |
| P1.1c | Configurable N | `packages/agni-hub` or env | `AGNI_PRECACHE_HINT_COUNT` (default 5). |

**Response shape (example):**
```json
{
  "pseudoId": "A-123",
  "lessons": [ ... ],
  "precacheSlugs": [ "gravity", "pendulum", "acceleration", "vectors", "friction" ],
  "computedAt": "...",
  "cached": true
}
```

**Proof of completion:**
```bash
curl -s "http://localhost:8083/api/theta?pseudoId=A-123" -H "Authorization: Bearer ..." | jq .precacheSlugs
# Returns array of up to 5 slugs
```

---

## Phase 2: Client-Side Precache Orchestrator

**Problem:** Something on the device must call theta, get `precacheSlugs`, and trigger fetches. This runs in the lesson shell (PWA) or student app.

### P2.1 Where the orchestrator runs

| Option | Location | Pros | Cons |
|--------|----------|------|------|
| A | Shared runtime (`packages/agni-runtime`) | Single place for all shells | Runtime is ES5; adds complexity |
| B | PWA shell (`shell-boot.js` or new `precache.js`) | Co-located with SW registration | Only affects PWA flow |
| C | Telemetry / shared module | Already has hub URL, pseudoId | Telemetry is optional |

**Recommendation:** Option B — add `packages/agni-hub/pwa/precache.js` (or extend `shell-boot.js`) that:
- Registers with the SW when the shell loads.
- Calls `/api/theta?pseudoId=X` when online (pseudoId from localStorage or URL).
- Uses `precacheSlugs` to fetch lessons in the background.

### P2.2 Precache trigger logic

| # | Task | Change |
|---|------|--------|
| P2.2a | Trigger on shell load | After lesson renders, in `requestIdleCallback` or `setTimeout(..., 2000)`, call theta. |
| P2.2b | Trigger on SW `fetch` success | When a lesson fetch succeeds, the SW could message the client: "hub reachable, consider precaching." Client then fetches theta and precaches. |
| P2.2c | Throttle | At most one precache run per 5 minutes per device. |

### P2.3 What to fetch

| # | Task | Change |
|---|------|--------|
| P2.3a | Use `/lessons/:slug` | Each slug → `fetch(/lessons/{slug})`. SW intercepts and caches. Simple, works with existing LESSON_CACHE. |
| P2.3b | Or shell + lesson-data | For PWA shell flow: fetch `/shell/:slug` and `/lesson-data.js?slug=X`. More requests, but matches how the user loads. |

**Recommendation:** P2.3a — precache full lesson HTML via `/lessons/:slug`. The SW already caches these. When the user later navigates to `/shell/:slug`, the shell loads and requests lesson-data.js; if we want to support offline shell, we'd need to also cache lesson-data.js. For Phase 2, precaching `/lessons/:slug` gives offline access to the standalone HTML format. A future phase can add shell+lesson-data precache for PWA-first deployments.

### P2.4 Auth / identity

| # | Task | Change |
|---|------|--------|
| P2.4a | Theta requires `Hub-Key` or cookie | Client must send auth. Student app already has this. |
| P2.4b | Device binding | If hub signs lessons with `deviceId`, precache requests must use the same identity. Currently `attachRoutes` passes `deviceId: null` in some configs. Document: when signing is enabled, precache fetches should include device context so the hub can sign. |

---

## Phase 3: Bounded Lesson Cache & LRU

**Problem:** Unbounded lesson cache can exhaust storage on low-RAM devices. Need eviction.

### P3.1 Add cache size limit

| # | Task | File | Change |
|---|------|------|--------|
| P3.1a | Define MAX_LESSON_CACHE_ENTRIES | `packages/agni-hub/sw.js` | Constant (e.g. 20). Each lesson ~10–100 KB → ~2 MB max. |
| P3.1b | LRU eviction | `packages/agni-hub/sw.js` | When adding to LESSON_CACHE, if `cache.keys().length >= MAX`, delete oldest (by `cache.keys()` order or track timestamps in cache meta). |
| P3.1c | Never evict current lesson | Ensure we don't evict the lesson the user is viewing. |

**Implementation note:** Cache API does not expose access timestamps. Options:
- Use `cache.put()` with a custom Request URL that encodes timestamp (e.g. `?_t=123`) — hacky.
- Maintain a separate IndexedDB or in-memory (lost on SW restart) list of cache URLs + timestamps.
- Simpler: evict by FIFO when over limit. On SW activate, open LESSON_CACHE, get keys, delete oldest N. Requires storing keys somewhere; Cache API `keys()` returns requests. A lightweight approach: store `{ slugs: string[], max: number }` in a separate small cache (e.g. `sw-meta`) and use that for LRU order.

### P3.2 Prefer evicting non-precached

| # | Task | Change |
|---|------|--------|
| P3.2a | Tag precached vs. on-demand | When we add via precache, use a naming convention (e.g. put with a header or in a separate "precache" sub-cache). Evict precached entries before on-demand (user-visited) entries. |
| P3.2b | Or unified LRU | Simpler: one LESSON_CACHE, pure LRU. Precached lessons that are never opened get evicted first. Acceptable. |

**Recommendation:** P3.2b — single LESSON_CACHE, FIFO/LRU. Simpler.

---

## Phase 4: Integration & Tuning

### P4.1 Wire precache into shell

| # | Task | File | Change |
|---|------|------|--------|
| P4.1a | Load precache script | `packages/agni-hub/pwa/shell.html` | Add `<script src="/precache.js"></script>` (or inline in shell-boot). |
| P4.1b | Ensure theta route reachable | Verify student devices can call `/api/theta` from the lesson origin. |

### P4.2 Configurable knobs

| # | Task | Change |
|---|------|--------|
| P4.2a | `AGNI_PRECACHE_HINT_COUNT` | Default 5. Max slugs in theta response. |
| P4.2a | `AGNI_PRECACHE_MAX_LESSONS` | SW: max entries in LESSON_CACHE. Default 20. |
| P4.2b | `AGNI_PRECACHE_THROTTLE_MS` | Min ms between precache runs. Default 300000 (5 min). |

### P4.3 Observability

| # | Task | Change |
|---|------|--------|
| P4.3a | Console log in dev | `[PRECACHE] Fetched 3/5 lessons` when in dev mode. |
| P4.3b | Optional telemetry | Emit `precache_run` event with `{ requested, cached, failed }` for analytics. |

---

## Execution Order

1. **Phase 1** — Theta returns `precacheSlugs`. No client changes yet.
2. **Phase 3** — SW cache eviction. Ensures we don't unboundedly grow before precache adds more.
3. **Phase 2** — Client orchestrator. Depends on Phase 1.
4. **Phase 4** — Wire-up and tuning.

---

## Out of Scope (Future)

- **Batch lesson endpoint** — `GET /lessons/batch?slugs=a,b,c` for fewer round-trips. Adds hub API surface.
- **Precache for shell+lesson-data** — For PWA-first flows where the user loads `/shell/:slug`.
- **Precache on SW install** — Would require knowing pseudoId at install time; usually not available.
- **Precache from theta push** — Hub pushes "precache these" via WebSocket. More complex.

---

## Completion Checklist

- [x] P1: Theta returns `precacheSlugs` (configurable N)
- [x] P2: Client precache orchestrator (theta → fetch lessons)
- [x] P3: SW lesson cache bounded with eviction
- [x] P4: Shell integration, config, observability

---

## Appendix: Storage Math

| Item | Size | Count | Total |
|------|------|-------|-------|
| Factory precache | ~200 KB | 7 files | ~1.4 MB |
| KaTeX CSS | ~50 KB | 1–2 | ~100 KB |
| Lessons | ~20–100 KB | 20 (max) | ~2 MB |
| **Total** | | | **~3.5 MB** |

On a 512 MB device with ~50–100 MB for browser storage, 3.5 MB is acceptable.
