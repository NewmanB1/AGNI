# Collaborative Lessons — Playbook

Use this when changing the collaborative lesson flow: discovery, beacon, seek/match, teacher deny.

---

## Overview

When two or more students have completed prerequisites for a skill and a collaborative lesson (`is_group: true`) exists, AGNI:

1. Prompts each eligible student in the library
2. Students find each other via a beacon sound
3. Both press "I'm ready" → hub matches them → lesson launches
4. Teacher sees active sessions and can deny

---

## Where to Change What

| Goal | Location |
|------|----------|
| Collab opportunities logic (eligibility, peer count) | `packages/agni-hub/pathfinder.js` — `getCollabOpportunities()` |
| Session state (seeks, matching, deny) | `packages/agni-hub/collab-sessions.js` |
| Collab HTTP endpoints | `packages/agni-hub/routes/collab.js` |
| Beacon sound (frequency, pattern) | `packages/agni-runtime/audio/beacon.js` |
| Library collab UI (banner, finder) | `packages/agni-runtime/shell/library.js` |
| Teacher portal (sessions list, deny) | `portal/js/pages/collab.js` |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/collab/opportunities?pseudoId=` | HubKey | Lessons with ≥1 eligible peer |
| POST | `/api/collab/seek` | HubKey | Register seek; match when 2+ seek same lesson |
| GET | `/api/collab/status?pseudoId=` | HubKey | Current seek/session state |
| POST | `/api/collab/cancel-seek` | HubKey | Remove student's seek |
| GET | `/api/collab/sessions` | Bearer | List sessions (teacher) |
| POST | `/api/collab/sessions/:id/deny` | Admin | Deny session |

---

## Session Lifecycle

- **Seek:** Student POSTs seek → added to `seeks`. If 2+ seek same `lessonId`, create session (status `matched`), clear those seeks.
- **Statuses:** `matched` | `active` | `denied` | `completed`
- **TTL:** Seeks older than 10 min are pruned.
- **Storage:** `data/collab-sessions.json`

---

## Constraints

- **ES5:** Beacon and library code must be ES5 (see `docs/RUN-ENVIRONMENTS.md`).
- **User gesture:** Audio requires user gesture; "Play beacon" button satisfies this.
- **Offline:** Matching requires hub connection.
