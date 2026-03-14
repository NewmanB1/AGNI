# TipTap WYSIWYG Editor Research (R5)

**Scope:** Evaluate TipTap for future author/editor WYSIWYG support.  
**Date:** 2025-03  
**Status:** Research complete; decision deferred until Year 2 editor work (Y1–Y6).

---

## Summary

TipTap is an open-source, headless WYSIWYG editor built on ProseMirror. It supports React and Vue, with a modular extension system. Suitable for future author UI enhancements (e.g. rich text in step content, Markdown preview).

---

## Key Facts

| Aspect | Detail |
|--------|--------|
| **License** | MIT |
| **Dependencies** | ProseMirror (core) |
| **Framework support** | React, Vue, vanilla JS |
| **Bundle size** | Modular — include only extensions needed |
| **Browser support** | Modern (Chrome, Firefox, Safari, Edge) |

---

## Integration Options

### React (portal is vanilla; would require React adoption)
- `@tiptap/react` + `@tiptap/starter-kit`
- Hook-based: `useEditor`, `EditorContent`
- Composable API: `<Tiptap>`, `<Tiptap.Content>`, `<Tiptap.BubbleMenu>`

### Vanilla / No Framework
- TipTap can run without React/Vue via `Editor` class directly
- More setup; fewer built-in UI components

### AGNI Fit
- **Portal:** Currently vanilla HTML/CSS/JS. Adding React for TipTap alone may be heavy.
- **Alternative:** Use TipTap headless with vanilla DOM; or defer until portal adopts a framework.
- **Use case:** Rich text for step content (e.g. `fill_blank` prompts, matching items), Markdown/WYSIWYG toggle in author form.

---

## Installation (Reference)

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit
```

---

## Recommendation

- **Short term:** Continue with current form-based author (meta, steps, Validate/Preview/Save). No immediate TipTap integration.
- **Year 2 (Y2–Y6):** Revisit when building step editor (Y2) and YAML round-trip (Y6). TipTap may suit rich-text fields if we adopt React or a similar framework for the author UI.
- **Alternative:** Consider lighter options (e.g. SimpleMDE, EasyMDE for Markdown) if WYSIWYG is not critical.

---

## References

- [TipTap Docs](https://tiptap.dev/docs/editor/installation/react)
- [TipTap Product](https://tiptap.dev/product/editor)
- [ProseMirror](https://prosemirror.net/)
