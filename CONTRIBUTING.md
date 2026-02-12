# Contributing to AGNI

Thank you for considering contributing to AGNI. This project aims to make interactive, sensor-rich education accessible to anyone with a phone — even a 10-year-old one. Every contribution matters.

---

## Ways to Contribute

### Write a Lesson (no coding required)

Lessons are written in YAML. If you can write a recipe, you can write a lesson. Start by copying an existing one:

```bash
cp lessons/gravity.yaml lessons/my-lesson.yaml
```

Open it in any text editor. A minimal lesson looks like this:

```yaml
version: "1.6.0"
meta:
  identifier: "ols:science:my_lesson_v1"
  title: "My First Lesson"
  description: "A short description of what this teaches."
  language: "en"
  license: "AGPL-3.0"
  created: "2025-02-12T00:00:00Z"

steps:
  - type: instruction
    content: |
      ## Welcome
      This is a text step. Markdown works here.

  - type: hardware_trigger
    sensor: accelerometer
    threshold: "accel.total > 2.5g"
    feedback: "vibration:short"
    content: |
      ## Shake It
      Shake the phone to continue.
```

Validate your lesson before submitting:

```bash
npm run validate
```

Check out `lessons/gravity.yaml` and `lessons/ShakeRhythm.yaml` for more complete examples with quizzes, branching, and haptic feedback.

### Improve the Compiler or Runtime

The codebase is JavaScript (Node.js). Key entry points:

| File | Purpose |
|------|---------|
| `src/cli.js` | CLI entry point — parses args, calls builders |
| `src/builders/html.js` | Compiles YAML → single-file HTML bundle |
| `src/builders/native.js` | Compiles YAML → Markdown + JSON (native format) |
| `src/runtime/player.js` | In-browser lesson player with sensor bridges |
| `src/utils/featureInference.js` | Analyzes lessons and extracts feature metadata |

To get the dev environment running:

```bash
git clone https://github.com/NewmanB1/AGNI.git
cd AGNI
npm ci
npm run build        # compile gravity.yaml → dist/gravity.html
node test-inference.js  # run feature inference on all lessons
```

### Translate a Lesson

Copy an existing lesson and change the `language` field in the meta block. Translate the `content` fields (the human-readable text). Keep everything else the same — the structure, sensors, thresholds, and feedback don't change across languages.

```yaml
meta:
  language: "sw"  # Swahili, for example
```

### Test on Old Devices

If you have access to older Android phones (Android 6+), try loading compiled HTML lessons and report what works and what doesn't. File issues with the device model, Android version, and browser used.

### File Bugs or Suggest Features

Open an issue at [github.com/NewmanB1/AGNI/issues](https://github.com/NewmanB1/AGNI/issues). Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Device/OS/browser info (if relevant)

---

## Development Workflow

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b my-feature
   ```

2. **Make your changes.** Follow the existing code style — the project uses ESLint and Prettier:
   ```bash
   npm run lint        # check for issues
   npm run lint:fix    # auto-fix what's possible
   npm run format      # format with Prettier
   ```

3. **Test your changes:**
   ```bash
   npm run build          # make sure it compiles
   npm run validate       # make sure lessons are valid
   node test-inference.js # make sure inference runs clean
   ```

4. **Commit with a clear message:**
   ```bash
   git commit -m "add: new lesson on buoyancy"
   git commit -m "fix: haptic feedback not firing on Android 7"
   git commit -m "docs: clarify threshold grammar syntax"
   ```

5. **Push and open a Pull Request** against `main`.

---

## Commit Message Conventions

Use a short prefix to categorize your change:

| Prefix | Use for |
|--------|---------|
| `add:` | New lessons, features, or files |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `refactor:` | Code restructuring (no behavior change) |
| `ci:` | CI/workflow changes |
| `chore:` | Dependency updates, cleanup |

---

## Project Structure

```
AGNI/
├── lessons/          # OLS lesson files — this is where content lives
├── schemas/          # JSON Schema for validating lessons
├── src/
│   ├── cli.js        # Compiler CLI
│   ├── builders/     # Output generators (html, native)
│   ├── runtime/      # Browser-based lesson player
│   └── utils/        # Shared utilities
├── fixtures/         # Test data
├── docs/             # Project documentation
└── .github/workflows # CI pipelines
```

---

## Code of Conduct

Be kind. Be constructive. Remember that this project exists to help people who have the least access to educational technology. We welcome contributors of all experience levels, backgrounds, and disciplines.

---

## Questions?

Open an issue or start a discussion. There are no dumb questions — especially about YAML syntax, sensor thresholds, or how the compiler works. We'd rather answer questions than lose a contributor.
