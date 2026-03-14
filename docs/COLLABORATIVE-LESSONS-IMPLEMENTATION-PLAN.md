# Collaborative Lessons — Implementation Plan

**Feature:** When two or more students in a village have completed all prerequisites for a skill and a collaborative lesson exists, AGNI prompts them to learn collaboratively. They find each other via a beacon sound, mutually accept, and begin the lesson. The teacher is alerted and can deny the session.

**Reference:** Evaluation in previous design discussion. OLS `is_group`, pathfinder eligibility, and `GET /api/collab/stats` already exist.

---

## Overview

| Phase | Goal | Est. effort |
|-------|------|-------------|
| **Phase 1** | Hub APIs for collab opportunities and session state | 3–4 days |
| **Phase 2** | Edge: collab prompt, beacon sound, seek/match UI | 2–3 days |
| **Phase 3** | Portal: teacher view, alerts, deny | 1–2 days |
| **Phase 4** | Integration, tests, docs | 1–2 days |

**Total:** ~2 sprints

---

## Phase 1: Hub APIs

**Goal:** Expose collab opportunities and session lifecycle on the hub.

### C1.1 — Collab opportunities endpoint

| Field | Value |
|-------|-------|
| **Endpoint** | `GET /api/collab/opportunities?pseudoId=` |
| **Auth** | HubKey |
| **Response** | `{ opportunities: [{ lessonId, slug, title, peerCount }] }` |

**Logic:**
- Load mastery_summary, lesson_index, skill graph (reuse pathfinder shared cache or `computeLessonOrder` eligibility).
- For each lesson with `is_group: true` where the student meets all prerequisites:
  - Count other students (excluding self) who also meet prerequisites.
  - If `peerCount >= 1`, include in opportunities.

**Files:**
- `packages/agni-hub/routes/student.js` — add route (or new `routes/collab.js` if split).
- Reuse `loadMasterySummaryAsync`, `loadLessonIndexAsync`, pathfinder `buildSkillGraph` / eligibility logic.

---

### C1.2 — Collab session state store

| Field | Value |
|-------|-------|
| **Storage** | `data/collab-sessions.json` or in-memory with optional persistence |
| **Schema** | `{ seeks: [{ pseudoId, lessonId, startedAt }], sessions: [{ id, lessonId, pseudoIds[], status, createdAt }] }` |

**Lifecycle:**
- **Seek:** Student POSTs seek → add to `seeks`. If 2+ seeks same `lessonId`, create `session` (status `matched`), remove those seeks.
- **Session statuses:** `matched` | `active` | `denied` | `completed`.
- TTL for stale seeks (e.g. 10 min) — cleanup on next seek or via periodic task.

**Files:**
- New: `packages/agni-hub/collab-sessions.js` — pure helpers for addSeek, matchSeeks, getSession, denySession.
- Or extend `packages/agni-hub/routes/student.js` with inline logic if small.

---

### C1.3 — Seek and status endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/collab/seek` | HubKey | Body: `{ pseudoId, lessonId }`. Register seek; return `{ status, sessionId?, matchedPseudoIds? }` |
| GET | `/api/collab/status?pseudoId=` | HubKey | Return `{ seeking: boolean, sessionId?, lessonId?, status?, matchedPseudoIds? }` |
| POST | `/api/collab/cancel-seek` | HubKey | Body: `{ pseudoId }`. Remove seek for student. |
| GET | `/api/collab/sessions` | Admin/Bearer | List active sessions for teacher portal. |
| POST | `/api/collab/sessions/:id/deny` | Admin | Deny session; set status `denied`. |

**Files:**
- `packages/agni-hub/routes/student.js` or new `packages/agni-hub/routes/collab.js`.
- Update `docs/api-contract.md` with new endpoints.

---

### C1.4 — Session matching and deny logic

- When a seek is added: scan `seeks` for same `lessonId`; if count ≥ 2, create session, clear those seeks, return `matched` to callers.
- When teacher denies: set `status: 'denied'`. Edge devices poll status and see `denied` → show message, exit lesson.

---

## Phase 2: Edge Runtime

**Goal:** Library prompt, beacon sound, seek/match flow on student devices. ES5 only.

### C2.1 — Beacon sound module

| Field | Value |
|-------|-------|
| **Path** | `packages/agni-runtime/audio/beacon.js` |
| **API** | `playBeacon()` — start repeating beep; `stopBeacon()` — stop. |
| **Implementation** | Web Audio API: `AudioContext` / `webkitAudioContext`, oscillator (440 Hz), 500 ms on / 500 ms off. User gesture required (button click). |
| **ES5** | Use `var`, `function`; no arrow, no `class`. |

**Files:**
- New: `packages/agni-runtime/audio/beacon.js`.
- Export from `packages/agni-runtime/index.js` if used from Node; otherwise only loaded by player/shell.

---

### C2.2 — Collab prompt in library

- When library loads, fetch `GET /api/collab/opportunities?pseudoId=...`.
- If opportunities.length > 0, show banner/card: “Would you like to learn [skill] collaboratively? [N] classmates are ready.”
- On accept: POST `/api/collab/seek` with chosen lessonId; transition to “finding classmates” screen.

**Files:**
- `packages/agni-runtime/shell/library.js` — fetch opportunities, render prompt, handle accept.
- Ensure `pseudoId` is available (from session/token or query param).

---

### C2.3 — Finding classmates screen

- UI: “Find your classmates by following the sound. When you’ve found each other, press Ready.”
- “Play beacon” button → calls `playBeacon()` (user gesture).
- “I’m ready” button → ensures seek is active (re-POST if needed); start polling `GET /api/collab/status`.
- On `status === 'matched'`: stop beacon, show “Starting lesson…”, navigate to lesson URL.
- On `status === 'denied'`: show “Teacher has cancelled this session”, return to library.

**Files:**
- `packages/agni-runtime/shell/library.js` or new `packages/agni-runtime/shell/collab-finder.js`.
- Poll interval: e.g. 3–5 s.

---

### C2.4 — Lesson launch with session context

- When launching a matched collab lesson, pass `sessionId` (e.g. query param) so telemetry can attribute to collab.
- Player: optional display of “Collaborative lesson” badge. No change to core step logic unless future collab-specific steps are added.

**Files:**
- `packages/agni-runtime/shell/library.js` — `launchLesson(lessonId, { sessionId })`.
- `packages/agni-runtime/telemetry/*` — include `sessionId` in completion events if provided.

---

## Phase 3: Teacher Portal

**Goal:** View active sessions, receive alert, deny sessions.

### C3.1 — Collaborative sessions page

- New route: `/hub/collab` or `/collab-sessions`.
- Fetches `GET /api/collab/sessions` (Admin auth).
- Renders list: session id, lesson title, student pseudoIds (or display names), status, “Recommend raising students” note.

**Files:**
- `portal/` — new HTML page or SPA route, `portal/js/api.js` — add `getCollabSessions()`.

---

### C3.2 — Polling for new sessions

- Poll `GET /api/collab/sessions` every 30 s when on collab page.
- On new `active` or `matched` session: show alert/banner “Students have started a collaborative lesson — consider supervising.”

---

### C3.3 — Deny button

- Per session: “Deny” button → `POST /api/collab/sessions/:id/deny`.
- On success: update local list, session status → `denied`. Edge devices will see `denied` on next status poll.

---

## Phase 4: Integration and Quality

### C4.1 — API contract update

- Add all new endpoints to `docs/api-contract.md` under a “Collaborative lessons” subsection.

---

### C4.2 — Contract tests

- Add tests for:
  - `GET /api/collab/opportunities` — returns opportunities when eligible.
  - `POST /api/collab/seek` — seek added; match when 2nd student seeks.
  - `GET /api/collab/status` — returns correct state for seeker and matched.
  - `POST /api/collab/sessions/:id/deny` — session denied, status updated.

**Files:**
- `tests/` — new `collab-api.test.js` or extend existing contract tests.

---

### C4.3 — ES5 verification

- Beacon and any new runtime code must pass `npm run test:es5`.

---

### C4.4 — Playbook

- Create `docs/playbooks/collaborative-lessons.md` — how collab flow works, where to change session logic, beacon, portal.

---

## Task Checklist (Implementation Order)

| # | Task | Phase | Status |
|---|------|-------|--------|
| 1 | C1.2 Collab session state store | 1 | Done |
| 2 | C1.3 Seek and status endpoints | 1 | Done |
| 3 | C1.1 Collab opportunities endpoint | 1 | Done |
| 4 | C1.4 Session matching and deny logic | 1 | Done |
| 5 | C2.1 Beacon sound module | 2 | Done |
| 6 | C2.2 Collab prompt in library | 2 | Done |
| 7 | C2.3 Finding classmates screen | 2 | Done |
| 8 | C2.4 Lesson launch with session context | 2 | Done |
| 9 | C3.1 Collaborative sessions page | 3 | Done |
| 10 | C3.2 Polling for new sessions | 3 | Done |
| 11 | C3.3 Deny button | 3 | Done |
| 12 | C4.1 API contract update | 4 | Done |
| 13 | C4.2 Contract tests | 4 | Done |
| 14 | C4.3 ES5 verification | 4 | Done |
| 15 | C4.4 Playbook | 4 | Done |

---

## Constraints

- **ES5:** All edge code (beacon, library, collab UI) must be ES5. See `docs/RUN-ENVIRONMENTS.md`.
- **User gesture:** Audio requires user gesture on mobile; “Play beacon” button satisfies this.
- **Offline:** Collab matching requires hub connection; no offline pairing.
- **Privacy:** Consider “at least one classmate” instead of exact `peerCount` if policy requires.

---

## Future Enhancements (Out of Scope)

- WebSocket/SSE for real-time teacher alerts (instead of polling).
- Support for 3+ students in one collab session (schema allows; matching logic may need adjustment).
- Collab-specific lesson steps (e.g. shared state between devices).
