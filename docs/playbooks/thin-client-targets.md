# Thin client targets (Phase 6)

Use this when building or consuming lesson artifacts for **thin clients**: runtimes that do not use the full HTML/JS bundle (e.g. native Android/Kotlin, Flutter, or a minimal YAML renderer).

## Output formats

| Format | Builder | Output layout | Consumer |
|--------|---------|----------------|----------|
| **HTML** | `src/builders/html.js` | Single HTML + `lesson-ir.json` + shared assets | Browser, WebView, PWA |
| **Native** | `src/builders/native.js` | `lesson.json` + `content/*.md` + `lesson-ir.json` | Native app that parses JSON and renders Markdown |
| **YAML packet** | `src/builders/yaml-packet.js` | `lesson.yaml` + `packet.json` + `lesson-ir.json` | Client that parses OLS YAML and renders (e.g. custom runtime) |

## Native bundle (Strategy B)

- **Build:** `node src/cli.js lessons/gravity.yaml --format=native --output-dir=dist/native-gravity`
- **Contents:**
  - `lesson.json` — manifest with `meta`, `ontology`, `gate`, `inferredFeatures`, `steps` (each step has `content_src` pointing to `content/step-NN.md`; no inline content).
  - `content/step-01.md`, `content/step-02.md`, … — raw Markdown per step.
  - `lesson-ir.json` — metadata sidecar for theta/LMS indexing (identifier, ontology, difficulty, etc.).
- **Pipeline:** Same as HTML: parse → validate → buildIR → buildNative(ir). The native builder receives the full IR so ontology and inferred features are included.

## YAML packet

- **Build:** `node src/cli.js lessons/gravity.yaml --format=yaml-packet --output-dir=dist/yaml-gravity`
- **Contents:**
  - `lesson.yaml` — the original OLS source YAML (unchanged).
  - `packet.json` — minimal manifest for discovery (identifier, title, language, schemaVersion, compiledAt, ontology, difficulty).
  - `lesson-ir.json` — full metadata sidecar for theta indexing.
- **Use case:** Thin clients that prefer to parse YAML (e.g. with a small OLS parser) and render steps themselves, without using the JSON native manifest.

## Theta / hub indexing

Both native and yaml-packet outputs include `lesson-ir.json`. When the hub serves these formats (e.g. from a static dir or on-demand), theta can rebuild its lesson index from the sidecar files without parsing the full lesson content.

## Phase 6 status

- **native.js** — Implemented; wired to IR pipeline; writes sidecar.
- **yaml-packet.js** — Implemented; thin-client YAML distribution format.
- **Thin client targets** — Documented in this playbook; ARCHITECTURE Phase 6 row set to Complete.
