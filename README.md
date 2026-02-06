# The Open Lesson Standard (OLS)
### The "MP3" for Offline, Sensor-Rich Education

![Status](https://img.shields.io/badge/Status-Phase_1:_Architecture-blue)
![License](https://img.shields.io/badge/License-AGPL_v3-green)
![Platform](https://img.shields.io/badge/Platform-Mobile_Web-orange)
![Hardware](https://img.shields.io/badge/Hardware-Android_6.0%2B-lightgrey)

## 📜 The Manifesto
We are not building a platform. We are not building a Learning Management System (LMS). We are not building a "Netflix for Education."

**We are building a standard.**

In the music industry, the MP3 format liberated audio. It allowed music to be stored on any device, shared offline, and played without needing the original recording studio. **The Open Lesson Standard (OLS) aims to do the same for interactive education.**

## The Problem
*   **The Hardware Exists:** Millions of repurposed smartphones ("e-waste") are available in resource-poor areas. They have screens, batteries, and powerful sensors (accelerometers, vibration motors), but they are too old to run modern apps.
*   **The Software is Broken:** Modern EdTech relies on video streaming (bandwidth heavy), always-on internet (impossible in refugee camps), and "walled gardens" (impossible to fork or localize).
*   **The Interaction is Passive:** Most digital learning is just "watch a video and click A, B, or C." It ignores the physical world.

## The Solution: "H5P for Hardware"
We are creating a file format and a rendering pipeline that turns high-quality, interactive lessons into tiny (<500KB) single-file HTML bundles that run offline on 10-year-old devices.

We treat the phone not as a miniature laptop, but as a **physical game controller**.

## 🛠️ Tech Stack & Architecture
*   **The Standard (.ols):** Lessons defined in human-readable YAML. (Git-native, forkable, atomic).
*   **The Compiler:** A Unified/Remark pipeline that compiles YAML + Logic + Assets into a single HTML file with zero dependencies.
*   **The Runtime:** A micro-app built with **Preact** that bridges HTML and hardware APIs (Vibration, DeviceMotion).

> 📖 **[Read the Full Architecture Documentation](/docs/architecture.md)**

## 🌍 Core Philosophy
1.  **Infrastructure, Not Platform:** We provide the protocol. Later, we build plugins for Kolibri/Moodle.
2.  **Inverted Evaluation:** The Lesson is tested, not the student. High failure rates flag the *content* as buggy.
3.  **Sovereign Governance (Web of Trust):** Communities verify content using cryptographic signatures (Ed25519).
4.  **Portable Sovereignty (Sneakernet):** Data travels with the human via QR codes (Base45/Gzip).
5.  **Zero-Trust Continuity:** No identities, just competency gates.

## 🤝 Contributing
We are looking for:
1.  **Educators** to write atomic lessons in YAML.
2.  **Developers** (JS/Node/Preact) to build the compiler and hardware bridges.
3.  **Translators** to prove our localization workflow.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
