# OLS Quick Reference

Condensed summary for rapid lookup. See `docs/ARCHITECTURE.md` for the canonical single source of truth.

---

## High-Level Flow

```
YAML → Compiler → IR → HTML/Native → Player
                    ↓
Theta (skill graph) + LMS (adaptive selection)
```

**Philosophy:** Source-to-Artifact. Lightweight YAML distributed; artifacts compiled JIT at Village Hub.

---

## Core Components

| Component | Role |
|-----------|------|
| **Sources** | YAML lessons |
| **Hub** (Raspberry Pi) | Compiler, IR, Theta, LMS engine, hub-transform |
| **Outputs** | HTML bundles (browser), Native bundles (Android/Kotlin/Flutter) |
| **Devices** | Browser or native player |
| **Portal** | Teacher/admin oversight UI |

---

## Lesson YAML Structure

```yaml
meta:      # Title, rights, UTU class/band
ontology:  # requires / provides skills (prerequisites)
gate:      # Zero-trust prerequisite enforcement
steps:     # Content: text, hardware instructions, SVG parameters
```

**SVG Factory Pattern:** Lessons reference specs; device generates visuals locally:
```yaml
- type: "svg"
  spec:
    type: "pendulum"
    params: { length: 120, bob_radius: 12 }
```

---

## Compiler & Hub

- **IR:** Pre-rendered HTML, inferredFeatures, ontology, compiler metadata
- **Sidecar:** `{lesson}-ir.json` for adaptive engines
- **Modules:** Rasch (ability), Thompson (bandit), Embeddings (latent factors), Federation (posterior merge)

---

## Adaptive Graph Engine

| Layer | Responsibility |
|-------|----------------|
| **Theta** | Prerequisite enforcement (BFS, DAG), MLC ordering |
| **LMS** | Rasch + Thompson + embeddings for next-lesson selection |
| **Skill Collapse** | Affects sort only, never eligibility |

---

## Knowledge Architecture

- **UTUs:** Taxonomy layer (governance, discovery). Example: `MAC-2 Band 4`
- **Skill Ontology:** Sequencing layer. `ontology.requires` / `ontology.provides` edges

---

## Security

- **Device binding:** `Hash(Content + NUL + UUID)` signed with Ed25519. Content = full lesson script (nonce + factory-loader + LESSON_DATA + globals + player), not IR only. HTML wrapper and external factory files are not signed.
- **Lesson vs resource bundles:** Lesson bundle (HTML + inline script) is signed; resource bundle (factories, styles, media) is pre-cached, arrives independently, and relies on trusted paths. See `docs/ARCHITECTURE.md` §4 and `docs/playbooks/village-security.md` §6.
- **Runtime checks:** Identity match → Unauthorized Copy; Signature match → Corrupted File
- **Trust:** Hub-and-Spoke for content; Mesh for signaling (P2P interaction only)

---

## Key Paths

| Concern | Location |
|---------|----------|
| Compiler | `packages/ols-compiler/` |
| Theta | `packages/agni-hub/theta.js` |
| LMS | `packages/agni-engine/` |
| Player | `packages/agni-runtime/ui/player.js` |
| Integrity | `packages/agni-runtime/integrity/integrity.js` |
