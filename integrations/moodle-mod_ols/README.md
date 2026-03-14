# Moodle mod_ols — OLS Lesson Activity Module

Native Moodle activity module for OLS (Open Lesson Standard) lessons. Displays lessons in an iframe and passes completion/grade to the Moodle gradebook via postMessage.

## Installation

1. Copy this folder to `moodle/mod/ols/`
2. Visit **Site administration → Notifications** to install
3. Add "OLS Lesson" from the activity chooser when editing a course

## Configuration

When adding an OLS Lesson activity:
- **Lesson URL** — Full URL to the OLS lesson HTML (e.g. `https://hub.example.com/lesson/gravity.html`)
- **Maximum grade** — Scale for mastery score (default 100)

## Grade Passback

The player sends `ols.lessonComplete` with `{ mastery: 0-1 }` via postMessage. The mod listens and calls Moodle's grade API. Requires the lesson to be served from a URL (hub or static host).

## Status

Scaffold / alpha. See [MOODLE-MOD-OLS-GUIDE.md](../../docs/integrations/MOODLE-MOD-OLS-GUIDE.md) for full implementation guide and checklist.

## References

- [LMS Plugins Playbook](../../docs/playbooks/lms-plugins.md)
- [Moodle LTI Setup](../../docs/integrations/MOODLE-LTI-SETUP.md) — alternative using LTI
