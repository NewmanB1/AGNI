# LTI (Learning Tools Interoperability) playbook

This playbook describes how LTI 1.1 is implemented in AGNI for Moodle, Canvas, and other LMSs, and how to change or extend it.

---

## 1. Where LTI lives

| Item | Location |
|------|----------|
| **Routes** | `packages/agni-hub/routes/lti.js` |
| **API contract** | `docs/api-contract.md` § LTI (Moodle, Canvas) |
| **Hub wiring** | Hub kernel mounts LTI routes; see `packages/agni-hub/` entry (e.g. `routes/index.js` or main server file). |

LTI provides:

- **Launch** — LMS sends users to the hub via POST `/lti/launch` (OAuth 1.0 with `AGNI_LTI_SECRET`).
- **Lesson picker / Deep Link** — After launch, instructor or Deep Link flow can select lessons; selection is returned to the LMS.
- **Grade passback** — When a lesson is completed, the hub can send a score back via LTI 1.1 Basic Outcomes (`replaceResult`). The student view is served from `/lti/lesson/:slug`; that page embeds the lesson and listens for `ols.lessonComplete`, then calls the hub’s `/lti/submit-grade` with a one-time token.

---

## 2. Key endpoints (contract)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/lti/launch` | OAuth 1.0 (AGNI_LTI_SECRET) | LTI 1.1 launch; lesson picker or Deep Link return |
| GET | `/lti/lessons` | No | JSON lesson catalog |
| GET | `/lti/xml` | No | LTI 1.1 XML descriptor for tool registration |
| GET | `/lti/lesson/:slug` | No | Wrapper page for grade passback (embeds lesson, listens for ols.lessonComplete) |
| POST | `/lti/submit-grade` | One-time token | LTI 1.1 Basic Outcomes replaceResult; body `{ token, score }` |

---

## 3. Configuration

- **AGNI_LTI_SECRET** — Shared secret for OAuth 1.0 signing of launch and outcomes. Must match the secret configured in the LMS (Moodle, Canvas) when registering the AGNI tool.
- **AGNI_HUB_URL** (or equivalent base URL) — Used in the LTI XML descriptor and in return URLs so the LMS can post back to the correct hub.

See `docs/CONFIGURATION.md` for full env and bootstrap order.

---

## 4. Moodle / Canvas setup (outline)

1. **Register the tool in the LMS**  
   - Use the tool’s XML URL: `https://<your-hub>/lti/xml`.  
   - Configure consumer key and **consumer secret** to match `AGNI_LTI_SECRET` (and any key the hub expects).

2. **Launch**  
   - Add an “External tool” activity (Moodle) or “External tool” / LTI assignment (Canvas) that points to the hub’s launch URL (e.g. `https://<your-hub>/lti/launch`).  
   - After launch, users can be directed to the lesson picker or a specific lesson.

3. **Grade passback**  
   - Ensure the hub is configured to store outcome URLs (outcome service URL, sourcedId, consumer key) when launching the lesson wrapper (`/lti/lesson/:slug`).  
   - When the lesson fires `ols.lessonComplete`, the wrapper page calls `POST /lti/submit-grade` with the one-time token and score; `packages/agni-hub/routes/lti.js` implements Basic Outcomes and signs the request with the LTI secret.

---

## 5. Changing LTI behavior

- **New LTI endpoint** — Add the route in `packages/agni-hub/routes/lti.js`, then document it in `docs/api-contract.md` § LTI and, if the portal uses it, in `portal/js/api.js` (and run `verify:portal-api-contract`).
- **Launch or Deep Link logic** — Edit the launch handler and any Deep Link response in `lti.js`.
- **Grade passback** — Modify `replaceResult` and the `/lti/submit-grade` handler; keep OAuth 1.0a body hash signing per IMS spec.
- **Tests** — Contract and wiring tests: `tests/contract-hub-api.js`, `tests/unit/wiring-smoke.test.js` (e.g. GET `/lti/lesson`, `/lti/xml`, `/lti/lessons`, POST `/lti/submit-grade`). Add or extend these when adding endpoints or changing behavior.

---

## 6. References

- **LMS plugins and Kolibri** — `docs/playbooks/lms-plugins.md`
- **Hub Kernel** — `docs/HUB-KERNEL-ARCHITECTURE.md`
- **API contract** — `docs/api-contract.md` § LTI
