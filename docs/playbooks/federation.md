# Federation and Sync Deployment

This playbook documents **sync contracts** and **graph_weights deployment** so operators and future schema-driven sync have a single reference. See also **`docs/playbooks/sentry.md`** for how graph_weights are produced (Sentry → analysis → graph_weights.json).

---

## 1. Overview

| Piece | Role |
|-------|------|
| **Village hub** | Runs theta, hub-transform, Sentry (optional). Holds local `data/` (lesson_index, mastery_summary, graph_weights.json, lms_state.json, events/). |
| **packages/agni-hub/sync.js** (run via `node hub-tools/sync.js`) | Outbound: packages events and sends to home server (Starlink) or writes to USB. Inbound: imports file with costs, graph_weights, curriculum, schedules. |
| **Home server** | Receives POST /api/hub-sync from village hubs; may return acknowledgments or errors. Optional: sends inbound update files back (USB or API). |
| **graph_weights** | Local: `data/graph_weights.json` (Sentry output). Regional: `data/graph_weights_regional.json` (from sync import or manual drop). Theta uses **`getEffectiveGraphWeights()`** (see sentry.md §3.1). |

---

## 2. Outbound Sync Contract (Village → Home)

### 2.1 When Sync Runs

- **CLI:** `node hub-tools/sync.js` (or with `--transport=starlink --home-url=<url>` / `--transport=usb --usb-path=<path>`).
- **Inputs:** `AGNI_DATA_DIR/events/*.ndjson` (unsynced files), optional `AGNI_HUB_ID`, `AGNI_HOME_URL` (Starlink), `AGNI_USB_PATH` (sneakernet). **hubId must be unique per hub** — duplicate IDs corrupt sync attribution and USB filenames.

### 2.2 Package Shape (buildPackage)

Sync builds a single JSON package:

```json
{
  "schemaVersion": "1.7.0",
  "hubId": "string",
  "packageId": "pkg-<timestamp>-<hex>",
  "createdAt": "ISO8601",
  "syncTimestamp": "number (ms since epoch, for hub clock sync)",
  "eventCount": "number",
  "cohortSize": "number",
  "discovered_cohort": "string | null",
  "events": [
    {
      "batchToken": "string",
      "lessonId": "string",
      "lessonVersion": "string",
      "difficulty": "number",
      "language": "string",
      "skillsRequired": ["string"],
      "skillsProvided": ["object"],
      "mastery": "number",
      "steps": [{ "stepId", "type", "weight", "score", "passed", "skipped", "attempts" }],
      "completedDate": "date | null"
    }
  ]
}
```

- **Re-pseudonymization:** Village `pseudoId` values are replaced by `batchToken` so the home server cannot link back to village identities.
- **discovered_cohort:** From `data/graph_weights.json` if present (`discovered_cohort` field); otherwise null.

### 2.3 Starlink Transport

- **Endpoint:** `POST <HOME_URL>/api/hub-sync`
- **Headers:** `Content-Type: application/json`, `X-AGNI-Hub-ID`, `X-AGNI-Version: 1.7.0`
- **Body:** The package JSON above.
- **Expected response:** HTTP 2xx; body may be `{ "accepted": number }` or any JSON. Non-2xx or timeout is treated as failure; synced files are not marked until success.

### 2.4 USB / Sneakernet Transport

- **Output:** Writes one file per run to `AGNI_USB_PATH`: `sync_<hubId>_<date>_<packageId>.json` (same package shape).
- Operator carries the file to a machine that can run **inbound import** (see §3).

---

## 3. Inbound Import Contract (Home → Village)

Used when the village hub receives an update file (e.g. from USB or a download). Run:

```bash
node hub-tools/sync.js --import=/path/to/inbound.json
```

### 3.1 Inbound File Shape

The importer expects a JSON object with optional top-level keys:

| Key | Type | Effect |
|-----|------|--------|
| **costs** | `object` (skillId → number) | Merged into `data/base_costs.json`. Existing keys are preserved; incoming keys overwrite or add. |
| **graph_weights** | `object` with `level`, `edges` | If `level` is not `'village'` and `edges` is a non-empty array, written to `data/graph_weights_<level>.json` (e.g. regional → `graph_weights_regional.json`). Theta will use it when local graph has insufficient data (see sentry.md §3.1). |
| **curriculum** | `object` with `graph` | Written to `data/curriculum.json`. `graph` is skill → array of prerequisite skill ids. |
| **schedules** | `object` with `students` | Written to `data/schedules.json`. `students` is pseudoId → array of skill ids (scheduled for that student). |
| **syncTimestamp** | `number` (ms since epoch) | When `AGNI_SYNC_SET_CLOCK=1` on Linux, hub runs `date -s` to set system clock from this value. Used for Pi without RTC. See `docs/RUN-ENVIRONMENTS.md`. |

**Constraints:** File size cap ~10 MB. Invalid JSON or missing keys are skipped (no partial wipe).

### 3.2 graph_weights Schema

Inbound `graph_weights` should conform to **`schemas/graph_weights.schema.json`** so theta and any validator can rely on it. Required fields include `version`, `edges` (each with `from`, `to`, `weight`, `confidence`), `level`, `sample_size`, etc. See the schema and **`docs/playbooks/sentry.md`** for the full shape.

---

## 4. Deployment Topology

1. **Village hub:** One or more devices run theta + hub-transform (and optionally Sentry). YAML lessons and `data/` live here. Students hit the hub for lessons and (if used) telemetry is sent to Sentry.
2. **Sync (outbound):** Cron or manual run of `sync.js` with Starlink or USB. Events and cohort id are sent or written to USB.
3. **Home server:** Receives POST /api/hub-sync; stores or processes events; may produce regional graph_weights, base_costs, curriculum, or schedules.
4. **Inbound (optional):** Operator gets an inbound JSON (from home or manual build) and runs `sync.js --import=...` on the village hub to update base_costs, graph_weights_regional, curriculum, schedules.

**LMS federation (separate from sync):** Bandit summary merge uses **POST /api/lms/federation/merge** (see `docs/api-contract.md`). That is progress/state sync, not event/graph sync. Sneakernet progress export/import is **`npm run sneakernet`** (see `docs/ARCHITECTURE.md`).

**Federation contract:** All hubs that merge bandit summaries **must** use the same `AGNI_EMBEDDING_DIM`. The `BanditSummary` includes `embeddingDim`; merge rejects summaries with a different value. This is an enforced runtime contract, not an assumption — deploy identical config on all federating nodes.

**Node version pinning (Pi deployments):** Sync deduplication uses a content hash (`syncId`) of the bandit summary. The hash is derived from `JSON.stringify` of float arrays; different Node versions can serialize the same IEEE 754 double differently (e.g. last digit), producing different hashes for identical summaries. Two hubs on different Node versions would fail to deduplicate — duplicate syncs would double-count silently. **Pin the same Node version on all federating hubs** for federation correctness, not just API compatibility.

---

## 5. Where to Change What

| Goal | File(s) |
|------|--------|
| Change outbound package shape | `packages/agni-hub/sync.js`: buildPackage, repseudonymize |
| Change Starlink URL or headers | `packages/agni-hub/sync.js`: sendViaStarlink, HOME_URL, HUB_ID |
| Change inbound import logic | `packages/agni-hub/sync.js`: importInbound |
| Change theta’s graph selection | `packages/agni-hub/theta.js`: getEffectiveGraphWeights |
| Validate graph_weights shape | `schemas/graph_weights.schema.json`; CI or manual ajv validate |

---

## 6. References

- **Sentry → graph_weights:** `docs/playbooks/sentry.md`
- **Hub API (theta, LMS, governance):** `docs/api-contract.md`
- **Graph weights schema:** `schemas/graph_weights.schema.json`
