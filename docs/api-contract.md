# AGNI Hub API Contract

All HTTP endpoints served by `hub-tools/theta.js` follow this contract.

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
| GET | `/api/theta?pseudoId=` | No | Get sorted lessons for a student |
| GET | `/api/theta/all` | No | All students' theta rankings (paginated) |
| GET | `/api/theta/graph` | No | Effective graph weights |
| GET | `/api/lessons` | No | Lesson index with filters (paginated) |
| POST | `/api/theta/override` | No | Pin/clear a lesson override for a student |

### Telemetry

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/telemetry` | No | Submit learning events |

### LMS (Bandit / IRT Engine)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/lms/select?pseudoId=` | No | Bandit lesson selection |
| POST | `/api/lms/observation` | No | Record an observation |
| GET | `/api/lms/status` | No | Engine status |
| POST | `/api/lms/federation/merge` | No | Merge remote bandit summary |
| GET | `/api/lms/transitions` | No | Markov transition table |
| GET | `/api/lms/bottlenecks` | No | Flow bottleneck analysis |

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
| POST | `/api/accounts/student/transfer-token` | No | Generate transfer token |
| POST | `/api/accounts/student/claim` | No | Claim transfer token |
| POST | `/api/accounts/student/verify-pin` | No | Verify student PIN |

### Governance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/governance/report` | No | Compliance report |
| GET | `/api/governance/policy` | No | Current policy |
| PUT | `/api/governance/policy` | Admin | Update policy |
| GET | `/api/governance/catalog` | No | Approved lesson catalog |
| POST | `/api/governance/catalog` | Admin | Update catalog |
| POST | `/api/governance/catalog/import` | Admin | Import catalog from authority |
| GET | `/api/governance/utu-constants` | No | UTU classification constants |
| POST | `/api/governance/compliance` | No | Evaluate compliance for lessons |

### Author

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/author/load/:slug` | No | Load a saved lesson |
| POST | `/api/author/validate` | No | Validate lesson YAML/JSON |
| POST | `/api/author/save` | No | Save a lesson |
| DELETE | `/api/author/delete/:slug` | Admin | Delete a lesson |
| POST | `/api/author/preview` | No | Preview-compile a lesson |

### Groups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/groups` | No | List groups |
| POST | `/api/groups` | No | Create a group (201) |
| PUT | `/api/groups` | No | Update a group |
| POST | `/api/groups/:id/assign` | No | Assign lessons to students in a group |

### Parent Portal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/parent/invite` | No | Generate invite code (201 if new) |
| POST | `/api/parent/link` | No | Link parent to student (201 if new) |
| GET | `/api/parent/child/:pseudoId/progress` | No | Child progress summary |
| GET | `/api/parent/children?parentId=` | No | List linked children |

### Student Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/step-analytics?lessonId=` | No | Per-step analytics |
| GET | `/api/mastery-history?pseudoId=` | No | Mastery snapshots over time |
| GET | `/api/skill-graph` | No | Skill dependency graph |
| GET | `/api/reviews?pseudoId=` | No | Spaced repetition review schedule |
| GET | `/api/streaks?pseudoId=` | No | Learning streak data |
| GET | `/api/badges?pseudoId=` | No | Earned badges |
| GET | `/api/diagnostic` | No | Diagnostic probes |
| POST | `/api/diagnostic` | No | Submit diagnostic responses |
| GET | `/api/learning-paths` | No | List learning paths |
| GET | `/api/learning-paths/:id` | No | Get a specific learning path |
| POST | `/api/learning-paths` | No | Create a learning path (201) |
| PUT | `/api/learning-paths` | No | Update a learning path |
| GET | `/api/collab/stats` | No | Collaboration statistics |

### Content Chain

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/chain/:slug` | No | Content hash chain for a lesson |
| POST | `/api/chain/verify` | No | Verify chain integrity |
| GET | `/api/fork-check?slug=` | No | Fork/license eligibility check |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/onboarding-status` | No | First-run check |
| GET | `/api/admin/config` | Admin | Current hub configuration |
| PUT | `/api/admin/config` | Admin | Update hub configuration |
| POST | `/api/admin/sync-test` | No | Test sync connectivity |
