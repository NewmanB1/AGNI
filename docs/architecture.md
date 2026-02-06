
This document should be saved as /docs/architecture.md in your repository. It serves as the "Source of Truth" for developers joining the project.

🏗️ Open Lesson Standard (OLS): System Architecture
1. High-Level Overview

The Open Lesson Standard (OLS) is a decentralized, offline-first protocol for interactive education on resource-constrained hardware.

The system is designed around the "Pipeline, not Platform" philosophy. We do not build a walled garden; we define a file format (.ols) and a reference runtime that transforms static text into sensor-rich, interactive experiences.

Core Design Constraints

Hardware: Android 6.0+, <2GB RAM, intermittent power.

Network: 100% Offline capability. Intermittent "Village Sentry" updates.

Input: Haptic/Sensor-first (Accelerometer, Vibration) + Touch.

Trust: Decentralized (Web of Trust), no central authority.

2. The Data Structure (The Standard)

The core of the architecture is the Lesson File. It is a YAML document designed to be human-readable, git-forkable, and machine-executable.

2.1 Schema Definition

An OLS file is composed of five strictly defined blocks:

meta: Dublin Core metadata, localization tags, and target learner profiles.

ontology: The "Skill Contract." What this lesson requires (requires) and what it teaches (provides).

signatures: Cryptographic proofs of authorship and approval (Web of Trust).

gate: The logic block that enforces the "Zero-Trust" prerequisite check.

steps: The content payload (Text + Hardware Instructions).

2.2 Example Schema (lesson.yaml)
code
Yaml
download
content_copy
expand_less
version: "1.0"
meta:
  id: "math-gravity-01"
  title: "Introduction to Gravity"
  language: "en-KE" # English (Kenya)
  license: "AGPL-3.0"
  target_profile: ["haptic_seeker"] # For neurodivergent matching

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
3. The Runtime Architecture (The Player)

The "Player" is a lightweight Progressive Web App (PWA) built with Preact. It acts as the bridge between the static YAML and the physical hardware.

3.1 The "Universal Export" Pipeline

To ensure performance on low-end devices, we do not parse YAML on the phone at runtime. We use a Build Step.

Author (YAML) -> Compiler (Node.js/Unified) -> Static HTML Bundle (<500KB) -> Phone

Compiler: Embeds the lesson logic, assets, and a minimal Preact runtime into a single index.html file.

Asset Strategy: Images are Base64 encoded or referenced relative to the bundle to ensure zero external requests.

3.2 The Hardware Abstraction Layer (HAL)

The Player includes a JavaScript abstraction layer to handle hardware fragmentation safely.

Feature Detection: Checks if ('vibrate' in navigator).

Graceful Degradation:

Device A (Has Motor): Vibrate on success.

Device B (No Motor): Flash screen on success.

Sensor Noise Filter: Implements a low-pass filter on DeviceMotion events to distinguish "intent" from "shaky hands."

4. The Data Strategy (Inverted Evaluation)

We do not store "Grades." We store Skills and Telemetry.

4.1 The Student Skill Wallet

Stored locally in IndexedDB on the browser. It represents the student's "RPG Skill Tree."

code
JSON
download
content_copy
expand_less
{
  "student_id": "local_user_1",
  "skill_ledger": {
    "ols.math:addition": {
      "status": "mastered",
      "last_verified": 1715000000,
      "source": "lesson_id_123",
      "decay_risk": "low"
    }
  }
}
4.2 Heuristic Telemetry (Log)

We evaluate the lesson. Data is aggregated anonymously to detect bad content.

Frustration Signals: Rapid tapping, high-G-force shaking (rage quit), long idle times.

Gate Failure Rates: If 40% of students fail the Gate of Lesson B, the system flags Lesson A (the prerequisite source) as "Ineffective."

5. Governance & Trust Architecture
5.1 The Web of Trust (WoT)

We use Ed25519 signatures.

The Keyring: Each "Village Sentry" (Raspberry Pi Hub) holds a JSON file of trusted Public Keys (trust_policy.json).

The Check: When a lesson is requested:

Sentry extracts signatures from lesson.yaml.

Sentry checks if any signature matches a key in the trust_policy.json with allow permission.

If Match: Serve file.

If No Match: Block file (or flag as "Unverified").

5.2 Context-Aware Rendering

When a student moves between regions (e.g., Refugee Camp A -> Camp B):

Student imports "Skill Wallet" via QR Code.

Player checks the Skill Wallet against Camp B's trust_policy.

Result: Skills earned from "Untrusted Sources" are hidden in the UI but preserved in the database (Shadow Record).

6. Network Topology (Offline Sync)
6.1 The Village Sentry (Hub)

Hardware: Raspberry Pi 4 + Starlink + High-Gain Wi-Fi.

Role:

CDN: Caches the static HTML bundles.

Gatekeeper: Enforces the trust_policy.json.

Aggregator: Collects anonymous telemetry logs from phones via Wi-Fi and batched-uploads to GitHub/Cloud when satellite link is active.

6.2 The Sneakernet Protocol (P2P)

For moving data between devices without a Sentry:

Export: Profile is compressed using Gzip + Base45.

Transport: Rendered as a sequence of QR Codes.

Import: Camera scans QR, validates checksum, decrypts, and merges into local IndexedDB.

7. Development Roadmap Integration

Phase 1: Define the YAML Schema (Section 2) and Hardware Layer (Section 3.2).

Phase 2: Build the Compiler (Section 3.1) and Skill Wallet Logic (Section 4.1).

Phase 3: Implement Ed25519 Signatures (Section 5) and Sentry Logic (Section 6.1).
