# Kolibri Plugin Guide (R8 Phase 2c — Optional)

This guide describes how to implement a **native Kolibri plugin** that registers OLS (Open Lesson Standard) as a first-class content kind. This is the higher-effort alternative to the [Ricecooker + HTML5 App path](KOLIBRI-INTEGRATION-GUIDE.md).

---

## When to Use

| Path | Effort | Use Case |
|------|--------|----------|
| **Ricecooker + HTML5 App** | Low | Add OLS lessons to channels via Ricecooker or Studio; uses existing HTML5 content kind |
| **Native Kolibri plugin** | High | OLS-specific metadata, channel UI, or custom behavior in Kolibri Learn/Coach |

---

## Plugin Architecture

Kolibri plugins are Django applications wrapped with a `kolibri_plugin.py` module. They use the **Kolibri Hooks API** to extend core functionality.

### Key References

- [Kolibri plugin architecture](https://kolibri-dev.readthedocs.io/en/develop/backend_architecture/plugins.html)
- [Kolibri content models](https://github.com/learningequality/kolibri/blob/develop/kolibri/core/content/models.py)
- [Cookiecutter template](https://github.com/learningequality/cookiecutter-kolibri-plugin)

### Content Kind vs. HTML5 App

Kolibri’s `HTML5AppNode` and `HTMLZipFile` already support OLS: each lesson is a single HTML file packaged as a zip with `index.html` at root. A native plugin would:

1. **Register a new content kind** (e.g. `OLSLessonNode`) that extends or parallels `ContentNode`
2. **Provide Kolibri-specific metadata** (OLS schema version, step count, sensor requirements)
3. **Integrate with Learn/Coach UI** for OLS-specific filters, thumbnails, or navigation
4. **Use the HTML5 API** for rendering (iframe, sandbox, `kolibri.js`)

### Hooks to Implement

| Hook | Purpose |
|------|---------|
| `WebpackBundleHook` | Frontend Vue.js modules for OLS content rendering or metadata UI |
| `ContentNodeHook` (if available) | Register OLS as a content kind in the content app |
| `NavigationHook` | Optional nav items in Learn/Coach |

---

## Implementation Outline

### 1. Backend (Python/Django)

- **Plugin package:** e.g. `kolibri_plugin_ols` (standalone or in `kolibri/plugins/ols/`)
- **Models:** OLS-specific metadata (optional) or reuse `ContentNode` with `extra_fields`
- **API:** REST endpoints for lesson metadata, compatible with theta/lesson catalog
- **Content kind:** Extend `ContentNode` or add `OLSLessonNode` with `HTMLZipFile` (same format as HTML5 App)

### 2. Frontend (Vue.js)

- **Content renderer:** Use existing HTML5 viewer iframe flow; OLS is a subset of HTML5
- **Metadata UI:** Optional Vue components for OLS-specific info (sensors, steps)
- **Channel UI:** Optional content picker or filters for OLS lessons

### 3. Kolibri Studio / Ricecooker

- Ricecooker can continue to use `HTML5AppNode` + `HTMLZipFile`
- Or: add `OLSLessonNode` / `OLSLessonFile` in a Ricecooker fork or extension if the plugin defines a new kind

---

## Project Structure (Proposed)

```
kolibri-plugin-ols/          # Separate repo or subtree
├── kolibri_plugin_ols/
│   ├── kolibri_plugin.py    # KolibriPluginBase, hooks
│   ├── api_urls.py
│   ├── urls.py
│   ├── models.py            # Optional OLS metadata
│   └── assets/
│       └── src/
│           └── views/       # Vue.js modules
├── setup.py
└── README.md
```

---

## LMS-Specific Behavior

| Behavior | Kolibri | Notes |
|----------|---------|-------|
| **Rendering** | HTML5 iframe, sandboxed | Same as HTML5AppNode |
| **Progress** | `kolibri.js` or xAPI | Kolibri provides xAPI shim in iframe |
| **Offline** | Cached in channel | OLS bundles are self-contained |
| **Sensors** | Accelerometer, haptics | Require secure context; Kolibri serves HTTPS |

---

## Recommendation

For most deployments, **Ricecooker + HTML5 App** is sufficient. Use the [integrations/kolibri/](../../integrations/kolibri/) Ricecooker chef to upload OLS lessons. Consider a native plugin only if you need OLS-specific UX or metadata in Kolibri.

---

## References

- [LMS Plugins Playbook](../playbooks/lms-plugins.md)
- [Kolibri Integration Guide](KOLIBRI-INTEGRATION-GUIDE.md)
- [Ricecooker HTML5 Apps](https://ricecooker.readthedocs.io/en/latest/htmlapps.html)
- [Kolibri HTML5 API](https://kolibri-dev.readthedocs.io/en/latest/frontend_architecture/HTML5_API.html)
