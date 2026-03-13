# AGNI Configuration Reference

Single reference for hub configuration: environment variables, defaults, bootstrap order, and `hub-config.json`. The canonical implementation lives in `packages/agni-utils/env-config.js` and `packages/agni-utils/hub-config.js`. For the split between env-config and env-validate (and any range discrepancies), see `docs/ENV-VALIDATION-SPLIT.md`.

---

## Bootstrap Order (Safety-Critical)

**Hub processes (theta, sentry, sync) must call `loadHubConfig()` before any code that `require('@agni/utils/env-config')`.** Wrong order causes:

- Wrong paths → ENOENT or data corruption
- Wrong ports → bind failures or exposure
- Wrong `hubId` → sync attribution corruption
- Wrong `usbPath` → arbitrary file write (security risk)

### Correct Startup Sequence

```javascript
// 1. Load hub-config.json first (populates process.env)
const { loadHubConfig } = require('@agni/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));

// 2. Then require env-config and other modules
const envConfig = require('@agni/utils/env-config');
```

**Verification:** `npm run verify:hub-config-bootstrap` enforces this for theta, sentry, and sync.

### Config Sources (Precedence)

1. **`hub-config.json`** — Loaded by `loadHubConfig()`, writes to `process.env` only for keys not already set
2. **Environment variables** — Override file values when set (e.g. `AGNI_DATA_DIR=/opt/agni/data`)
3. **`@agni/utils/env-config`** — Canonical reader; all modules import from here, never parse `process.env` inline

### Pi Deployment

- Use `data/hub-config.pi.json` as template
- Copy to `data/hub-config.json` or set `AGNI_DATA_DIR` to a directory containing `hub-config.json`
- Run `npm run verify:hub-config-pi` to validate
- See `docs/RUN-ENVIRONMENTS.md` and `docs/DEPLOYMENT.md` for full setup

---

## hub-config.json Keys

These JSON keys in `hub-config.json` map to the env vars below (via `loadHubConfig`). Env vars take precedence.

| JSON key | Env var |
|----------|---------|
| `dataDir` | `AGNI_DATA_DIR` |
| `serveDir` | `AGNI_SERVE_DIR` |
| `yamlDir` | `AGNI_YAML_DIR` |
| `factoryDir` | `AGNI_FACTORY_DIR` |
| `katexDir` | `AGNI_KATEX_DIR` |
| `thetaPort` | `AGNI_THETA_PORT` |
| `servePort` | `AGNI_SERVE_PORT` |
| `sentryPort` | `AGNI_SENTRY_PORT` |
| `hubId` | `AGNI_HUB_ID` |
| `homeUrl` | `AGNI_HOME_URL` |
| `usbPath` | `AGNI_USB_PATH` |
| `embeddingDim` | `AGNI_EMBEDDING_DIM` |
| `forgetting` | `AGNI_FORGETTING` |
| `maxStudents` | `AGNI_MAX_STUDENTS` |
| `maxLessons` | `AGNI_MAX_LESSONS` |
| `topKCandidates` | `AGNI_TOP_K_CANDIDATES` |
| `minLocalSample` | `AGNI_MIN_LOCAL_SAMPLE` |
| `minLocalEdges` | `AGNI_MIN_LOCAL_EDGES` |
| `approvedCatalog` | `AGNI_APPROVED_CATALOG` |
| `cacheMax` | `AGNI_CACHE_MAX` |
| `cacheMaxBytes` | `AGNI_CACHE_MAX_BYTES` |
| `compileConcurrency` | `AGNI_COMPILE_CONCURRENCY` |
| `syncTransport` | `AGNI_SYNC_TRANSPORT` |
| `privateKeyPath` | `AGNI_PRIVATE_KEY_PATH` |

---

## Environment Variables Reference

### Paths

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_DATA_DIR` | `./data` (relative to package root) | Student data, mastery, groups, sessions, LMS state |
| `AGNI_YAML_DIR` | `{DATA_DIR}/yaml` | Lesson YAML source files |
| `AGNI_SERVE_DIR` | `./serve` | Compiled lesson output, lesson index |
| `AGNI_FACTORY_DIR` | `./factories` | Runtime factory scripts (shared-runtime, svg-stage, etc.) |
| `AGNI_KATEX_DIR` | `./data/katex-css` | KaTeX CSS subset files |
| `AGNI_APPROVED_CATALOG` | `{DATA_DIR}/approved-catalog.json` | Approved lesson catalog |
| `AGNI_APPROVED_CATALOG_SCHEMA` | `schemas/approved-catalog.schema.json` | Catalog schema |
| `AGNI_GOVERNANCE_POLICY` | `{DATA_DIR}/governance-policy.json` | Governance policy |
| `AGNI_GOVERNANCE_POLICY_SCHEMA` | `schemas/governance-policy.schema.json` | Policy schema |
| `AGNI_UTU_CONSTANTS` | `{DATA_DIR}/utu-constants.json` | UTU spine IDs |

### Ports

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `AGNI_THETA_PORT` | `8082` | 1–65535 | Main hub API (theta) |
| `AGNI_SERVE_PORT` | `8080` | 1–65535 | Static files, PWA, lesson delivery |
| `AGNI_SENTRY_PORT` | `8081` | 1–65535 | Telemetry receiver |

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_HUB_API_KEY` | *(empty)* | **Required for protected endpoints.** Shared secret for device→hub auth. When set, theta/telemetry/checkpoint/chain etc. require `X-Hub-Key` header; when unset, those endpoints return 503. |
| `AGNI_HUB_ID` | `hub-local` | Unique per hub; required for federation/sync attribution |
| `AGNI_CORS_ORIGIN` | `*` | CORS origin for API responses |
| `AGNI_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `AGNI_PRIVATE_KEY_PATH` | *(empty)* | Ed25519 private key for signing lessons; empty = no signing |

### Compilation & Cache (hub-transform)

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_CACHE_MAX` | `100` | Max in-memory lesson cache entries (LRU) when cacheMaxBytes not set |
| `AGNI_CACHE_MAX_BYTES` | `0` | Max in-memory cache bytes (LRU by bytes). When set, overrides count-based eviction. Pi: 26214400 (25 MB) recommended |
| `AGNI_COMPILE_CONCURRENCY` | `3` | Max parallel compilations; use `1` for Pi 3 (1GB), `2` for Pi 4 (2GB) |
| `AGNI_COMPILE_RETRY_AFTER` | `3` | Seconds in Retry-After when queue full (202 response) |

### LMS Engine

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `AGNI_EMBEDDING_DIM` | `16` | 1–1024 | Embedding vector dimension |
| `AGNI_FORGETTING` | `0.98` | 0.9–1 | Embedding decay factor |
| `AGNI_EMBEDDING_LR` | `0.01` | — | Embedding learning rate |
| `AGNI_EMBEDDING_REG` | `0.001` | — | Embedding regularization |
| `AGNI_MAX_STUDENTS` | `0` | — | Cap (0 = unlimited) |
| `AGNI_MAX_LESSONS` | `0` | — | Cap (0 = unlimited) |
| `AGNI_TOP_K_CANDIDATES` | `500` | 1–2000 | Max lessons in bandit selection |
| `AGNI_MASTERY_THRESHOLD` | `0.6` | 0–1 | Skill mastery cutoff |
| `AGNI_MIN_LOCAL_SAMPLE` | `40` | — | Min observations for local graph |
| `AGNI_MIN_LOCAL_EDGES` | `5` | — | Min edges for graph |
| `AGNI_MARKOV_WEIGHT` | `0.15` | — | Markov weight in scoring |
| `AGNI_PAGERANK_WEIGHT` | `0.10` | — | PageRank weight in scoring |

### Sync & Federation

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_SYNC_TRANSPORT` | *(empty)* | `starlink`, `usb`, `lora`, or empty |
| `AGNI_HOME_URL` | *(empty)* | Home server URL (Starlink sync) |
| `AGNI_USB_PATH` | *(empty)* | Must be under `/mnt/usb` (see usbPath contract) |
| `AGNI_SYNC_SET_CLOCK` | `0` | Set `1` to allow sync to set system clock from `syncTimestamp` (Linux only) |

### Mesh (LoRa graph_weights sync)

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_MESH_TRANSPORT` | `udp` | `stub`, `udp`, or `lora` |
| `AGNI_MESH_PORT` | `18471` | UDP port (for `udp` transport) |
| `AGNI_LORA_SPI_BUS` | `0` | SPI bus (SX1276 HAL) |
| `AGNI_LORA_SPI_DEVICE` | `0` | SPI device (SX1276 HAL) |
| `AGNI_LORA_RESET_PIN` | `24` | GPIO reset pin |
| `AGNI_LORA_DIO0_PIN` | `25` | GPIO DIO0 pin |
| `AGNI_LORA_FREQUENCY` | `868000000` | Frequency in Hz (868e6, 915e6) |

### Sentry (Telemetry)

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_ANALYSE_AFTER` | `50` | Events before triggering analysis |
| `AGNI_ANALYSE_CRON` | `02:00` | Scheduled analysis time |
| `AGNI_SENTRY_RETENTION_DAYS` | `90` | Days to keep NDJSON before pruning |
| `AGNI_SENTRY_MIN_VALID_YEAR` | `2020` | Reject writes when system year < this (Pi without RTC) |
| `AGNI_SENTRY_CHI2_THRESHOLD` | `3.841` | Chi-squared threshold |
| `AGNI_SENTRY_MIN_SAMPLE` | `20` | Min sample for analysis |
| `AGNI_SENTRY_JACCARD_THRESHOLD` | `0.5` | Jaccard threshold (0–1) |
| `AGNI_SENTRY_MIN_CLUSTER_SIZE` | `20` | Min cluster size |
| `AGNI_SENTRY_FORWARD` | `true` | Set `false` to disable forward |
| `AGNI_SENTRY_WEIGHT_MAX_DELTA` | `0.2` | Max weight delta (0.01–1) |
| `AGNI_SENTRY_WEIGHT_REVIEW_THRESHOLD` | `0.3` | Review threshold (0.1–1) |

### Security & Misc

| Variable | Default | Description |
|----------|---------|-------------|
| `AGNI_YAML_MAX_BYTES` | `2097152` (2MB) | Max YAML file size before parse |
| `AGNI_STRICT_SKILL_GRAPH` | *(unset)* | Set `1` to throw on skill graph cycles (default: graceful degrade) |
| `AGNI_PRECACHE_HINT_COUNT` | `5` | Hint for opportunistic precache |
| `NODE_OPTIONS` | — | Hub start sets `--max-old-space-size=512` to prevent OOM (see `hub-tools/theta.js`) |

---

## usbPath Contract (Arbitrary-Write Guard)

Wrong `AGNI_USB_PATH` could allow sync to write anywhere. Enforcement:

- **Allowed prefix:** `/mnt/usb` (resolved via `path.resolve`)
- **Validation:** env-config at load; sync.js at startup; admin API on config save
- **Rejection:** Throws at startup or returns 400 with error message

---

## hub-transform Standalone

When hub-transform runs as a separate process (not attached to theta), the caller must ensure `loadHubConfig()` runs before hub-transform loads env-config, or set env vars explicitly. Theta attaches hub-transform after its bootstrap, so normal deployment is safe.

---

## See Also

- **Architecture §3.3:** `docs/ARCHITECTURE.md` (config item → reader table)
- **Deployment:** `docs/DEPLOYMENT.md`
- **Run environments:** `docs/RUN-ENVIRONMENTS.md`
- **Pi config template:** `data/hub-config.pi.json`
