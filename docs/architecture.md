# 🏗️ Open Lesson Standard (OLS): System Architecture

## 1. High-Level Overview
The Open Lesson Standard (OLS) is a decentralized, offline-first protocol for interactive education on resource-constrained hardware.

The system is designed around the "Pipeline, not Platform" philosophy. We do not build a walled garden; we define a file format (`.ols`) and a reference runtime that transforms static text into sensor-rich, interactive experiences.

### Core Design Constraints
*   **Hardware:** Android 6.0+, <2GB RAM, intermittent power.
*   **Network:** 100% Offline capability. Intermittent "Village Sentry" updates.
*   **Input:** Haptic/Sensor-first (Accelerometer, Vibration) + Touch.
*   **Trust:** Decentralized (Web of Trust), no central authority.

---

## 2. The Data Structure (The Standard)
The core of the architecture is the Lesson File. It is a YAML document designed to be human-readable, git-forkable, and machine-executable.

### 2.1 Schema Definition
An OLS file is composed of five strictly defined blocks:
1.  **meta:** Dublin Core metadata, localization tags, and target learner profiles.
2.  **ontology:** The "Skill Contract." What this lesson requires (`requires`) and what it teaches (`provides`).
3.  **signatures:** Cryptographic proofs of authorship and approval (Web of Trust).
4.  **gate:** The logic block that enforces the "Zero-Trust" prerequisite check.
5.  **steps:** The content payload (Text + Hardware Instructions).

### 2.2 Example Schema (`lesson.yaml`)
```yaml
version: "1.0"
meta:
  id: "math-gravity-01"
  title: "Introduction to Gravity"
  language: "en-KE" # English (Kenya)
  license: "AGPL-3.0"
  target_profile: ["haptic_seeker"] 

ontology:
  requires:
    - skill: "ols.physics:observation_basics"
      verifiable: true
  provides:
    - skill: "ols.physics:gravity_concept"
      level: 1

signatures:
  - role: "author"
    entity: "Jane Doe"
    key_id: "ed25519:pub_key_A..."
    signature: "sig_string..."
  - role: "approver"
    entity: "Kenya District 4 Education"
    key_id: "ed25519:pub_key_B..."
    signature: "sig_string..."

gate:
  type: "quiz"
  skill_target: "ols.physics:observation_basics"
  on_fail: "redirect:ols.physics:observation_basics/review"

steps:
  - type: "instruction"
    content: "Hold the device flat in your palm."
  - type: "hardware_trigger"
    sensor: "accelerometer"
    threshold: "freefall > 0.1s"
    feedback: "vibration:success_pattern"
