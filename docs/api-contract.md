# AGNI Hub API Contract

All HTTP endpoints served by `@agni/hub` (packages/agni-hub/theta.js) follow this contract. Run via `node hub-tools/theta.js` (wrapper) or `node packages/agni-hub/theta.js`.

## Response Envelope

### Success (2xx)

```json
{
  "ok": true,
  ...domain fields
}
```

Mutating endpoints (`POST`, `PUT`, `DELETE`) include `"ok": true`.
Read-only `GET` endpoints return domain data directly (no `ok` field).

Status codes:
- **200** — read, update, or action processed
- **201** — new resource created (`POST /api/groups`, `POST /api/accounts/student`, etc.)

### Error (4xx / 5xx)

```json
{
  "error": "Human-readable message"
}
```

Every non-2xx response uses this shape. Additional context fields (`code`, `details`)
may appear alongside `error` but callers should always check `body.error` first.

Status codes:
- **400** — bad request (missing or invalid parameters)
- **401** — authentication required or invalid token
- **403** — forbidden (authenticated but insufficient permissions)
- **404** — resource not found
- **405** — method not allowed on this path
- **429** — rate limited (includes `retryAfterMs`)
- **500** — internal server error
- **503** — service unavailable (engine not loaded)

## Common Headers

Every response includes:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Request-Id` | Unique request identifier (e.g. `req-mm6na527-0ed8cfa7`) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |

Responses larger than 1 KB are gzip-compressed when the client sends `Accept-Encoding: gzip`.

## Pagination

List endpoints accept optional query parameters:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | all items (max 1000) | Number of items per page |
| `offset` | int | 0 | Number of items to skip |

Paginated responses include:

```json
{
  "items_field": [...],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

Paginated endpoints: `GET /api/lessons`, `GET /api/theta/all`, `GET /api/accounts/students`.

## Endpoints

### System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check. Returns `{ status, uptime, version }` |

### Theta (Adaptive Scheduling)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/theta?pseudoId=` | HubKey | Get sorted lessons for a student |
| GET | `/api/theta/all` | Admin | All students' theta rankings (paginated) |
| GET | `/api/theta/graph` | HubKey | Effective graph weights |
| GET | `/api/lessons` | HubKey | Lesson index with filters (paginated) |
| POST | `/api/theta/override` | Admin | Pin/clear a lesson override for a student |

### Telemetry

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/telemetry` | HubKey | Submit learning events |

### LMS (Bandit / IRT Engine)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lms/select?pseudoId=` | HubKey | Bandit lesson selection |
| POST | `/api/lms/observation` | HubKey | Record an observation |
| GET | `/api/lms/status` | HubKey | Engine status |
| GET | `/api/lms/explain?pseudoId=&lessonId=&candidates=` | HubKey | Selection breakdown (candidates optional; from theta if omitted) |
| POST | `/api/lms/federation/merge` | Admin | Merge remote bandit summary |
| GET | `/api/lms/transitions` | HubKey | Markov transition table |
| GET | `/api/lms/bottlenecks` | HubKey | Flow bottleneck analysis |

### Accounts & Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register a creator (201) |
| POST | `/api/auth/login` | No | Log in |
| GET | `/api/auth/me` | Bearer | Current session info |
| POST | `/api/auth/logout` | Bearer | Destroy session |
| GET | `/api/accounts/creators` | Admin | List creators |
| PUT | `/api/accounts/creator/approve` | Admin | Approve/reject a creator |
| POST | `/api/accounts/student` | Admin | Create a student (201) |
| POST | `/api/accounts/students/bulk` | Admin | Bulk create students (201) |
| GET | `/api/accounts/students` | Admin | List students (paginated) |
| PUT | `/api/accounts/student` | Admin | Update a student |
| POST | `/api/accounts/student/transfer-token` | Admin | Generate transfer token |
| POST | `/api/accounts/student/claim` | No | Claim transfer token |
| POST | `/api/accounts/student/verify-pin` | No | Verify student PIN |

### Governance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/governance/report` | Bearer | Compliance report |
| GET | `/api/governance/policy` | Bearer | Current policy |
| PUT | `/api/governance/policy` | Admin | Update policy |
| GET | `/api/governance/catalog` | Bearer | Approved lesson catalog |
| POST | `/api/governance/catalog` | Admin | Update catalog |
| POST | `/api/governance/catalog/import` | Admin | Import catalog from authority |
| GET | `/api/governance/utu-constants` | Bearer | UTU classification constants |
| POST | `/api/governance/compliance` | Bearer | Evaluate compliance for lessons |

### Author

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/author/load/:slug` | Bearer | Load a saved lesson |
| POST | `/api/author/validate` | Bearer | Validate lesson YAML/JSON |
| POST | `/api/author/save` | Bearer | Save a lesson |
| DELETE | `/api/author/delete/:slug` | Admin | Delete a lesson |
| POST | `/api/author/preview` | Bearer | Preview-compile a lesson |

### Groups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/groups` | Admin | List groups |
| POST | `/api/groups` | Admin | Create a group (201) |
| PUT | `/api/groups` | Admin | Update a group |
| POST | `/api/groups/:id/assign` | Admin | Assign lessons to students in a group |

### Parent Portal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/parent/invite` | Admin | Generate invite code (201 if new) |
| POST | `/api/parent/link` | HubKey | Link parent to student (201 if new) |
| GET | `/api/parent/child/:pseudoId/progress` | HubKey | Child progress summary |
| GET | `/api/parent/children?parentId=` | HubKey | List linked children |

### Student Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/step-analytics?lessonId=` | HubKey | Per-step analytics |
| GET | `/api/mastery-history?pseudoId=` | HubKey | Mastery snapshots over time |
| GET | `/api/skill-graph` | HubKey | Skill dependency graph |
| GET | `/api/reviews?pseudoId=` | HubKey | Spaced repetition review schedule |
| GET | `/api/streaks?pseudoId=` | HubKey | Learning streak data |
| GET | `/api/badges?pseudoId=` | HubKey | Earned badges |
| GET | `/api/diagnostic` | HubKey | Diagnostic probes |
| POST | `/api/diagnostic` | HubKey | Submit diagnostic responses |
| GET | `/api/learning-paths` | HubKey | List learning paths |
| GET | `/api/learning-paths/:id` | HubKey | Get a specific learning path |
| POST | `/api/learning-paths` | Admin | Create a learning path (201) |
| PUT | `/api/learning-paths` | Admin | Update a learning path |
| GET | `/api/collab/stats` | HubKey | Collaboration statistics |

### Content Chain

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/chain/:slug` | HubKey | Content hash chain for a lesson |
| POST | `/api/chain/verify` | HubKey | Verify chain integrity |
| GET | `/api/fork-check?slug=` | HubKey | Fork/license eligibility check |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/onboarding-status` | No | First-run check (intentionally unauthenticated for first-run detection) |
| GET | `/api/admin/config` | Admin | Current hub configuration |
| PUT | `/api/admin/config` | Admin | Update hub configuration |
| POST | `/api/admin/sync-test` | Admin | Test sync connectivity |
