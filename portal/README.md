# AGNI Portal

Plain HTML + CSS + JavaScript. No framework, no build step. Runs well on old phones and slow networks.

## Run

Serve the directory over HTTP (ES modules require it). **Run from the AGNI repo root**:

```bash
cd /path/to/AGNI
npx serve portal -l 3000
```

Then open http://localhost:3000. Use hash routes (e.g. http://localhost:3000/#/author/login).

To connect to the hub, set the Hub URL in Settings, or pass `?hub=http://localhost:8082` in the URL.

## Structure

- `index.html` - Single-page app shell
- `css/main.css` - Styles
- `js/main.js` - Bootstrap, routing, nav
- `js/router.js` - Hash-based router
- `js/api.js` - Hub API client
- `js/auth.js` - Creator auth
- `js/pages/` - Page renderers (home, settings, author, stub)

## Routes

| Hash | Page |
|------|------|
| `#/` | Home |
| `#/settings` | Hub URL, language |
| `#/author` | Author landing (login if needed) |
| `#/author/login` | Creator login/register |
| `#/author/new` | New lesson (simplified) |
| `#/author/:slug/edit` | Edit lesson (simplified) |
| `#/hub`, `#/groups`, etc. | Stub placeholders |

## Notes

- Lesson authoring is simplified; features will be added incrementally.
- Hash-based routing (`#/path`) works with static file serving.
