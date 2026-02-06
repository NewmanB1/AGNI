# 🗺️ The Open Lesson Standard (OLS) Roadmap: First 100 Days

This document outlines the strategic plan to launch the Open Lesson Standard (OLS)—a file format and runtime for offline, sensor-rich education on e-waste hardware.

**Goal:** Establish the `.ols` file standard, build the reference player, and prove the "Web of Trust" governance model.

## 🏗️ Phase 1: The Standard & The Golden Master (Days 1–25)
**Objective:** Define a robust JSON Schema that supports hardware sensors, localization, and cryptographic signatures.

- [ ] **Day 1-5: The Manifesto & Setup**
    - [ ] Initialize Repo with README (Manifesto), LICENSE (AGPLv3), and CONTRIBUTING.
    - [ ] Configure GitHub Pages for documentation.
- [ ] **Day 6-12: The Schema Design (v0.1)**
    - [ ] Define Metadata Layer (Dublin Core + target_profile tags).
    - [ ] Define Hardware Layer (hardware_trigger: accelerometer/vibration).
    - [ ] Define Trust Layer (signatures: Ed25519 array).
    - [ ] Define Logic Layer (gate: prerequisite checks).
- [ ] **Day 13-18: The "Golden Master" Lesson**
    - [ ] Write "Understanding Gravity" in YAML.
    - [ ] Req: User must drop the phone to unlock the next step.
    - [ ] Req: Includes raw LaTeX for math ($$ F = ma $$).
- [ ] **Day 19-25: Validation Tools**
    - [ ] Build `ols-validate` CLI tool (YAML vs JSON Schema).
    - [ ] Translation Stress Test: Fork Golden Master, translate to Spanish, verify pass.

## 📲 Phase 2: The Player & The Data Pipeline (Days 26–50)
**Objective:** Build the "Compiler" that turns YAML into a standalone HTML file, and the "Player" that runs it offline.

- [ ] **Day 26-30: The Compiler (Unified/Remark)**
    - [ ] Build pipeline to parse YAML + Markdown.
    - [ ] Implement "Prerequisite Gate" parser (check skills before loading assets).
- [ ] **Day 31-35: The Hardware Bridge (Preact)**
    - [ ] Build JS runtime for DeviceMotion and Navigator.vibrate.
    - [ ] Implement "Feature Detection" (graceful degradation).
- [ ] **Day 36-40: Telemetry (Inverted Evaluation)**
    - [ ] Implement "Heuristic Logging" (hesitation, rage-shake, abandonment).
    - [ ] **Rule:** Do NOT build a Gradebook. Build a "Lesson Debug Log."
- [ ] **Day 41-45: Portable Sovereignty (Sneakernet)**
    - [ ] Implement Gzip + Base45 compression.
    - [ ] Build "Export Progress" (QR Code generation).
    - [ ] Build "Import Progress" (QR Code parsing + DB merge).
- [ ] **Day 46-50: The Universal Export**
    - [ ] Script build process: `npm run export gravity.yaml` -> `gravity.html` (<500KB).
    - [ ] Test on Android 6.0 device (Airplane Mode).

## 🛡️ Phase 3: Governance & Integration (Days 51–75)
**Objective:** Implement the "Web of Trust" and prepare for external adoption.

- [ ] **Day 51-55: The Sentry Protocol**
    - [ ] Design `trust_policy.json` schema.
    - [ ] Build logic: `if (lesson.signature != trusted) { block() }`.
- [ ] **Day 56-60: Context-Aware Rendering**
    - [ ] Update Player: Hide "blocked" lessons in imported histories (Shadow Records).
- [ ] **Day 61-65: The "Signing Desk"**
    - [ ] Create CLI tool for Orgs to cryptographically sign YAML.
- [ ] **Day 66-70: Outreach & Pitch**
    - [ ] Create "Integration Guide" for Learning Equality (Kolibri).
    - [ ] Build demo of OLS running inside an `<iframe>`.
- [ ] **Day 71-75: Sensory & Accessibility Review**
    - [ ] Test haptics with neurodivergent volunteers.
    - [ ] Refine "Intensity" schema settings.

## 🚀 Phase 4: Launch & Ecosystem (Days 76–100)
**Objective:** Public release, community intake, and preparing for the WYSIWYG editor.

- [ ] **Day 76-80: Public Launch**
    - [ ] Publish Manifesto to HN, Reddit, Dev.to.
- [ ] **Day 81-85: Community Onboarding**
    - [ ] Triage Issues.
    - [ ] Label "Good First Issues" (e.g., Translation).
- [ ] **Day 86-90: The "Code-as-Content" Tutorial**
    - [ ] Record video: "How to Fork and Translate a Lesson."
- [ ] **Day 91-95: Telemetry Analysis Test**
    - [ ] Simulate a "Bad Lesson" (high failure rate).
    - [ ] Demonstrate deprecation workflow.
- [ ] **Day 96-100: Year 2 Prep**
    - [ ] Research TipTap for WYSIWYG editor.
    - [ ] Finalize v1.0 Spec.

## 🔭 Future Horizons (Year 2)
*   **The Editor:** A drag-and-drop GUI that generates valid OLS YAML.
*   **The Plugins:** Official plugins for Moodle, Kolibri, and Canvas.
*   **The Mesh:** Enabling Village Hubs to sync content via LoRa.
