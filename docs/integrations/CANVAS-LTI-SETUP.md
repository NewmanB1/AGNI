# Canvas LTI Setup

This guide explains how to add **OLS (Open Lesson Standard)** lessons from AGNI to **Canvas** using the LTI external tool.

---

## Overview

| Component | Role |
|-----------|------|
| **OLS** | Single-file HTML lessons with sensors (accelerometer, haptics) |
| **AGNI Hub** | Serves lessons and provides LTI launch endpoint |
| **Canvas** | LMS that launches the tool and embeds lessons in iframes |

---

## Prerequisites

- AGNI hub running and accessible (e.g. `https://your-hub.example.com` or `http://localhost:8082`)
- Lessons compiled and available in the hub
- Canvas account with admin or developer keys access

---

## Step 1: Create an LTI Developer Key (Canvas Admin)

1. Log in as an admin.
2. Go to **Admin** → **Developer Keys**.
3. Click **+ Developer Key** → **+ LTI Key**.
4. Configure:
   - **Key Name:** `OLS Lessons`
   - **Owner Email:** your email
   - **Redirect URIs:** `https://your-hub.example.com/lti/launch` (or your hub URL + `/lti/launch`)
   - **LTI 1.1 Legacy:** Enable and set:
     - **Consumer Key:** e.g. `canvas-ols`
     - **Shared Secret:** Generate a secure random string. **Set the same value in `AGNI_LTI_SECRET`** on the hub.
5. Save and note the **Consumer Key** and **Shared Secret**.

---

## Step 2: Add External Tool to Course

1. In your course, go to **Settings** → **Apps** → **+ App**.
2. Choose **By Client ID** and enter your Developer Key ID, or **By URL**.
3. For **By URL**, paste the XML configuration URL if you have one, or manually:
   - **Consumer Key:** from Developer Key
   - **Shared Secret:** from Developer Key
   - **Launch URL:** `https://your-hub.example.com/lti/launch`
4. Add the app.
5. In a module, **+** → **External Tool** → select your OLS app.
6. Configure the module and save.

---

## Step 3: Hub Configuration

Set these on the hub (env or `hub-config.json`):

| Variable | Value |
|----------|-------|
| `AGNI_LTI_SECRET` | Same shared secret as in Canvas Developer Key |
| `AGNI_HOME_URL` | `https://your-hub.example.com` |

---

## Deep Linking (Content Item Selection)

Canvas supports LTI Deep Linking. When adding an External Tool module with Content Item placement, the OLS tool shows a lesson picker. Selecting a lesson embeds it in the course.

---

## Grade Passback

The OLS player sends `ols.lessonComplete` via `postMessage` when a lesson is completed. Full LTI Advantage Assignment and Grade Services (AGS) is planned (Phase 1c). For now, completion is visible in the lesson UI.

---

## References

- **Playbook:** `docs/playbooks/lms-plugins.md`
- **Canvas LTI:** [Instructure Developer Docs - External Tools](https://developerdocs.instructure.com/services/canvas/external-tools/lti/)
- **AGNI Hub:** `docs/CONFIGURATION.md`
