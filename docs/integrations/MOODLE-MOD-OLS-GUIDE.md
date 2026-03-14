# Moodle mod_ols Implementation Guide (R8 Phase 3 — Optional)

This guide describes how to implement **mod_ols**, a native Moodle activity module for OLS (Open Lesson Standard) lessons. It provides a first-class "OLS Lesson" activity type alongside LTI.

---

## When to Use

| Path | Effort | Use Case |
|------|--------|----------|
| **LTI external tool** | Medium | Use existing [MOODLE-LTI-SETUP](MOODLE-LTI-SETUP.md); works with any LTI-compliant LMS |
| **mod_ols** | High | Native Moodle activity; simpler UX for teachers; no LTI setup |

---

## Architecture

mod_ols is similar to **mod_hvp** (H5P) or **mod_url**:

| Component | Role |
|-----------|------|
| **Activity instance** | Stores lesson URL or slug; grade scale (0–100) |
| **view.php** | Renders iframe with OLS lesson; embeds AMD JS for postMessage |
| **Grade passback** | Listens for `ols.lessonComplete`; calls `grade_update()` |

---

## Integration with AGNI Hub

| Mode | Lesson URL | Grade Passback |
|------|------------|----------------|
| **Hub URL** | `https://hub.example.com/lesson/{slug}.html` | Hub LTI Basic Outcomes (when launched via LTI) — **not used** by mod_ols |
| **mod_ols** | Same URL in iframe; stored in `mdl_ols` | Moodle `grade_update()`; mod_ols handles postMessage → grade directly |

mod_ols does **not** use LTI. It embeds the lesson iframe and implements its own grade passback via Moodle's gradebook API.

---

## Module Structure

```
mod/ols/
├── version.php
├── db/
│   └── install.xml
├── view.php
├── mod_form.php
├── lib.php
├── index.php
├── lang/
│   └── en/
│       └── ols.php
├── amd/
│   └── src/
│       └── grade_listener.js   # postMessage → grade_update
└── README.md
```

---

## Database Schema (install.xml)

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<XMLDB PATH="mod/ols/db" VERSION="2024010100"
  xmlns="http://moodle.org/xmldb/">
  <TABLES>
    <TABLE NAME="ols" COMMENT="OLS activity instances">
      <FIELDS>
        <FIELD NAME="id" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="true"/>
        <FIELD NAME="course" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="false"/>
        <FIELD NAME="name" TYPE="char" LENGTH="255" NOTNULL="true" SEQUENCE="false"/>
        <FIELD NAME="intro" TYPE="text" NOTNULL="false" SEQUENCE="false"/>
        <FIELD NAME="introformat" TYPE="int" LENGTH="4" NOTNULL="true" DEFAULT="0"/>
        <FIELD NAME="lessonurl" TYPE="char" LENGTH="1024" NOTNULL="true" SEQUENCE="false"/>
        <FIELD NAME="grademax" TYPE="number" LENGTH="10,2" NOTNULL="true" DEFAULT="100"/>
        <FIELD NAME="timecreated" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="false"/>
        <FIELD NAME="timemodified" TYPE="int" LENGTH="10" NOTNULL="true" SEQUENCE="false"/>
      </FIELDS>
      <KEYS>
        <KEY NAME="primary" TYPE="primary" FIELDS="id"/>
        <KEY NAME="course" TYPE="foreign" FIELDS="course" REFERENCE="course" REFTABLE="course" REFFIELDS="id"/>
      </KEYS>
    </TABLE>
  </TABLES>
</XMLDB>
```

---

## Grade Passback Flow

1. **view.php** loads the lesson in an iframe; passes `cmid` and `courseid` to AMD module.
2. **grade_listener.js** listens for `ols.lessonComplete` postMessage (with `event.data.mastery` 0–1).
3. AMD module calls a Moodle `external` API (or AJAX) that:
   - Validates the user/session
   - Maps mastery (0–1) to grade (0–grademax)
   - Calls `grade_update('mod/ols', $courseid, 'mod', 'ols', $cm->instance, 0, $grades)`

---

## LMS-Specific Behavior

| Behavior | mod_ols | LTI |
|----------|---------|-----|
| **Lesson source** | URL in activity settings | Hub launch + Deep Link |
| **Grade** | `grade_update()` | LTI replaceResult |
| **Completion** | postMessage → PHP callback | postMessage → hub → replaceResult |
| **Setup** | Install mod; add activity | Configure LTI tool in admin |

---

## Implementation Checklist

- [ ] `version.php` – plugin version, requires Moodle 4.0+
- [ ] `db/install.xml` – table schema
- [ ] `lib.php` – `ols_supports()`, `ols_get_view_actions()`, `ols_add_instance()`, etc.
- [ ] `mod_form.php` – lesson URL, grade max
- [ ] `view.php` – iframe + AMD init
- [ ] `amd/src/grade_listener.js` – postMessage handler, `core/ajax` or `core_external`
- [ ] PHP callback for grade submission (e.g. `ajax/service.php` or `classes/external/submit_grade.php`)
- [ ] Language strings
- [ ] `db/access.php` – capabilities (`mod/ols:view`, `mod/ols:addinstance`)

---

## References

- [LMS Plugins Playbook](../playbooks/lms-plugins.md)
- [Moodle LTI Setup](MOODLE-LTI-SETUP.md)
- [Moodle activity module development](https://docs.moodle.org/dev/Activity_modules)
- [mod_hvp](https://github.com/h5p/moodle-mod_hvp) – reference for iframe + grade handling
