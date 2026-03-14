# LMS Plugins: Moodle, Kolibri, Canvas (R8)

This playbook outlines the design for **official plugins** that integrate OLS (Open Lesson Standard) lessons into major Learning Management Systems. It addresses roadmap item **R8**.

**Status:** Phase 0–2 implemented. LTI server, runtime postMessage, LTI 1.1 Basic Outcomes grade passback, Moodle/Canvas docs. Phase 2 complete: Kolibri Ricecooker chef (`integrations/kolibri/`), Moodle mod_ols scaffold (`integrations/moodle-mod_ols/`). CI: `node scripts/check-lms-integrations.js`.

---

## 1. Goal and Context

| Concept | Description |
|--------|-------------|
| **OLS** | Single-file HTML bundles (<500KB) that run offline with sensors. See `packages/ols-compiler/`, `packages/agni-runtime/`. |
| **LMS** | Moodle, Kolibri, Canvas — each has its own plugin model and content expectations. |
| **LTI** | IMS Learning Tools Interoperability — a common standard supported by Moodle, Canvas, Blackboard, D2L, Sakai. |

**Use case:** Teachers add OLS lessons to courses as graded activities. Students run lessons in an iframe; completion/grade flows back to the LMS.

---

## 2. Platform Integration Options

### 2.1 Kolibri (Learning Equality)

| Path | Effort | Notes |
|------|--------|------|
| **Ricecooker + HTML5 App** | Low | Already documented in `docs/integrations/KOLIBRI-INTEGRATION-GUIDE.md`. Compile YAML → HTML, add as HTML5 App nodes to a channel. No plugin code; channel authors use Ricecooker or Kolibri Studio. |
| **Kolibri plugin** | High | Native plugin (Python/Django + Vue.js) that registers OLS as a content kind, provides channel UI, and uses the HTML5 API. See [Kolibri plugin architecture](https://kolibri-dev.readthedocs.io/en/develop/backend_architecture/plugins.html). |

**Recommendation:** Phase 1 = Ricecooker (already done). Phase 2 = optional Kolibri plugin for tighter UX (single-channel install, OLS-specific metadata).

### 2.2 Moodle

| Path | Effort | Notes |
|------|--------|------|
| **LTI external tool** | Medium | Add OLS as an LTI tool. Moodle supports LTI 1.1 and LTI Advantage (1.3). Activity → Add activity → External tool → choose OLS tool. |
| **Activity module (mod_ols)** | High | PHP plugin (like mod_hvp for H5P). Custom activity type; stores lesson URL/slug; renders iframe. Grade passback via Moodle APIs. |
| **URL activity** | Low | No plugin. Add compiled HTML URL as "URL" activity. Minimal integration; no grade passback. |

**Recommendation:** Phase 1 = LTI tool (shared with Canvas). Phase 2 = optional mod_ols for native Moodle UX.

### 2.3 Canvas (Instructure)

| Path | Effort | Notes |
|------|--------|------|
| **LTI external tool** | Medium | Same as Moodle. Canvas supports LTI 1.1, LTI Advantage (1.3), Deep Linking. Add as External Tool in Modules or Assignments. |
| **Canvas App** | High | Full Canvas App (React) with LTI + REST API. Overkill for content embedding; LTI suffices. |

**Recommendation:** Phase 1 = LTI tool. Canvas does not need a separate codebase from Moodle.

---

## 3. Unified Architecture: LTI-First

A single **LTI tool** serves OLS lessons to Moodle, Canvas, and any LTI-compliant LMS. Content is presented via **Deep Linking** (Content Item) as an iframe.

### 3.1 LTI Tool Flow

```
┌─────────────┐     LTI Launch      ┌──────────────────┐     Deep Link      ┌──────────────┐
│ Moodle /    │ ──────────────────► │ OLS LTI Server   │ ◄───────────────── │ Lesson       │
│ Canvas /    │                     │ (Node.js)        │                    │ Catalog      │
│ Blackboard  │                     │                  │                    │ (theta API)  │
└─────────────┘                     └────────┬─────────┘                    └──────────────┘
       │                                     │
       │  iframe src = /lesson/{slug}.html   │
       ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ OLS Player (single-file HTML in iframe)                                                  │
│ - Runs lesson offline-capable                                                            │
│ - postMessage to parent on completion → LTI Grade Passback (optional)                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 LTI Server Responsibilities

| Responsibility | Implementation |
|----------------|----------------|
| **OAuth2 / JWT** | LTI 1.3 uses OIDC + JWT. Tool registers with LMS; LMS sends launch JWT. |
| **Launch endpoint** | `GET /lti/launch` — validates JWT, renders launcher page or redirects to Content Item selection. |
| **Deep Linking** | When `lti_message_type=ContentItemSelectionRequest`, return `application/vnd.ims.lti.v1.contentitems+json` with iframe items. |
| **Lesson catalog** | Fetch from hub theta API or static index. Each item: `{ url, title, thumbnail?, description? }`. |
| **Lesson delivery** | Serve compiled HTML from hub-transform or static dist. |
| **Grade passback** | LTI Advantage Names and Role Provisioning + Assignment and Grade Services. Requires tool-to-LMS callback. |

### 3.3 Reuse of Existing AGNI Components

| Component | Role |
|-----------|------|
| **hub-transform** | On-demand lesson compilation; serve `/lesson/{slug}.html`. |
| **theta** | Lesson index, graph weights. LTI server can call `GET /api/theta`, `GET /api/lessons`. |
| **dist/**.html | Pre-compiled lessons for static hosting. |
| **demo/iframe-demo.html** | Reference for iframe embedding. |

---

## 4. Runtime: postMessage for LMS Communication

The Kolibri guide mentions optional `postMessage` for progress/completion. To support LTI Grade Passback and consistent LMS behavior, define a **standard postMessage protocol**.

### 4.1 Outbound Messages (Player → Parent)

When running in an iframe, the player MAY send:

| Event | When | Payload |
|-------|------|---------|
| `ols.stepComplete` | User completes a scored step | `{ stepIndex, outcome, mastery? }` |
| `ols.lessonComplete` | User reaches completion step | `{ lessonId, mastery, durationMs, stepOutcomes }` |
| `ols.ready` | Player loaded and ready | `{ lessonId, stepCount }` |

**Origin check:** Player sends to `window.parent`; parent (LMS) must validate `event.origin` before acting. LMS iframes typically same-origin or known LTI tool domain.

### 4.2 Integration Point

Add optional postMessage dispatch in:
- `packages/agni-runtime/telemetry/telemetry.js` — on lesson completion, if `window !== window.top`, post `ols.lessonComplete`.
- `packages/agni-runtime/ui/player.js` — on step outcome, optionally post `ols.stepComplete`.

**Feature flag:** Only emit when `LESSON_DATA.lmsMode === true` or when `window !== window.top` (inferred). Avoid noisy messages in standalone mode.

---

## 5. Implementation Phases

| Phase | Deliverable | Effort | Dependencies |
|-------|-------------|--------|--------------|
| **0** | Playbook (this doc) | Done | — |
| **1a** | LTI server (Node.js) — launch + Deep Link + lesson catalog | Done | `packages/agni-hub/routes/lti.js` |
| **1b** | Runtime postMessage (ols.lessonComplete, ols.ready) | Done | `telemetry.js`, `player.js` |
| **1c** | LTI Grade Passback (Basic Outcomes) | Done | LTI 1.1 replaceResult; AGS (LTI 1.3) optional future |
| **2a** | Moodle LTI config doc + XML descriptor | Done | `docs/integrations/MOODLE-LTI-SETUP.md`, `GET /lti/xml` |
| **2b** | Canvas LTI config doc + XML descriptor | Done | `docs/integrations/CANVAS-LTI-SETUP.md` |
| **2c** | Kolibri Ricecooker chef — OLS channel upload | Done | `integrations/kolibri/` |
| **2d** | Kolibri native plugin (optional) — OLS content kind | High | See `docs/integrations/KOLIBRI-PLUGIN-GUIDE.md` |
| **3** | Moodle mod_ols — native activity module | **Done** (scaffold) | `integrations/moodle-mod_ols/`; see `docs/integrations/MOODLE-MOD-OLS-GUIDE.md` |

### 5.1 Phase 1a: LTI Server Skeleton

**Location:** New package `packages/agni-lti/` or `tools/lti-server/`.

**Endpoints:**
- `GET /lti/launch` — LTI 1.3 launch; validate JWT; redirect or render Content Item picker.
- `GET /lti/lessons` — JSON list of lessons (from theta or static).
- `GET /lesson/:slug` — Proxy to hub-transform or serve from dist.

**Config:** `AGNI_HUB_URL`, `AGNI_LTI_JWKS_URI`, `AGNI_LTI_CLIENT_ID`, platform credentials (from LMS admin).

### 5.2 Phase 1c: LTI 1.1 Basic Outcomes Grade Passback

When the LMS includes `lis_outcome_service_url` and `lis_result_sourcedid` at launch, the hub creates a one-time token (24h TTL) and stores the outcome params. The basic launch picker links to `/lti/lesson/:slug?token=xxx`, which serves a wrapper page that embeds the lesson in an iframe. On `ols.lessonComplete` postMessage, the wrapper POSTs to `/lti/submit-grade` with `{ token, score }`. The hub calls LTI 1.1 replaceResult (OAuth body hash) to submit the grade to the LMS. Tokens are single-use.

**Endpoints:** `GET /lti/lesson/:slug`, `POST /lti/submit-grade`

### 5.3 Phase 2: Platform Configuration

Each LMS needs an **LTI tool registration**. Provide:

- **Moodle:** XML descriptor + installation instructions. Moodle admins add "External tool" and paste tool URL + key.
- **Canvas:** XML descriptor (same format) + Developer Keys. [Canvas LTI docs](https://canvas.instructure.com/doc/api/file.tools_intro.html).
- **Kolibri:** Continue using Ricecooker for now; LTI is less relevant (Kolibri uses channels, not LTI for content).

---

## 6. File Layout (Proposed)

```
AGNI/
├── packages/
│   └── agni-lti/              # Optional: LTI server package
│       ├── index.js
│       ├── launch.js          # JWT validation, launch handler
│       ├── deep-link.js       # Content Item response
│       └── grade-passback.js  # AGS client
├── tools/
│   └── lti-server.js          # Standalone server (or use agni-hub route)
├── docs/
│   ├── integrations/
│   │   ├── KOLIBRI-INTEGRATION-GUIDE.md   # Existing
│   │   ├── MOODLE-LTI-SETUP.md            # New
│   │   └── CANVAS-LTI-SETUP.md            # New
│   └── playbooks/
│       └── lms-plugins.md     # This file
```

---

## 7. Security and Trust

| Concern | Mitigation |
|---------|------------|
| **LTI JWT** | Validate signature with platform JWKS. Reject expired or tampered tokens. |
| **postMessage** | Parent must check `event.origin`. Player sends only to `parent.postMessage`; no sensitive data. |
| **Grade passback** | Use LTI AGS with platform-provided line item URL. Tool must not invent grades. |
| **CORS** | LTI tool domain must allow LMS origins for iframe. Same-origin if both served from same domain. |

---

## 8. Phase 2 Additions

| Deliverable | Location |
|-------------|----------|
| **Kolibri Ricecooker chef** | `integrations/kolibri/` — upload OLS lessons to Kolibri Studio as HTML5 Apps |
| **Kolibri plugin guide** | `docs/integrations/KOLIBRI-PLUGIN-GUIDE.md` — design for native OLS content kind |
| **Moodle mod_ols** | `integrations/moodle-mod_ols/` — activity module scaffold (iframe + grade passback) |
| **mod_ols guide** | `docs/integrations/MOODLE-MOD-OLS-GUIDE.md` — implementation checklist |

---

## 9. References

- **Kolibri guide:** `docs/integrations/KOLIBRI-INTEGRATION-GUIDE.md`
- **Kolibri chef:** `integrations/kolibri/`
- **iframe demo:** `demo/iframe-demo.html`
- **Hub API:** `docs/api-contract.md`
- **LTI 1.3 spec:** [IMS LTI Core 1.3](https://www.imsglobal.org/spec/lti/v1p3)
- **Deep Linking:** [Content Items](https://www.imsglobal.org/lti/model/mediatype/application/vnd/ims/lti/v1/contentitems%2Bjson/index.html)
- **Canvas LTI:** [Instructure Developer Docs](https://developerdocs.instructure.com/services/canvas/external-tools/lti/)
- **Roadmap:** `docs/ROADMAP.md` — R8 (The Plugins)
