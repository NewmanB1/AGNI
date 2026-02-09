# 🏗️ Open Lesson Standard (OLS): System Architecture v2.0

## 1. High-Level Overview
The Open Lesson Standard (OLS) is a decentralized, offline-first protocol for interactive education on resource-constrained hardware.

The system follows a **"Source-to-Artifact"** philosophy. We do not distribute heavy binaries; we distribute lightweight source code (`.yaml`). The artifacts (HTML or Native Bundles) are generated **Just-in-Time (JIT)** at the edge—the Village Hub.

### Core Design Constraints
*   **Hardware:** Android 6.0+, <2GB RAM, intermittent power.
*   **Network:** 100% Offline capability. Intermittent "Village Sentry" updates via Satellite/LoRa.
*   **Input:** Haptic/Sensor-first (Accelerometer, Vibration) + Touch.
*   **Trust:** **Hub-and-Spoke Distribution** for content (security), **Mesh** for signaling (interaction).
*   **Epistemic Pluralism:** The system adapts learning paths based on local "Generative Metaphors" (e.g., prioritizing Weaving logic before Math if that aids the specific cohort).

---

## 2. The Data Structure (The Source)
The core of the architecture is the Lesson File. It is a YAML document designed to be human-readable, git-forkable, and machine-executable.

### 2.1 Schema Definition
An OLS file is composed of strictly defined blocks:

1.  **meta:** Dublin Core metadata (subject, rights, coverage).
2.  **ontology:** The "Skill Contract." What this lesson requires (`requires`) and what it teaches (`provides`).
3.  **gate:** The logic block that enforces the "Zero-Trust" prerequisite check.
4.  **steps:** The content payload (Text + Hardware Instructions).

### 2.2 Asset Hydration Strategy
To minimize backhaul data usage, OLS files do not embed binary assets. They reference them.
*   **Source:** `image: "assets/physics/earth_diagram.png"`
*   **The Hub:** Maintains a shared `common_assets/` library.
*   **JIT Compilation:** The Hub "hydrates" the lesson by injecting the actual image data (Base64 for HTML, file copy for Native) only when the student requests the lesson.

---

## 3. The Compiler Architecture (`agni-core`)
The compiler is a modular Node.js application running on the Village Hub (Sentry). It transforms the YAML source into executable artifacts based on the requesting device's capabilities.

### 3.1 Modular Structure
```text
agni-core/
├── src/
│   ├── cli.js              # Orchestration & Argument Parsing
│   ├── config.js           # Markdown/Unified Processor Logic
│   ├── utils/
│   │   ├── crypto.js       # Ed25519 Signing & Device Binding Logic
│   │   └── io.js           # File System & Asset Hydration
│   ├── builders/
│   │   ├── html.js         # Strategy A: The "Universal" SPA
│   │   └── native.js       # Strategy B: The "Efficient" Native Bundle
│   └── runtime/            # The Player Engine
│       ├── player.js       # Core Logic (State Machine, Sensors)
│       └── style.css       # High-contrast UI
```

### 3.2 Output Strategies
The compiler supports dual-mode distribution:

| Feature | Strategy A: HTML SPA | Strategy B: Native Bundle |
| :--- | :--- | :--- |
| **Target** | Browsers (Chrome, WebView, KaiOS) | OLS Android Player (Kotlin/Flutter) |
| **Format** | Single `.html` file (<500KB) | `lesson.json` + `content/*.md` |
| **Battery** | Moderate (DOM rendering) | Excellent (Screen-off capability) |
| **Sensors** | Standard Web APIs (Throttled) | HAL Access (High Fidelity) |
| **Use Case** | Zero-install entry point | Long-term retention, pocket learning |

---

## 4. Network Topology: The "Smart Edge"

### 4.1 Bandwidth Optimization (The 99% Saving)
By transmitting Source YAML instead of pre-built HTML, we save expensive Satellite bandwidth.
*   **HTML Strategy:** 100 lessons = ~50MB.
*   **YAML Strategy:** 100 lessons = ~500KB.
*   **Result:** The Hub uses its local CPU to "inflate" the content for the village.

### 4.2 Content Negotiation
When a device connects to the Village Hub (Captive Portal):
1.  **Device:** Requests `GET /lessons/gravity`.
2.  **Hub:** Detects User-Agent.
    *   If Browser: Triggers `src/builders/html.js`.
    *   If Native App: Triggers `src/builders/native.js`.
3.  **Hub:** Serves the appropriate artifact.

---

## 5. Security & Governance: "Device Binding"
We enforce a **"Digital Chain of Custody"** to prevent the spread of corrupted, unverified, or unauthorized lessons via P2P file sharing.

### 5.1 The "Signed Lease" Model
We move from a "Public Flyer" model to a "Personalized Ticket" model.

1.  **Request:** Student device sends its UUID (e.g., `A-123`) to the Hub.
2.  **Binding:** The Hub compiles the lesson and calculates: `Hash(Content + UUID)`.
3.  **Signing:** The Hub signs the hash with its **Private Authority Key**.
4.  **Injection:** The Signature and the Intended UUID are hardcoded into the compiled artifact.

### 5.2 Runtime Verification
When the lesson runs (in Browser or App):
1.  **Check 1 (Identity):** Does the UUID embedded in the code match the UUID of the physical device?
    *   *Mismatch:* "Unauthorized Copy." (Stops P2P file cloning).
2.  **Check 2 (Integrity):** Does the Signature match the Content?
    *   *Mismatch:* "Corrupted File." (Stops malicious editing).

---

## 6. The Signaling Mesh (Allowed P2P)
While **Lesson Files (Data Plane)** are restricted to a Hub-and-Spoke model to ensure authority, **Interaction (Control Plane)** remains Peer-to-Peer.

*   **Scenario:** Multiplayer Quiz.
*   **Device A:** Broadcasts `SESSION:START` via Bluetooth LE or WebRTC.
*   **Device B:** Receives signal.
    *   *Security Check:* Device B verifies it has its *own* valid, signed copy of the lesson logic. It does **not** accept code from Device A.
    *   *Action:* If valid, it joins the session.
*   **Result:** Students can interact and learn together (Mesh), but they cannot bypass the Authority node to distribute content (Star).

---

## 7. The Adaptive Graph Engine (Navigation)
Instead of a static list, OLS uses a probabilistic graph to order lessons based on Marginal Learning Cost ($\theta$).

### 7.1 The Core Concept: Skill Collapse
We assume that for certain cohorts, mastering Skill A makes Skill B trivial (a "Skill Collapse").

### 7.2 The Artifact: `graph_weights.json`
The Village Sentry analyzes anonymized local learning logs to detect these collapses.
*   **Nodes:** Skill IDs (e.g., `ols.math:ratios`).
*   **Edges:** Observed probability that Skill A facilitates Skill B.

### 7.3 The Player Logic
When a student opens the lesson menu, the Player sorts available lessons:
$$ \theta = \text{BaseCost} - \text{CohortDiscount} $$
**Result:** A student with a background in weaving sees "Loops" at the top; a student with a background in farming might see "Modulo Arithmetic" at the top. The software adapts to the culture.
