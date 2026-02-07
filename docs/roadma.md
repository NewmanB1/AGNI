Here is the complete, updated `docs/roadmap.md`.

I have updated **Phase 2** to prioritize the **Graph Engine ($\theta$)** over simple telemetry, and **Phase 3** to include the generation of `graph_weights.json`.

Copy and paste this entire block into `docs/roadmap.md`.

***

# 🗺️ The Open Lesson Standard (OLS) Roadmap: First 100 Days

This document outlines the strategic plan to launch the Open Lesson Standard (OLS)—a file format and runtime for offline, sensor-rich, and culturally adaptive education.

**Goal:** Establish the `.ols` file standard, build the reference player, and prove the "Skill Collapse" ($\theta$) navigation model.

## 🏗️ Phase 1: The Standard & The Golden Master (Days 1–25)
**Objective:** Define a robust JSON Schema that supports hardware sensors, localization, and Set Theory categorization.

- [x] **Day 1-5: The Manifesto & Setup**
    - [x] Initialize Repo with README, LICENSE, and CONTRIBUTING.
    - [x] Configure GitHub Pages for documentation.
- [x] **Day 6-12: The Schema Design (v1.4)**
    - [x] Define Metadata Layer (Dublin Core + Set Theory `subject` tags).
    - [x] Define Hardware Layer (Threshold Syntax: `freefall > 0.2s`).
    - [x] Define Logic Layer (Gate w/ `skill_target`).
    - [ ] **Action:** Finalize `graph_weights.schema.json` for the Sentry.
- [ ] **Day 13-18: The "Golden Master" Lesson**
    - [x] Write "Understanding Gravity" in YAML.
    - [ ] Req: User must drop the phone to unlock the next step.
    - [ ] Req: Verify Validator passes the new Threshold Syntax.
- [ ] **Day 19-25: Validation Tools**
    - [x] Build GitHub Actions workflow (`validate.yml`).
    - [ ] Translation Stress Test: Fork Golden Master, translate to Spanish, verify pass.

## 📲 Phase 2: The Player & The Graph Engine (Days 26–50)
**Objective:** Build the runtime that transforms YAML into an interactive experience and implements the "Skill Collapse" navigation logic.

- [ ] **Day 26-30: The Compiler (Unified/Remark)**
    - [ ] Build pipeline to parse YAML + Markdown.
    - [ ] Implement "Prerequisite Gate" parser (check skills before loading assets).
- [ ] **Day 31-35: The Navigation Logic ($\theta$)**
    - [ ] Implement `graph_weights.json` parser in the Player.
    - [ ] Build the Sorting Algorithm: `Lessons.sort((a,b) => theta(a) - theta(b))`.
    - [ ] **Formula:** $\theta = \text{BaseCost} - \text{CohortDiscount}$.
- [ ] **Day 36-40: The Hardware Bridge (Preact)**
    - [ ] Build JS runtime for DeviceMotion and Navigator.vibrate.
    - [ ] Implement "Feature Detection" (graceful degradation if sensors are missing).
    - [ ] Implement the Regex Parser for Threshold Syntax (`freefall > 0.2s`).
- [ ] **Day 41-45: Portable Sovereignty (Sneakernet)**
    - [ ] Implement Gzip + Base45 compression.
    - [ ] Build "Export Progress" (QR Code generation).
    - [ ] Build "Import Progress" (QR Code parsing + DB merge).
- [ ] **Day 46-50: The Universal Export**
    - [ ] Script build process: `npm run export gravity.yaml` -> `gravity.html` (<500KB).
    - [ ] Test on Android 6.0 device (Airplane Mode).

## 🛡️ Phase 3: Governance & Adaptation (Days 51–75)
**Objective:** Implement the "Web of Trust" and the Sentry logic that generates cultural adaptations.

- [ ] **Day 51-55: The Sentry Protocol (Trust)**
    - [ ] Design `trust_policy.json` schema.
    - [ ] Build logic: `if (lesson.signature != trusted) { block() }`.
- [ ] **Day 56-60: The Sentry Protocol (Adaptation)**
    - [ ] Build the Log Aggregator (Anonymized Telemetry).
    - [ ] Create the logic to detect "Skill Collapse" (Correlation between Skill A mastery and Skill B speed).
    - [ ] Output: Generate `graph_weights.json` for specific cohorts.
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
- [ ] **Day 91-95: Graph Verification Test**
    - [ ] Simulate a "Weaver Cohort" vs "Farmer Cohort."
    - [ ] Prove that the Lesson Menu reorders itself differently for each group using the same content.
- [ ] **Day 96-100: Year 2 Prep**
    - [ ] Research TipTap for WYSIWYG editor.
    - [ ] Finalize v1.0 Spec.

## 🔭 Future Horizons (Year 2)
*   **The Editor:** A drag-and-drop GUI that generates valid OLS YAML.
*   **The Plugins:** Official plugins for Moodle, Kolibri, and Canvas.
*   **The Mesh:** Enabling Village Hubs to sync `graph_weights.json` via LoRa to share cultural adaptations between villages.
