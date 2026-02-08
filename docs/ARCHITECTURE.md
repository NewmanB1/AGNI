# 🏗️ Open Lesson Standard (OLS): System Architecture

## 1. High-Level Overview
The Open Lesson Standard (OLS) is a decentralized, offline-first protocol for interactive education on resource-constrained hardware.

The system is designed around the "Pipeline, not Platform" philosophy. We do not build a walled garden; we define a file format (`.ols`) and a reference runtime that transforms static text into sensor-rich, interactive experiences.

### Core Design Constraints
*   **Hardware:** Android 6.0+, <2GB RAM, intermittent power.
*   **Network:** 100% Offline capability. Intermittent "Village Sentry" updates.
*   **Input:** Haptic/Sensor-first (Accelerometer, Vibration) + Touch.
*   **Trust:** Decentralized (Web of Trust), no central authority.
*   **Epistemic Pluralism:** The system does not enforce a single "correct" learning order. It adapts to local "Generative Metaphors" (e.g., if Weaving makes Math easier for a specific village, the system prioritizes that path).

---

## 2. The Data Structure (The Standard)
The core of the architecture is the Lesson File. It is a YAML document designed to be human-readable, git-forkable, and machine-executable.

### 2.1 Schema Definition
An OLS file is composed of five strictly defined blocks:
1.  **meta:** Dublin Core metadata (`subject`, `rights`, `coverage`).
2.  **ontology:** The "Skill Contract." What this lesson requires (`requires`) and what it teaches (`provides`).
3.  **signatures:** Cryptographic proofs of authorship and approval (Web of Trust).
4.  **gate:** The logic block that enforces the "Zero-Trust" prerequisite check.
5.  **steps:** The content payload (Text + Hardware Instructions).

### 2.2 Example Schema (`lesson.yaml`)
```yaml
version: "1.5"
meta:
  identifier: "math-gravity-01"   # FIXED: Matches Schema
  title: "Introduction to Gravity"
  rights: "AGPL-3.0"              # FIXED: Matches Schema
  subject: ["Physics", "Classical Mechanics"]
  target_profile: ["haptic_seeker"] 

ontology:
  requires:
    - skill: "ols.physics:observation_basics"
      verifiable: true            # FIXED: Now allowed in Schema
  provides:
    - skill: "ols.physics:gravity_concept"
      level: 1

signatures:
  - role: "author"
    entity: "Jane Doe"
    key_id: "ed25519:pub_key_A..." # FIXED: Added for completeness
    signature: "sig_string..."

gate:
  type: "quiz"
  skill_target: "ols.physics:observation_basics"
  # Quiz types now MUST include question/answer
  question: "What is the unit of gravity?"
  expected_answer: "m/s2"
  on_fail: "redirect:ols.physics:observation_basics/review"

steps:
  - type: "instruction"
    content: "Hold the device flat in your palm."
  - type: "hardware_trigger"
    sensor: "accelerometer"
    threshold: "freefall > 0.1s" # Matches Regex Pattern
    feedback: "vibration:success_pattern"
```

---

## 3. The Runtime Architecture (The Player)
The "Player" is a lightweight Progressive Web App (PWA) built with Preact. It acts as the bridge between the static YAML and the physical hardware.

### 3.1 The "Universal Export" Pipeline
To ensure performance on low-end devices, we do not parse YAML on the phone at runtime. We use a Build Step.

`Author (YAML) -> Compiler (Node.js/Unified) -> Static HTML Bundle (<500KB) -> Phone`

*   **Compiler:** Embeds the lesson logic, assets, and a minimal Preact runtime into a single `index.html` file.
*   **Asset Strategy:** Images are Base64 encoded or referenced relative to the bundle to ensure zero external requests.

### 3.2 The Hardware Abstraction Layer (HAL)
The Player includes a JavaScript abstraction layer to handle hardware fragmentation safely.
*   **Feature Detection:** Checks if `('vibrate' in navigator)`.
*   **Graceful Degradation:** 
    *   *Device A (Has Motor):* Vibrate on success.
    *   *Device B (No Motor):* Flash screen on success.
*   **Sensor Noise Filter:** Implements a low-pass filter on `DeviceMotion` events to distinguish "intent" from "shaky hands."

---

## 4. The Adaptive Graph Engine (Navigation)
Instead of a static list or a linear curriculum, OLS uses a probabilistic graph to order lessons based on **Marginal Learning Cost ($\theta$)**.

### 4.1 The Core Concept: Skill Collapse
We assume that for certain cohorts, mastering Skill A makes Skill B trivial (a "Skill Collapse" or "Generative Metaphor").
*   **$\theta$ (Theta):** A distance metric representing the estimated effort for a specific student to master a specific lesson.
*   **Formula:** $\theta = \text{BaseCost} (1.0) - \text{CohortDiscount}$

### 4.2 The Artifact: `graph_weights.json`
The "Village Sentry" analyzes local learning logs to detect these collapses. It generates a lightweight JSON file that the Player downloads during sync.
*   **Nodes:** Skill IDs (e.g., `ols.math:ratios`).
*   **Edges:** Observed probability that Skill A facilitates Skill B.
    *   *Example:* If a cohort of weavers easily understands coding loops, the edge `weaving -> loops` has a low weight (e.g., 0.1).

### 4.3 The Player Logic (Runtime)
When a student opens the lesson menu, the Player performs this sorting operation:
1.  **Filter (Governance):** Select all lessons where `prerequisites` are met **AND** the lesson signature is `authorized` by the local Trust Policy.
2.  **Calculate Cost (Theta):** For each candidate lesson, calculate $\theta$ based on the student's existing skills and the local `graph_weights.json`.
3.  **Sort:** Present lessons with the lowest $\theta$ (lowest cognitive load) at the top of the list.

**Result:** A student with a background in weaving sees "Loops" at the top; a student with a background in farming might see "Modulo Arithmetic" at the top. The software adapts to the culture.

---

## 5. Governance & Trust Architecture

### 5.1 The Trust Enforcement Layers
We distinguish between preventing malicious content (The Firewall) and managing context (The Context Engine).

**A. The Village Sentry (The Firewall)**
*   **Role:** The authoritative gatekeeper for the local network.
*   **Data:** Holds the master `trust_policy.json` (e.g., "Trust Red Cross keys, Block unknown keys").
*   **Action:** It strictly refuses to download, host, or serve any `.ols` file that is not signed by a trusted key.
    *   *Result:* Malicious or unverified lesson files never physically reach the student's device via the local Wi-Fi.

**B. The Player (The Context Engine)**
*   **Role:** The logic handler on the student's device.
*   **Data:** Holds a cached copy of the `trust_policy.json` and the Student's "Skill Wallet."
*   **Action (The Shadow Record):**
    *   When a student imports a history via QR code (Sneakernet) from a different region, the Player parses the log.
    *   *Scenario:* The log contains `completed: math-gravity` signed by `UnknownKey_X`.
    *   **Behavior:** The Player **does not delete** this record (it belongs to the student). Instead, it marks it as a **"Shadow Record."**
    *   **Effect:** The skill is ignored during "Prerequisite Checks" for new lessons in the current village.
    *   **Reactivation:** If the student later moves to a village that *trusts* `UnknownKey_X`, the Shadow Record automatically un-hides and counts towards progress.

### 5.2 The Web of Trust (WoT) Implementation
We use **Ed25519** signatures.
*   **The Keyring:** A JSON list of public keys and their roles (Author, Reviewer, Translator).
*   **The Verification:**
    *   **Step 1 (Sentry):** Validate file signature against `trust_policy.json` before caching.
    *   **Step 2 (Player):** Validate history signatures against `trust_policy.json` before rendering the Skill Tree.
---

## 6. Network Topology (Offline Sync)

### 6.1 The Village Sentry (Hub)
*   **Hardware:** Raspberry Pi 4 + Starlink + High-Gain Wi-Fi.
*   **Role:**
    *   **CDN:** Caches the static HTML bundles.
    *   **Gatekeeper:** Enforces the `trust_policy.json`.
    *   **Aggregator:** Collects anonymous telemetry logs from phones to calculate `graph_weights.json`.

### 6.2 The Sneakernet Protocol (P2P)
For moving data between devices without a Sentry:
*   **Export:** Profile is compressed using **Gzip + Base45**.
*   **Transport:** Rendered as a sequence of QR Codes.
*   **Import:** Camera scans QR, validates checksum, decrypts, and merges into local IndexedDB.
