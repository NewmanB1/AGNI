# R5: TipTap WYSIWYG Research

**Status:** Complete  
**Decision:** Form-based builder (not TipTap) for OLS authoring.

---

## Summary

TipTap was evaluated for use as a WYSIWYG editor in the AGNI authoring portal. The conclusion: **TipTap is not a good fit** for OLS lesson authoring. A form-based builder (already implemented in the portal) is the chosen approach.

---

## TipTap Overview (2024)

| Attribute | Value |
|-----------|-------|
| **Type** | Headless rich-text editor (ProseMirror-based) |
| **License** | MIT (core); paid Pro extensions |
| **Output** | JSON (ProseMirror doc) or Markdown |
| **Bundle** | Modular; ~200 KB+ with typical starter kit |
| **Frameworks** | React, Vue, Svelte, vanilla JS |

TipTap excels at **document-like content** (blogs, notes, long-form prose). It is extensible via custom nodes and marks.

---

## OLS Requirements

OLS lessons are **structured records**, not flowing prose:

- **meta:** identifier, title, language, license, UTU (Spine/Band), difficulty
- **steps:** Ordered array of typed steps (instruction, hardware_trigger, quiz, fill_blank, etc.)
- **gate:** type, question, expected_answer, passing_score
- **ontology:** requires/provides (skills)

Each step type has different fields (e.g. `hardware_trigger` has sensor, threshold, feedback; threshold uses a custom grammar).

---

## Fit Analysis

| Criterion | TipTap | Form-based builder |
|-----------|--------|--------------------|
| **OLS fidelity** | Rich-text → YAML is lossy; steps/gates/thresholds have no natural document mapping | 1:1 form fields → OLS YAML |
| **Threshold syntax** | Would need custom node per sensor expression | Plain input + `POST /api/author/validate` |
| **Offline** | Large runtime, CDN dependencies | Zero extra deps; portal is vanilla |
| **Accessibility** | Editor a11y is hard | Standard form controls |
| **Bundle size** | ~200 KB+ | None (forms only) |

---

## Decision

**Do not adopt TipTap** for the OLS editor. Use the existing form-based builder in the portal (`/author/new`, step cards, gate/ontology sections).

**Rationale:** OLS lessons are structured data. Mapping them to a rich-text document model would require custom ProseMirror nodes for every step type, gate, and threshold — effectively rebuilding the form inside TipTap with worse a11y and a larger bundle.

**Future:** If a future use case needs rich-text editing (e.g. instruction step content with bold/links), TipTap could be evaluated as a **per-field** editor for that specific `content` field, not for the whole lesson structure.

---

## References

- **Full evaluation:** `docs/YEAR2-PREP.md` §1
- **Form-based implementation:** Portal `/author/new`, `packages/agni-hub/routes/author.js`
- **TipTap:** https://tiptap.dev/
