# Contributing to AGNI

Thank you for considering contributing to AGNI. This project aims to make interactive, sensor-rich education accessible to anyone with a phone — even a 10-year-old one. Every contribution matters.

**New to the codebase?** See **`docs/ONBOARDING-CONCEPTS.md`** for a short glossary (OLS, theta, Rasch, Thompson bandit, skill graph, hub) and links to the right docs.

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

The codebase is JavaScript (Node.js). Canonical implementations live in `packages/`; `src/` re-exports for backward compatibility. See **`CODEBASE_INDEX.md`** for a full "what lives where" map.

| Area | Canonical location | Purpose |
|------|-------------------|---------|
| CLI | `packages/agni-cli/cli.js` | CLI entry point — parses args, calls builders |
| Compiler | `packages/ols-compiler/` | YAML → IR → HTML/native/YAML-packet |
| HTML builder | `packages/ols-compiler/builders/html.js` | Compiles YAML → single-file HTML bundle |
| Native builder | `packages/ols-compiler/builders/native.js` | IR → lesson.json + content/*.md |
| Runtime player | `packages/agni-runtime/` | In-browser player, sensors, SVG factories |
| Feature inference | `src/utils/featureInference.js` | Analyzes lessons and extracts metadata |

To get the dev environment running:

```bash
git clone https://github.com/NewmanB1/AGNI.git
cd AGNI
npm ci
npm run build        # compile gravity.yaml → dist/gravity.html
node test-inference.js  # run feature inference on all lessons
```

### Integrate OLS into Kolibri

If you work with [Kolibri](https://learningequality.org/kolibri/) (Learning Equality), see **`docs/integrations/KOLIBRI-INTEGRATION-GUIDE.md`** for how to add OLS lessons to a Kolibri channel using Ricecooker. For a minimal iframe demo, see **`demo/iframe-demo.html`**.

### Translate a Lesson

**Full tutorial:** See **`docs/tutorials/fork-and-translate-lesson.md`** for a step-by-step guide (fork, translate metadata and content, validate, build).

Short version: Copy an existing lesson and change the `language` field in the meta block. Translate the `content` fields (the human-readable text). Keep everything else the same — the structure, sensors, thresholds, and feedback don't change across languages.

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

3. **Test your changes.** Before opening a PR, ensure the full verification suite passes:
   ```bash
   npm run build          # make sure it compiles
   npm run validate       # make sure lessons are valid
   npm run verify:all     # required: lint, structure, api-contract, guards (see docs/VERIFICATION-GUARDS.md)
   ```
   **No PR should merge with `verify:all` failing.** CI runs this; running it locally (or a pre-push hook) avoids last-minute fixes.

**Optional pre-push hook:** To run `verify:all` automatically before each push, install the script as a Git hook:
```bash
cp scripts/pre-push-verify.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```
On Windows (Git Bash): copy the script to `.git/hooks/pre-push` and ensure it is executable. You can also run `./scripts/pre-push-verify.sh` manually before pushing.

4. **Commit with a clear message:**
   ```bash
   git commit -m "add: new lesson on buoyancy"
   git commit -m "fix: haptic feedback not firing on Android 7"
   git commit -m "docs: clarify threshold grammar syntax"
   ```

5. **Push and open a Pull Request** against `main`.

---

## Release checklist

When cutting a release (e.g. for a tagged version):

1. **CHANGELOG** — Update `docs/CHANGELOG.md` (or project CHANGELOG) with the new version and notable changes.
2. **Version** — Bump version in `package.json` (and any `packages/*/package.json` if published).
3. **Schema changes** — If any `schemas/*.schema.json` changed since last release, ensure `npm run codegen:types` has been run and `verify:codegen-sync` passes; commit generated types.
4. **Tag** — Create a git tag (e.g. `v0.2.0`) and push. CI may use the tag for artifacts or version stamps.
5. **Verify** — Run `npm run verify:all` and fix any failures before tagging.

See `docs/playbooks/schema-to-types.md` for the schema-first workflow when changing IR or sidecar schemas.

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
├── packages/         # Canonical implementations (@agni/*, @ols/*)
│   ├── agni-utils/   # Utilities
│   ├── agni-runtime/ # Browser player, sensors, SVG
│   ├── agni-engine/  # LMS (Rasch, Thompson, embeddings)
│   ├── ols-compiler/ # YAML → IR → HTML/native
│   └── ...
├── src/              # Re-exports from packages (backward compatibility)
├── lessons/          # OLS lesson files
├── schemas/          # JSON Schema for lessons
├── server/           # On-demand PWA / lesson serving
├── hub-tools/        # Pathfinder, LMS, hub entry scripts
├── docs/             # Project documentation
└── .github/          # CI, issue templates
```

---

## Technical debt and conventions

- **Maintainability:** Ten practices (align tests with API, automate contract checks, single source of truth, release/schema checklists, playbooks, CI guardrails, etc.) are listed in **`docs/CONVENTIONS.md`** § Top 10 maintainability practices.
- **Architecture:** The canonical architecture doc is **`docs/ARCHITECTURE.md`**. The root `ARCHITECTURE.md` redirects there.
- **Types:** Central place is **`packages/types/index.d.ts`** (LessonIR, LessonSidecar, LMSState, etc.). Keep it aligned with `schemas/*.schema.json` and with compiler/engine usage. See **`docs/playbooks/typing-and-languages.md`** for TS vs JS and where types are enforced.
- **Binary / base64:** **`src/utils/binary.js`** and **`src/runtime/binary-utils.js`** — use these for base64/bytes and UTF-8 helpers instead of ad-hoc logic in crypto or runtime.
- **Validation:** Lesson builds require **schema validation** (Ajv). If validation fails with "Schema validation unavailable", run `npm install` so `ajv` and `ajv-formats` are present.
- **Math module testing:** If you add or modify unit tests that mock `Math.random` or depend on deterministic `randn()` output, call **`math._randnClearCache()`** before mocking. See **`docs/playbooks/math.md`** for details (randn uses a module-level cache that causes test pollution).

---

## Code of Conduct

Be kind. Be constructive. Remember that this project exists to help people who have the least access to educational technology. We welcome contributors of all experience levels, backgrounds, and disciplines.

---

## Questions?

Open an issue or start a discussion. There are no dumb questions — especially about YAML syntax, sensor thresholds, or how the compiler works. We'd rather answer questions than lose a contributor.
