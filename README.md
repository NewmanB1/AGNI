# AGNI
Ed Tech


The Open Lesson Standard (OLS)
The "MP3" for Offline, Sensor-Rich Education
![alt text](https://img.shields.io/badge/Status-Phase_1:_Architecture-blue)
![alt text](https://img.shields.io/badge/License-AGPL_v3-green)
![alt text](https://img.shields.io/badge/Platform-Mobile_Web-orange)
![alt text](https://img.shields.io/badge/Hardware-Android_6.0%2B-lightgrey)
📜 The Manifesto
We are not building a platform. We are not building a Learning Management System (LMS). We are not building a "Netflix for Education."
We are building a standard.
In the music industry, the MP3 format liberated audio. It allowed music to be stored on any device, shared offline, and played without needing the original recording studio.
The Open Lesson Standard (OLS) aims to do the same for interactive education.
The Problem
    • The Hardware Exists: Millions of repurposed smartphones ("e-waste") are available in resource-poor areas. They have screens, batteries, and powerful sensors (accelerometers, vibration motors), but they are too old to run modern apps.
    • The Software is Broken: Modern EdTech relies on video streaming (bandwidth heavy), always-on internet (impossible in refugee camps), and "walled gardens" (impossible to fork or localize).
    • The Interaction is Passive: Most digital learning is just "watch a video and click A, B, or C." It ignores the physical world.
The Solution: "H5P for Hardware"
We are creating a file format and a rendering pipeline that turns high-quality, interactive lessons into tiny (<500KB) single-file HTML bundles that run offline on 10-year-old devices.
We treat the phone not as a miniature laptop, but as a physical game controller.

🛠️ Tech Stack & Architecture
1. The Standard (.ols / .yaml)
Lessons are defined in human-readable YAML. This represents "Code-as-Content."
    • Git-Native: Lessons are stored in version control.
    • Forkable: A teacher can fork a lesson to translate the text without breaking the logic.
    • Atomic: Each lesson teaches one tiny concept.
code Yaml
downloadcontent_copy
expand_less
# Example OLS Snippet
meta:
  id: "math-gravity-001"
  title: "Understanding Gravity"
  version: "1.0.0"
  target_profile: ["haptic_seeker", "kinetic"]
  prerequisites: ["math-intro-physics"]

# The Web of Trust Layer
signatures:
  - entity: "Jane Doe (Author)"
    signature: "ed25519_sig_abc123..."
  - entity: "Global Math Alliance (Reviewer)"
    signature: "ed25519_sig_xyz789..."

# The "Anti-Cheat" Gate (Zero-Trust)
gate:
  - type: quiz
    skill_check: "basic_observation"
    question: "Which falls faster?"
    on_fail: "redirect_to_prerequisite"

steps:
  - type: instruction
    text: "Hold your phone flat. Drop it onto a soft surface (like a pillow)."
  
  # Hardware Instruction Set
  - type: hardware_trigger
    sensor: accelerometer
    condition: "freefall > 0.2s"
    on_success: 
      feedback: "vibration_pattern_success"
      action: "next_step"
2. The Compiler (The Pipeline)
We use a Unified/Remark pipeline to compile the YAML + Logic + Assets into a Single HTML File.
    • Zero Dependencies: The output file needs no server, no database, and no internet.
    • Lightweight: Aiming for <500KB per lesson.
3. The Runtime (The Player)
A micro-app built with Preact that serves as the interface between the HTML lesson and the phone's hardware APIs.
    • Sensors: Accesses Vibration API, DeviceMotion, and Touch events.
    • Heuristic Telemetry: Logs behavior (shakes, hesitations) rather than just "scores."

🌍 Core Philosophy
1. Infrastructure, Not Platform
We provide the protocol.
    • Year 1: We provide a reference "Player" app.
    • Year 2: We build plugins so OLS files can run inside Kolibri, Moodle, or be embedded in any website.
2. Inverted Evaluation: The Lesson is Tested, Not the Student
In traditional EdTech, if a student fails a quiz, the student is marked as "deficient." In OLS, we assume the student is capable and the content is the variable.
    • No Gradebooks: We do not store student profiles or report cards in the cloud.
    • Rich Telemetry: We record "Frustration Signals" (e.g., accelerometer shaking, erratic tapping).
    • The Loop: If 50% of students in a village struggle with Step 3, the Sentry flags Step 3 as "Buggy." The data is aggregated and sent back to the repo so the author can fix the lesson. We debug education.
3. Sovereign Governance (Web of Trust)
We do not decide what is appropriate for a learner in a remote village; their community does.
    • The Keyring: The local "Sentry" (Village Hub) is configured with a list of trusted public keys.
    • Decentralization: A village can say, "We trust content signed by the Red Cross and the Local District, but block everything else." This allows global sharing with local control.
4. Portable Sovereignty (Sneakernet)
Refugees move. Devices break. Governance changes.
    • The Data Travels with the Human: Students can export their progress as a compressed QR code or text string. This allows them to restore their history on a different device in a new camp without internet.
    • Context-Aware Visibility: If a student moves to a region that blocks certain content (based on signatures), that content is hidden, not deleted. It remains in their digital passport, ready to be reactivated if they move to a compatible region.
5. Zero-Trust Continuity (The "Gatekeeper")
We do not rely on identities to prevent cheating; we rely on competence.
    • The Gate: Every lesson begins with a "Prerequisite Gate"—a short check of the skills required for the lesson.
    • Self-Correction: If a student shares a QR code transcript to "cheat," they will fail the Gate of the next lesson.
    • Data Signal: High failure rates at the "Gate" of Lesson B are the primary metric we use to identify that Lesson A failed to teach the material.

🚫 Anti-Goals
    • No "Student Grades": We track mastery to unlock the next step, but we do not judge the user. We evaluate the efficacy of the lesson file.
    • No Central Censor: We (the developers) cannot ban books. We build the cryptography tools so local communities can enforce their own Web of Trust.
    • No AI/Computer Vision: We will not use the camera for facial analysis. It drains battery, lags on old hardware, and violates cultural privacy norms.
    • No Video Hosting: OLS is for interactive, procedural content. Video is too heavy for our target infrastructure.

🗓️ Roadmap (Phase 1: First 100 Days)
    • Days 1-25: Define the JSON Schema (Metadata, Trust, Gates) and build the "Golden Master" lesson.
    • Days 26-50: Build the Compiler to generate standalone HTML files and the Player to handle offline logic.
    • Days 51-75: Establish Governance Protocols (Web of Trust) and reach out to Learning Equality (Kolibri).
    • Days 76-100: Public Launch and first external Community Contributions.
🤝 Contributing
We are looking for:
    1. Educators to write atomic lessons in YAML.
    2. Developers (JS/Node/Preact) to build the compiler and hardware bridges.
    3. Translators to prove our localization workflow.
See CONTRIBUTING.md to get started.

License: AGPL v3 (Open Source, Copyleft).

