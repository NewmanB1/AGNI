# Moodle LTI Setup

This guide explains how to add **OLS (Open Lesson Standard)** lessons from AGNI to **Moodle** using the LTI external tool.

---

## Overview

| Component | Role |
|-----------|------|
| **OLS** | Single-file HTML lessons with sensors (accelerometer, haptics) |
| **AGNI Hub** | Serves lessons and provides LTI launch endpoint |
| **Moodle** | LMS that launches the tool and embeds lessons in iframes |

---

## Prerequisites

- AGNI hub running and accessible (e.g. `https://your-hub.example.com` or `http://localhost:8082`)
- Lessons compiled and available in the hub (see `npm run build`, `scripts/init-data.js`, or hub-transform)
- Moodle 3.x or 4.x with External tool (LTI) support

---

## Step 1: Configure the LTI Tool in Moodle

1. Log in as an administrator.
2. Go to **Site administration** → **Plugins** → **Activity modules** → **External tool** → **Manage tools**.
3. Click **Add external tool configuration**.
4. Fill in:
   - **Tool name:** `OLS Lessons` (or your preferred name)
   - **Tool URL:** `https://your-hub.example.com/lti/launch`
   - **Consumer key:** Any value (e.g. `moodle-ols`); record it for the hub config.
   - **Shared secret:** Generate a secure random string (e.g. 32+ chars). **Set the same value in `AGNI_LTI_SECRET`** on the hub.
5. Under **Default launch container:** choose **Embed, without blocks** or **New window** as needed.
6. Save.

---

## Step 2: Add an LTI Activity to a Course

1. Turn editing on in your course.
2. **Add an activity or resource** → **External tool**.
3. Select the tool you configured (e.g. "OLS Lessons").
4. Configure:
   - **Activity name:** e.g. "Feeling Gravity"
   - **Preconfigured tool:** select your OLS tool
   - Optionally use **Custom parameters** to pass a specific lesson slug.
5. Save and display.

---

## Step 3: Hub Configuration

Set these on the hub (env or `hub-config.json`):

| Variable | Value |
|----------|-------|
| `AGNI_LTI_SECRET` | Same shared secret as in Moodle |
| `AGNI_HOME_URL` | `https://your-hub.example.com` (used to build lesson URLs) |

---

## Deep Linking (Content Selection)

When adding the activity, if your Moodle version supports it, you may be prompted to **select content**. The OLS tool will show a lesson picker; choosing a lesson embeds it as an iframe in the activity.

---

## Grade Passback

The OLS player sends `ols.lessonComplete` via `postMessage` when a lesson is completed. Full LTI Advantage Grade Services passback is planned (Phase 1c). For now, completion is visible in the lesson UI; Moodle gradebook integration requires additional setup.

---

## References

- **Playbook:** `docs/playbooks/lms-plugins.md`
- **Moodle LTI:** [Moodle docs - External tool](https://docs.moodle.org/en/External_tool)
- **AGNI Hub:** `docs/CONFIGURATION.md`
