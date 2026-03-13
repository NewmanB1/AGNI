# AGNI 🔥

### The Open Lesson Standard — an "MP3" for offline, sensor-rich education

**Quick links:** [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

[![Status](https://img.shields.io/badge/Status-Phase_1:_Core_Engine-blue)](docs/ROADMAP.md)
[![License](https://img.shields.io/badge/License-AGPL_v3-green)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Mobile_Web-orange)](#)
[![Hardware](https://img.shields.io/badge/Hardware-Android_6.0%2B-lightgrey)](#)

AGNI compiles human-readable YAML lessons into tiny (<500KB) single-file HTML bundles that run **offline** on 10-year-old phones. It treats the phone not as a miniature laptop, but as a **physical game controller** — using accelerometers, vibration motors, and other sensors to create interactive learning experiences with zero internet required.

---

## Why This Exists

**The hardware exists.** Millions of repurposed smartphones sit in resource-poor areas with screens, batteries, and powerful sensors — but they're too old to run modern apps.

**The software is broken.** EdTech relies on video streaming (bandwidth-heavy), always-on internet (impossible in refugee camps), and walled gardens (impossible to fork or localize).

**The interaction is passive.** Most digital learning is "watch a video and click A, B, or C." It ignores the physical world.

AGNI fixes all three. We're building a **file format and compiler**, not a platform.

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/NewmanB1/AGNI.git
cd AGNI
npm ci

# Compile a lesson to HTML
npm run build

# Run feature inference on all lessons
node test-inference.js

# Validate lessons against the OLS schema (and threshold syntax for hardware_trigger steps)
npm run validate
```

The compiled output lands in `dist/`. Open `dist/gravity.html` in any browser — no server needed. For an **iframe demo** (embed OLS in a parent page), see [demo/iframe-demo.html](demo/iframe-demo.html) — run `npm run build`, then serve the repo root (e.g. `npx serve .`).

### Running the portal against the hub

The teacher portal (`portal/`) is plain HTML/CSS/JS — no build step. Start the hub (theta) and serve the portal:

```bash
# Terminal 1: start the hub
node hub-tools/theta.js

# Terminal 2: serve the portal (from repo root)
npx serve portal
```

Then open http://localhost:3000 (or the port shown). Set the Hub URL in Settings, or add `?hub=http://localhost:8082` to the URL. See `portal/js/api.js` and `docs/api-contract.md` for the API contract.

---

## How It Works

**1. Write a lesson in YAML:**

```yaml
steps:
  - type: instruction
    content: "Shake the phone gently to make a beat."
  - type: hardware_trigger
    sensor: accelerometer
    threshold: "accel.total > 2.5g"
    feedback: "vibration:short"
    content: "Give one strong shake."
```

**2. Compile it:**

```bash
node packages/agni-cli/cli.js lessons/ShakeRhythm.yaml --format=html --output=dist/shake.html
```

**3. Run it on any device.** The output is a single HTML file with zero dependencies. Copy it via USB, Bluetooth, SD card, or QR code.

---

## Project Structure

```
AGNI/
├── lessons/          # OLS lesson files (.yaml) — start here to write content
├── schemas/          # JSON Schema definitions for validation
├── src/
│   ├── cli.js        # Compiler entry point
│   ├── builders/     # Output format generators (html, native)
│   ├── runtime/      # In-browser player + sensor bridges
│   └── utils/        # Feature inference, crypto, I/O helpers
├── fixtures/         # Test data for graph weights
├── docs/             # Architecture, schema spec, governance, roadmap
└── .github/workflows # CI: build, validate, Docker publish
```

---

## Core Principles

**Infrastructure, not platform.** We provide the protocol. Plugins for Kolibri/Moodle come later.

**Inverted evaluation.** The lesson is tested, not the student. High failure rates flag the *content* as buggy.

**Epistemic pluralism.** We don't force a single "correct" learning order. The system observes how a community learns (e.g., "weaving makes math easier here") and dynamically reorders lesson paths to minimize friction for that group. We adapt to the learner's mental model, not the other way around.

**Sovereign governance.** Communities verify content using cryptographic signatures (Ed25519) via a web of trust.

**Sneakernet-ready.** Data travels with the human via QR codes (Base45/Gzip). No cloud accounts, no identities — just competency gates.

**Compatibility.** The runtime targets **Android 7.0+ (Nougat, API 24)** and **ES5** in the player and core runtime scripts. See `docs/ARCHITECTURE.md` §4.1 for the full baseline and checklist.

---

## Pilot Lessons

| Lesson | Sensors | Features |
|--------|---------|----------|
| [gravity.yaml](lessons/gravity.yaml) | Accelerometer | Haptic feedback, branching, quiz |
| [ShakeRhythm.yaml](lessons/ShakeRhythm.yaml) | Accelerometer | Haptic feedback, metaphor (music) |
| [graph_test.yaml](lessons/graph_test.yaml) | Accelerometer | Haptic feedback, graph visualization |

---

## Documentation

| Doc | What it covers |
|-----|---------------|
| [Architecture](docs/ARCHITECTURE.md) | Canonical architecture: compiler pipeline, runtime, governance |
| [Onboarding concepts](docs/ONBOARDING-CONCEPTS.md) | Key concepts: OLS, theta, Rasch, bandit, skill graph |
| [OLS Schema](schemas/ols.schema.json) | Full OLS YAML schema definition |
| [Roadmap](docs/ROADMAP.md) | What's planned and what's shipping |
| [Governance playbook](docs/playbooks/governance.md) | Web of trust, signing, community structure |
| [Threshold Grammar](docs/specs/threshold_grammar.md) | How sensor thresholds are defined |
| [API contract](docs/api-contract.md) | Hub HTTP API endpoints and payloads |
| [Fork and translate tutorial](docs/tutorials/fork-and-translate-lesson.md) | Step-by-step: fork and translate a lesson |
| [Deployment guide](docs/DEPLOYMENT.md) | Setting up a Village Hub on Raspberry Pi |
| [Kolibri integration](docs/integrations/KOLIBRI-INTEGRATION-GUIDE.md) | Integrating OLS lessons into Kolibri via Ricecooker |
| [Conventions](docs/CONVENTIONS.md) | Coding conventions and ES5 rules |

---

## Contributing

We need help from **educators**, **developers**, and **translators**. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to get started, what's up for grabs, and how to write your first lesson.

**Quick ways to help right now:**

- Write a new lesson in YAML (see `lessons/gravity.yaml` as a template)
- **Translate a lesson** — [tutorial](docs/tutorials/fork-and-translate-lesson.md)
- Improve the compiler output for low-end devices
- Test on old Android phones and file issues

---

## License

[AGPL-3.0](LICENSE) — Fork it, improve it, share it back.
