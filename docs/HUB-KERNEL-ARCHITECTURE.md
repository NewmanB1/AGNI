# Hub Kernel Architecture

**Version:** 1.0  
**Status:** Canonical  
**Related:** `docs/ARCHITECTURE.md` §3.1, `docs/TELEMETRY-ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `AGENTS.md`

---

## 1. Executive Summary

The **Hub Kernel** is the central nervous system of the Village Hub — the edge server that runs on a Raspberry Pi or local machine. It binds HTTP routes to shared services, orchestrates lesson delivery, telemetry ingestion, adaptive scheduling, governance, and cross-hub sync.

The kernel is implemented primarily in `packages/agni-hub/`, with services delegated to `@agni/services` and algorithmic logic in `@agni/engine` and `@agni/governance`. The design emphasizes:

- **Single-process pathfinder** as the main HTTP server, with lesson-server routes attached to the same server
- **Separate processes** for telemetry-engine (optional) and sync (periodic)
- **Shared context (`ctx`)** passed to all route modules, assembled from config, data-paths, services, auth, and HTTP helpers
- **Hub-config bootstrap** before env-config in all hub processes (safety-critical)

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              HUB KERNEL (packages/agni-hub)                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  PATHFINDER (theta) — Main HTTP Server (AGNI_PATHFINDER_PORT=8082)                    │    │
│  │  packages/agni-hub/pathfinder.js                                                      │    │
│  │                                                                                       │    │
│  │  ┌────────────────────────────────────────────────────────────────────────────────┐ │    │
│  │  │  Router (GET/POST/PUT/DELETE)                                                   │ │    │
│  │  │  routes/pathfinder, lms, governance, author, accounts, groups, parent,          │ │    │
│  │  │  student, collab, admin, chain, telemetry, lti, feature-flags                    │ │    │
│  │  └────────────────────────────────────────────────────────────────────────────────┘ │    │
│  │  ┌────────────────────────────────────────────────────────────────────────────────┐ │    │
│  │  │  Lesson Server (attachRoutes) — /lessons/, /factories/, /katex/, PWA assets     │ │    │
│  │  │  lesson-server.js + route-handlers.js                                           │ │    │
│  │  └────────────────────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                                     │
│                                         │ forwards events (AGNI_TELEMETRY_ENGINE_FORWARD)     │
│                                         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  TELEMETRY ENGINE — Separate Process (AGNI_TELEMETRY_ENGINE_PORT=8081)               │    │
│  │  packages/agni-hub/telemetry-engine.js                                               │    │
│  │  Ingest → Buffer → Flush NDJSON → runAnalysis → graph-weights.json                   │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                                     │
│                                         │ graph_weights consumed by pathfinder               │
│                                         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  SYNC — Separate Process (periodic or on-demand)                                     │    │
│  │  packages/agni-hub/sync.js                                                           │    │
│  │  Starlink/USB/LoRa → home server; import graph_weights-regional, base-costs, etc.    │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  MESH — Optional Separate Process (graph_weights over UDP/LoRa)                      │    │
│  │  packages/agni-hub/mesh/index.js                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Kernel Components — Detailed

### 3.1 Pathfinder (Theta)

**File:** `packages/agni-hub/pathfinder.js`  
**Port:** `AGNI_PATHFINDER_PORT` (default 8082)  
**Entry:** `hub-tools/pathfinder.js` wraps and spawns `packages/agni-hub/pathfinder.js`; `npm run start:hub` or `node hub-tools/pathfinder.js`

Pathfinder is the main HTTP server. It:

1. **Bootstraps** — Calls `loadHubConfig()` before env-config; validates env; ensures data dir exists
2. **Assembles ctx** — Imports `shared.js`, which merges `context/config`, `context/data-paths`, `context/services`, `context/data-access`, `context/auth`, `context/http`
3. **Registers API routes** — Each route module exports `register(router, ctx)`
4. **Attaches lesson-server** — `lessonServer.attachRoutes(server, options)` intercepts requests before fallback; lesson-server handles `/lessons/`, `/factories/`, `/katex/`, PWA assets
5. **Listens** — Binds to `0.0.0.0:pathfinderPort`

**Theta business logic (pure functions):**

| Function | Role |
|----------|------|
| `getEffectiveGraphWeights(pseudoId)` | Cohort → per-cohort graph; else local → regional → mesh → local fallback |
| `buildSkillGraph(lessonIndex, curriculum)` | Builds prerequisite graph from ontology |
| `detectSkillGraphCycles(graph)` | DFS cycle detection; graceful degrade or strict throw |
| `getResidualCostFactor(targetSkill, pseudoId, masterySummary, graphWeights)` | MLC residual from inbound edges |
| `computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights)` | θ = BaseCost × Residual − coherenceBonus |
| `computeLessonOrder(...)` | Filters eligible lessons, sorts by θ |
| `getLessonsSortedByPathfinder(pseudoId)` | Full pipeline with catalog, governance, frustration penalty, caching |
| `rebuildLessonIndex()` | Builds lesson-index.json from IR sidecars at `serveDir/lessons/{slug}/index-ir.json` |

**Shared cache:** `sharedCache` holds `skillGraph`, `eligibleLessons`, `graphMtime`. Invalidated when curriculum, schedules, or lesson index change. `pathfinderCache` (max 500 entries) caches per-pseudoId lesson order.

---

### 3.2 Lesson Service (Lesson Server)

**Files:** `packages/agni-hub/lesson-server.js`, `lesson-server/compile.js`, `lesson-server/cache.js`, `lesson-server/assemble.js`, `lesson-server/route-handlers.js`, `lesson-server/serve-assets.js`, `lesson-server/factory-manifest.js`  
**Routes:** `/lessons/:slug`, `/lessons/:slug/sidecar`, `/factories/*`, `/katex/*`, `/shell/:slug`, `/library`, `/lesson-data.js`, `/manifest.json`, `/sw.js`, PWA assets

The Lesson Service compiles YAML to HTML on demand and serves runtime assets.

**Request flow:**

1. **Route matching** — `route-handlers.handleRequest(req, res, options)` matches path; returns `true` if handled
2. **Compile options** — `getRequestCompileOptions(req)` extracts student session → `deviceId` for signing
3. **Compile** — `compile.compileLesson(slug, opts)`:
   - Disk cache: `serveDir/lessons/{slug}/index.html` + `index-ir.json`, `index-ir-full.json`; mtime ≥ YAML mtime → serve from disk
   - Memory cache: LRU keyed by `slug + yamlMtime`; `AGNI_CACHE_MAX_BYTES` or `AGNI_CACHE_MAX`
   - In-flight guard: per-slug Promise deduplication; `AGNI_COMPILE_CONCURRENCY` (default 3) limits parallel compiles
   - Queue overflow: 202 + Retry-After
4. **Assemble** — `assemble.assembleHtml(ir, opts)`: device binding (Ed25519 when auth + private key), PWA shell, CSP nonce
5. **Response** — HTML, JSON sidecar, or static file

**Backward compatibility:** `server/hub-transform.js` re-exports `@agni/hub`; `lessonServer` is the canonical implementation (hub-transform alias is deprecated).

---

### 3.3 Telemetry Service

**Integrated (Theta):** `routes/telemetry.js` handles `POST /api/telemetry`:
- Updates `mastery-summary.json` (skill levels per pseudoId)
- Records LMS probe results via `lmsService.recordObservation`
- Updates SM-2 `review-schedule.json`
- Appends to `telemetry-events.json` (capped 10k)
- Forwards events to Telemetry Engine when `AGNI_TELEMETRY_ENGINE_FORWARD !== 'false'`

**Standalone (Telemetry Engine):** `packages/agni-hub/telemetry-engine.js`:
- HTTP receiver: `POST /api/telemetry`, `POST /api/telemetry/ingest` (B1.1 aggregator)
- Buffers events in memory (max 50k)
- Flushes to `data/events/YYYY-MM-DD.ndjson` every 30s
- Runs analysis (contingency tables, cohort discovery, edge computation) → `graph-weights.json` or `graph-weights-pending.json`
- See `docs/TELEMETRY-ARCHITECTURE.md` for full detail

---

### 3.4 LMS Service

**Implementation:** `@agni/services/lms` (packages/agni-services)  
**Routes:** `routes/lms.js` — `POST /api/lms/observation`, `GET /api/lms/status`, `GET /api/lms/select`, `POST /api/lms/federation/merge`

Theta uses `lmsService` for:
- `recordObservation(pseudoId, lessonId, probeResults)` — Rasch, embeddings, Thompson bandit updates
- `selectBestLesson(pseudoId, eligibleLessons)` — Bandit selection among theta-ordered candidates
- `getStatus()` — Engine availability

When LMS is unavailable, pathfinder operates in "degraded mode": theta scheduling active, bandit selection disabled.

---

### 3.5 Governance Service

**Implementation:** `@agni/services/governance`, `@agni/governance`  
**Routes:** `routes/governance.js` — `GET /api/governance/report`, `GET /api/governance/policy`, `POST /api/governance/compliance`

Theta applies governance:
- **Catalog filter** — `approved-catalog.json` restricts eligible lessons
- **UTU targets** — `lessonPassesUtuTargets()` filters by governance policy when `enforceUtuTargets` is set

---

### 3.6 Accounts Service

**Implementation:** `@agni/services/accounts`  
**Routes:** `routes/accounts.js` — student PIN verification, session creation, parent/teacher auth; `routes/student.js` — streaks, checkpoints, diagnostic

- **Student sessions** — `validateStudentSession(token)` returns `{ pseudoId }`; used for lesson signing (device binding) and telemetry attribution
- **Hub API key** — `AGNI_HUB_API_KEY` required for protected endpoints (`requireHubKey`); `X-Hub-Key` header

---

### 3.7 Author Service

**Implementation:** `@agni/services/author`  
**Routes:** `routes/author.js` — validate, save, preview, delete lessons

Provides `listSavedLessons(yamlDir)` for pathfinder's lesson index and catalog drift detection.

---

### 3.8 Lesson Chain

**Implementation:** `@agni/services/lesson-chain`  
**Routes:** `routes/chain.js` — chain verification, fork check

Content hash chain for integrity; `rebuildLessonIndex` prunes old chain versions via `pruneAllChainVersions()`.

---

### 3.9 Sync

**File:** `packages/agni-hub/sync.js`  
**Entry:** `hub-tools/sync.js`  
**Transports:** Starlink (HTTP to home server), USB (sneakernet), LoRa

- **Export:** Packages anonymized events (re-pseudonymized with batch tokens), discovered cohort, sync metadata
- **Import:** Receives base-costs, curriculum, schedules, regional graph_weights; sanitizes and writes to `graph-weights-regional.json`, etc.
- **usbPath contract:** Must be under `/mnt/usb`; validated at startup and on config save

---

### 3.10 Mesh

**File:** `packages/agni-hub/mesh/index.js`  
**Transports:** UDP, LoRa (SX1276)

Broadcasts `graph_weights` advertisements; receives and merges edge deltas; writes `graph-weights-mesh.json`. Pathfinder consumes mesh graph when local/regional insufficient.

---

## 4. Shared Context (`ctx`)

The kernel assembles `ctx` in `shared.js` by merging:

| Source | Exports |
|--------|---------|
| `context/config` | PORT, MASTERY_THRESHOLD, MIN_RESIDUAL, MIN_MLC, MIN_CONFIDENCE, MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT, STUDENT_SESSION_TTL_MS |
| `context/data-paths` | DATA_DIR, SERVE_DIR, MASTERY_SUMMARY, BASE_COSTS, LESSON_INDEX, SCHEDULES, CURRICULUM_GRAPH, APPROVED_CATALOG, GRAPH_WEIGHTS_*, COHORT_ASSIGNMENTS, etc. |
| `context/services` | lmsService, governanceService, authorService, accountsService, lessonChain |
| `context/data-access` | loadMasterySummaryAsync, loadBaseCostsAsync, loadLessonIndexAsync, loadSchedulesAsync, loadCurriculumAsync, loadApprovedCatalogAsync, loadOverridesAsync, saveOverridesAsync, loadGroupsAsync, saveGroupsAsync, loadParentLinksAsync, saveParentLinksAsync, loadTelemetryEventsAsync, getStudentSkills |
| `context/auth` | requireAdmin, requireAuth, requireRole, adminOnly, authOnly, roleOnly, requireHubKey, requireLms, withRateLimit, requireParam, generateGroupId, generateInviteCode |
| `context/http` | readBody, handleJsonBody, createResponseSender, extractBearerToken, extractStudentSessionToken, getClientIp, getClientUserAgent, paginate, etc. |
| `shared.js` (inline) | pathfinderCache, fs, path, crypto, log |

Pathfinder injects business logic into `ctx`:
- `getLessonsSortedByPathfinder`, `getEffectiveGraphWeights`, `applyRecommendationOverride`, `getCollabOpportunities`

Route modules receive `(router, ctx)` and use `ctx` for data access, auth, and pathfinder helpers.

---

## 5. Route Inventory

| Route Module | Key Endpoints | Auth |
|--------------|---------------|------|
| `pathfinder` | GET /api/pathfinder, /api/pathfinder/all, /api/pathfinder/graph, GET /api/lessons, POST /api/pathfinder/override | Hub key, admin |
| `lms` | POST /api/lms/observation, GET /api/lms/status, GET /api/lms/select, POST /api/lms/federation/merge | Hub key |
| `governance` | GET /api/governance/report, /api/governance/policy, POST /api/governance/compliance | Hub key, admin |
| `author` | POST /api/author/validate, /api/author/save, /api/author/preview, DELETE /api/author/delete/:slug | Bearer (creator) |
| `accounts` | POST /api/auth/register, /api/auth/login, student verify-pin, claim | Various |
| `groups` | CRUD for student groups | Admin/auth |
| `parent` | GET /api/parent/children, /api/parent/child/:pseudoId/progress | Bearer |
| `student` | GET /api/student/streaks, POST /api/checkpoint, GET /api/diagnostic | Hub key |
| `collab` | Collaborative lesson discovery | Hub key |
| `admin` | GET/PUT /api/admin/config, POST /api/admin/sync-test | Admin |
| `chain` | GET /api/chain/:slug, POST /api/chain/verify, GET /api/fork-check | Hub key |
| `telemetry` | POST /api/telemetry | Hub key |
| `lti` | LTI 1.1 launch, grade passback | LTI secret |

---

## 6. Bootstrap and Configuration

### 6.1 Startup Order (Safety-Critical)

**All hub processes** (pathfinder, telemetry-engine, sync) **must** call `loadHubConfig()` before any code that `require('@agni/utils/env-config')`.

```javascript
const { loadHubConfig } = require('@agni/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));
// Now safe to require env-config and consumers
const envConfig = require('@agni/utils/env-config');
```

**Verification:** `npm run verify:hub-config-bootstrap`

Wrong order causes: wrong paths (ENOENT, data corruption), wrong ports (bind failures), wrong hubId (sync corruption), wrong usbPath (arbitrary write).

### 6.2 Config Sources

1. **hub-config.json** — Loaded by `loadHubConfig()`; writes to `process.env` for keys not already set
2. **Environment variables** — Override file values
3. **@agni/utils/env-config** — Canonical reader; all modules import from here

### 6.3 Key Config Items (Hub Kernel)

| Item | Env / hub-config | Default | Consumer |
|------|------------------|---------|----------|
| Pathfinder port | pathfinderPort / AGNI_PATHFINDER_PORT | 8082 | pathfinder server |
| Serve port | servePort / AGNI_SERVE_PORT | 8080 | lesson-server standalone |
| Telemetry port | telemetryEnginePort / AGNI_TELEMETRY_ENGINE_PORT | 8081 | telemetry-engine, theta forward |
| Data dir | dataDir / AGNI_DATA_DIR | ./data | All data files |
| Serve dir | serveDir / AGNI_SERVE_DIR | ./serve | Compiled lessons, lesson index |
| YAML dir | yamlDir / AGNI_YAML_DIR | {DATA_DIR}/yaml | Author, lesson-server |
| Hub API key | AGNI_HUB_API_KEY | (empty) | Protected endpoints; 503 when unset |
| Hub ID | hubId / AGNI_HUB_ID | hub-local | Sync, federation |
| Private key | privateKeyPath / AGNI_PRIVATE_KEY_PATH | (empty) | Lesson signing |
| Cache max bytes | AGNI_CACHE_MAX_BYTES | 0 | Lesson compile cache (Pi: 25e6) |
| Compile concurrency | AGNI_COMPILE_CONCURRENCY | 3 | Parallel compilations |
| Mastery threshold | AGNI_MASTERY_THRESHOLD | 0.6 | Theta, telemetry |
| Min local sample | AGNI_MIN_LOCAL_SAMPLE | 40 | Graph weight selection |
| Min local edges | AGNI_MIN_LOCAL_EDGES | 5 | Graph weight selection |

See `docs/CONFIGURATION.md` for full reference.

---

## 7. Data Flow — End-to-End

### 7.1 Lesson Request (Device → Hub)

1. Device requests `GET /lessons/:slug` (or `/shell/:slug` for PWA shell + `/lesson-data.js?slug=...`)
2. Lesson-server intercepts; `getRequestCompileOptions` extracts session → deviceId
3. `compileLesson` checks disk cache → memory cache → compiles (YAML → IR → HTML)
4. `assembleHtml` signs with deviceId when auth + private key; wraps in PWA shell
5. Response: HTML with inline lesson script, or 202 + Retry-After if queue full

### 7.2 Telemetry (Device → Hub → Graph)

1. Device completes lesson → `AGNI_TELEMETRY.record()` → POST to `hubBase + /api/telemetry`
2. Theta `routes/telemetry` updates mastery, LMS, SM-2; appends to telemetry-events.json
3. If forward enabled, theta POSTs to Telemetry Engine at `127.0.0.1:telemetryEnginePort/api/telemetry`
4. Telemetry Engine buffers, flushes to NDJSON, runs analysis → graph-weights.json
5. Pathfinder's `getEffectiveGraphWeights` reads graph; `computeLessonTheta` uses it for MLC ordering

### 7.3 Pathfinder Recommendation (Device → Hub)

1. Device requests `GET /api/pathfinder?pseudoId=...` with X-Hub-Key
2. `getLessonsSortedByPathfinder(pseudoId)` loads mastery, schedules, graph, catalog
3. Filters by catalog, governance (UTU), eligibility (skill graph + mastery)
4. Computes θ for each; applies frustration penalty; sorts; applies recommendation override
5. LMS `selectBestLesson` (if available) picks among top-K
6. Response: `{ lessons, precacheSlugs, graphWeights, ... }`

---

## 8. Process Topology

| Process | Entry | Port | When |
|---------|-------|------|------|
| Pathfinder | hub-tools/pathfinder.js, packages/agni-hub/pathfinder.js | 8082 | Always (main server) |
| Lesson Server | Attached to pathfinder | 8082 | Same process |
| Telemetry Engine | hub-tools/telemetry-engine.js, packages/agni-hub/telemetry-engine.js | 8081 | Optional (standalone); theta forwards when running |
| Sync | hub-tools/sync.js | — | Periodic/cron or manual |
| Mesh | packages/agni-hub/mesh/index.js | 18471 (UDP) | Optional |

**Typical Pi deployment:** Pathfinder (with lesson-server) always on; Telemetry Engine as separate process; Sync via cron; Mesh if LoRa/UDP graph sync needed.

---

## 9. Package Dependencies

```
@agni/hub (packages/agni-hub)
├── @agni/utils (hub-config, env-config, env-validate, ensure-paths, logger, router, json-store, http-helpers, crypto, csp, io, file-lock)
├── @agni/services (lms, governance, author, accounts, lesson-chain, lesson-assembly)
├── @agni/engine (sm2, Rasch, Thompson, etc. via LMS)
├── @agni/governance (policy evaluation)
├── @ols/compiler (buildLessonIR, buildLessonSidecar, services/compiler, lesson-assembly)
├── @ols/schema (lesson-schema)
└── @agni/runtime (RUNTIME_ROOT, factory-loader, player, step-renderers)
```

---

## 10. Extension Points

| Goal | Location |
|------|----------|
| Add new API endpoint | Create `routes/<name>.js` with `register(router, ctx)`; require in pathfinder.js `startApi` |
| Change theta ordering | `pathfinder.js`: computeLessonOrder, computeLessonTheta, getResidualCostFactor |
| Change graph selection | `pathfinder.js`: getEffectiveGraphWeights |
| Change lesson compile pipeline | `lesson-server/compile.js`, `lesson-server/assemble.js` |
| Change telemetry analysis | `telemetry-engine-analysis.js` |
| Add new service | `context/services.js`; wire into ctx |
| Add new data file | `context/data-paths.js`; accessors in `context/data-access.js` if needed |

---

## 11. Invariants and Guarantees

| Invariant | Implementation |
|-----------|----------------|
| Hub-config before env-config | loadHubConfig() first line in pathfinder, telemetry-engine, sync |
| Lesson index from IR only | rebuildLessonIndex reads index-ir.json; no HTML scraping |
| Graph weights affect MLC only, never eligibility | Eligibility from ontology + mastery; graph weights influence θ sort |
| Compiled lesson cache | Disk + memory; mtime check; concurrency cap; 202 on overflow |
| usbPath under /mnt/usb | env-config validUsbPath; sync startup; admin config save |
| Session IP binding | validateStudentSession checks clientIp on lesson delivery |

---

## 12. Data Files and Layout

| File / Dir | Location | Role |
|------------|----------|------|
| mastery-summary.json | data/ | Skill levels per pseudoId; updated by telemetry routes |
| lesson-index.json | data/ | Built by rebuildLessonIndex from IR sidecars |
| graph-weights.json | data/ | Main cohort skill-transfer graph (Telemetry Engine output) |
| graph-weights-pending.json | data/ | Pending review when edge delta exceeds threshold |
| graph-weights-regional.json | data/ | From sync import |
| graph-weights-mesh.json | data/ | From mesh receive |
| cohort-assignments.json | data/ | pseudoId → cohortId for per-cohort graphs |
| base-costs.json | data/ | Skill base costs for MLC |
| curriculum.json | data/ | curriculum.graph (skill prerequisites) |
| schedules.json | data/ | students: { pseudoId: [skillIds] } |
| review-schedule.json | data/ | SM-2 intervals per student/lesson |
| approved-catalog.json | data/ | lessonIds whitelist; governance |
| governance-policy.json | data/ | UTU targets, enforceUtuTargets |
| recommendation-overrides.json | data/ | Admin override: pseudoId → lessonId |
| groups.json | data/ | Student groups |
| parent-links.json | data/ | Parent-child links |
| telemetry-events.json | data/ | Rolling window (10k) for theta |
| events/YYYY-MM-DD.ndjson | data/events/ | Telemetry Engine event log |
| serve/lessons/{slug}/ | serve/ | index.html, index-ir.json, index-ir-full.json |
| catalog.json | serve/ | Optional; lesson list for index rebuild |

---

## 13. File Structure (packages/agni-hub)

```
packages/agni-hub/
├── pathfinder.js          # Main server, theta logic, route registration
├── lesson-server.js       # On-demand compile, attachRoutes
├── telemetry-engine.js    # Standalone telemetry receiver/analyser
├── sync.js                # Hub-to-hub sync (Starlink, USB, LoRa)
├── shared.js              # ctx assembly
├── gc-disk-lessons.js     # Orphan lesson dir pruning (P2-20)
├── collab-sessions.js     # Collaborative lesson session state
├── index.js               # Package exports (pathfinder, theta, telemetryEngine, sync, mesh, ...)
├── manifest.json          # PWA manifest
├── sw.js                  # Service Worker (ES5)
├── context/
│   ├── config.js          # PORT, MASTERY_THRESHOLD, etc.
│   ├── data-paths.js      # Path constants
│   ├── data-access.js     # load*/save* async functions
│   ├── services.js        # lms, governance, author, accounts, lessonChain
│   ├── auth.js            # requireHubKey, adminOnly, etc.
│   └── http.js            # handleJsonBody, paginate, etc.
├── lesson-server/
│   ├── compile.js         # YAML load, IR build, cache, in-flight guard
│   ├── cache.js           # Disk + memory LRU, compile slots
│   ├── assemble.js        # HTML assembly, device binding, PWA shell
│   ├── route-handlers.js  # HTTP routing for /lessons/, /factories/, etc.
│   ├── serve-assets.js    # Static file serving, whitelists
│   ├── factory-manifest.js# Hub-signed factory manifest
│   ├── constants.js       # RUNTIME_VERSION, BASE_FACTORY_DEPS
│   └── ...
├── routes/
│   ├── pathfinder.js
│   ├── lms.js
│   ├── governance.js
│   ├── author.js
│   ├── accounts.js
│   ├── groups.js
│   ├── parent.js
│   ├── student.js
│   ├── collab.js
│   ├── admin.js
│   ├── chain.js
│   ├── telemetry.js
│   └── lti.js
├── pwa/
│   ├── shell.html         # PWA app shell
│   ├── shared.js
│   ├── shell-boot.js
│   ├── precache.js
│   └── library.html
├── mesh/
│   ├── index.js
│   ├── protocol.js
│   ├── transports.js
│   ├── peer-table.js
│   ├── merge.js
│   ├── chunked.js
│   └── lora-hal.js
└── telemetry-engine-analysis.js  # Pure analysis (validateEvent, processOneEvent, discoverCohort, computeEdgesFromGlobalPairs)
```

**Naming note:** `theta` and `pathfinder` are aliases; both refer to `pathfinder.js`. Theta is the historical name for the adaptive scheduling engine.

---

## 14. Related Documents

- **Architecture:** `docs/ARCHITECTURE.md` — System overview, compiler, IR, security
- **Telemetry:** `docs/TELEMETRY-ARCHITECTURE.md` — Sentry/Telemetry Engine detail
- **Configuration:** `docs/CONFIGURATION.md` — Env vars, bootstrap
- **Run Environments:** `docs/RUN-ENVIRONMENTS.md` — Edge (ES5), Hub (Pi)
- **Verification:** `docs/VERIFICATION-GUARDS.md` — CI, verify:hub
- **AGENTS.md** — Canonical package layout, AGNI overview
