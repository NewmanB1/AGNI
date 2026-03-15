# UTU Architecture — 3D Coordinate Engine

The UTU (Unit of Teaching and Learning) architecture defines an Atomic Skill as a unique triplet **(Spine, Band, Protocol)**. Lessons target coordinates in this space for governance, portability, and adaptive scheduling.

**Full specification:** [UTU-ARCHITECTURE-FULL.md](UTU-ARCHITECTURE-FULL.md) — detailed architecture, schemas, governance, LMS integration, and implementation reference.

**Data schema:** `UTU_Unit = { spineId, band, protocol }`

- **spineId** (or `class`): Disciplinary Spine ID
- **band**: Developmental band (1–6)
- **protocol**: Pedagogical protocol (1–5)

---

## I. Dimension P: Pedagogical Protocol

Operational state of the learner. Each ordinal is a prerequisite for the next in the lifecycle of deep mastery.

| ID | Protocol | Cognitive Role | Failure Mode |
|----|----------|----------------|--------------|
| P1 | Transmission | Schema acquisition: high-fidelity data loading and modeling | Passive Familiarity Illusion: recognition without ability to act |
| P2 | Guided Construction | Conceptual restructuring: merging new data with existing schema | Cognitive Flailing: inquiry without stable P1 buffer |
| P3 | Apprenticeship | Proceduralization: hard-coding the model into a fluid skill | Mimicry: execution without underlying abstraction |
| P4 | Dev. Sequencing | Stabilization: matching task complexity to biological bandwidth | Lockstep Stagnation: rigid, non-adaptive pacing |
| P5 | Meaning Activation | Transfer: deploying the skill in high-stakes, authentic context | Activity without Rigor: high engagement, zero structural output |

---

## II. Disciplinary Spines

Cross-cultural semantic constants. Lessons in one culture can be ported to another by preserving Spine coordinates.

### Mathematical Spine (MAC)

| ID | Description |
|----|-------------|
| MAC-1 | Quantification: composition, decomposition, conservation of quantity |
| MAC-2 | Transformation: how actions change states while preserving structure |
| MAC-3 | Relation & Structure: meaning as a function of connections/constraints |
| MAC-4 | Representation: translation between external encodings (symbols/tools) |
| MAC-5 | Invariance & Equivalence: what survives change (congruence) |
| MAC-6 | Composition/Decomposition: complexity as structured assembly |
| MAC-7 | Uncertainty & Variation: quantifiable structure within non-fixed outcomes |
| MAC-8 | Justification & Generalization: the study of necessity and proof |

### Science Spine (SCI)

| ID | Description |
|----|-------------|
| SCI-1 | System Observation: disciplined noticing as root of knowledge |
| SCI-2 | Pattern Detection: moving from event to expectation via repetition |
| SCI-3 | Model Construction: imagining mechanisms to explain the unseen |
| SCI-4 | Testing & Intervention: strengthening knowledge through interaction |
| SCI-5 | Scale Navigation: relating micro-phenomena to macro-consequences |
| SCI-6 | Uncertainty Management: quantifying reliability and known-ness of claims |
| SCI-7 | Knowledge Revision: self-correction and being "less wrong" |

### Social Studies Spine (SOC)

| ID | Description |
|----|-------------|
| SOC-1 | Collective Organization: solving coordination via roles and norms |
| SOC-2 | Resource Exchange: negotiated allocation of value and scarcity |
| SOC-3 | Authority & Legitimacy: justification and contestation of power |
| SOC-4 | Cultural Expression: meaning systems that stabilize group identity |
| SOC-5 | Historical Continuity: reconstructing the past to guide action |
| SOC-6 | Human–Environment Interaction: co-evolution of culture and landscape |
| SOC-7 | Perspective Taking: social truth is multi-voiced |

---

## III. Dimension B: Developmental Bands

Processor resolution of the learner (B1–B6).

| Band | Phase |
|------|-------|
| B1–B2 | Embodied/Representational: action-based and iconic reasoning |
| B3–B4 | Operational/Structural: procedural mastery moving to abstract relations |
| B5–B6 | Hypothetical/Formal: systemic modeling and epistemic validation |

---

## IV. Canonical Spine IDs (for validation and pickers)

```
MAC-1, MAC-2, MAC-3, MAC-4, MAC-5, MAC-6, MAC-7, MAC-8
SCI-1, SCI-2, SCI-3, SCI-4, SCI-5, SCI-6, SCI-7
SOC-1, SOC-2, SOC-3, SOC-4, SOC-5, SOC-6, SOC-7
```

Governance and authoring UIs may use this list for dropdowns and validation. Schema allows any string for `class`/`spineId` to support future spines.

**Machine-readable constants:** `data/utu-constants.json` — protocols (P1–P5 with Cognitive Role, Failure Mode), spines (MAC, SCI, SOC with IDs and descriptions), spineIds flat list, and bands (B1–B6). Authoring and governance tools can import this file for pickers, validation, and failure-mode hints.

---

## V. Governance Logic

- **Portability Check:** Lesson targets a valid Spine ID and Band.
- **Rigor Check:** Instructional design moves learner through P1 → P2 → P3 (protocol progression).
- **Failure Analysis:** If students show "Mimicry," system identifies P3 implementation error and requires P2 intervention.
