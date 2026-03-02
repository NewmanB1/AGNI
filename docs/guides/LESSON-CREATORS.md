# Guide: Lesson Creators

How to write, validate, and publish interactive lessons for AGNI.

---

## What is a lesson?

An AGNI lesson is a YAML file that describes a sequence of interactive steps — text instructions, quizzes, sensor challenges (shake the phone, tilt it, detect freefall), and more. The compiler turns this YAML into a single HTML file that runs offline on any phone with a browser.

You don't need to know how to code. If you can write a recipe, you can write a lesson.

---

## Editor setup (recommended)

If you use **VS Code** (or Cursor), the project includes editor configuration that gives you autocomplete, inline validation, and formatting for lesson YAML files — install the recommended extensions when prompted, or run:

```
Ctrl+Shift+P → "Extensions: Show Recommended Extensions" → install all
```

The key extension is **Red Hat YAML** (`redhat.vscode-yaml`), which connects your lesson files to the OLS schema. You'll get:

- **Autocomplete** for field names, step types, and enums
- **Red squiggles** on missing required fields, typos, and wrong types
- **Hover docs** showing field descriptions from the schema

This works automatically for any `.yaml` file inside `lessons/`.

---

## Quick start

1. Start from the hello-world template (no sensors, simplest possible lesson):
   ```bash
   cp lessons/hello-world.yaml lessons/my-lesson.yaml
   ```
   Or from the comprehensive reference showing every step type:
   ```bash
   cp lessons/examples/all-step-types.yaml lessons/my-lesson.yaml
   ```

2. Open it in VS Code — you'll get autocomplete and inline validation immediately.

3. Validate your lesson:
   ```bash
   node src/cli.js lessons/my-lesson.yaml --validate
   ```

4. Compile it to HTML:
   ```bash
   node src/cli.js lessons/my-lesson.yaml --format=html --output=dist/my-lesson.html
   ```

5. Open `dist/my-lesson.html` in a browser to test it.

---

## Lesson structure

Every lesson has two sections: **metadata** and **steps**.

### Metadata

```yaml
version: "1.8.0"
meta:
  identifier: "ols:science:gravity_v1"
  title: "Understanding Gravity"
  description: "Use your phone as a physics lab."
  language: "en"
  license: "CC-BY-SA-4.0"
  created: "2026-01-15T00:00:00Z"
  utu:
    class: "SCI-1"        # Spine: science
    band: 3               # Complexity band (1-6)
    protocol: 2           # Teaching method (1-5)
```

- **identifier**: unique ID in the format `ols:<subject>:<slug>`. Must be globally unique.
- **language**: ISO 639-1 code (`en`, `sw`, `fr`, `es`, etc.).
- **license**: must be an open license (e.g. `CC-BY-SA-4.0`, `AGPL-3.0`).
- **utu**: optional UTU coordinates. If your school's governance policy requires UTU labels, this must be present.

### Steps

Steps are the building blocks of a lesson. Each step has a `type`:

| Type | What it does |
|------|-------------|
| `instruction` | Shows text (Markdown supported). Read-and-continue. |
| `quiz` | Multiple-choice question with correct/incorrect answers. |
| `fill_blank` | Fill-in-the-blank question. |
| `matching` | Match items from two columns. |
| `ordering` | Put items in the correct order. |
| `hardware_trigger` | Wait for a sensor event (shake, tilt, freefall, etc.). |
| `completion` | End-of-lesson summary. |

#### Example: instruction step

```yaml
- id: what_is_gravity
  type: instruction
  content: |
    ## What is Gravity?

    Gravity pulls everything toward Earth's center.
    Drop your phone from 10cm above a table and watch what happens.
```

#### Example: quiz step

```yaml
- id: gravity_quiz
  type: quiz
  content: "What pulls objects toward Earth?"
  answer_options:
    - "Gravity"
    - "Magnetism"
    - "Wind"
  correct_index: 0
  max_attempts: 2
```

#### Example: sensor step

```yaml
- id: shake_test
  type: hardware_trigger
  sensor: accel.total
  threshold: "accel.total > 2.5g"
  feedback: "vibration:short"
  content: "Shake the phone to continue."
  on_fail: "skip_to:fallback_step"
```

The threshold syntax is documented in **[specs/threshold_grammar.md](../specs/threshold_grammar.md)**.

---

## Ontology (skills)

Lessons can declare what skills they **require** (prerequisites) and **provide** (what the student learns):

```yaml
ontology:
  requires:
    - skill: ols:physics:newtons_laws
  provides:
    - skill: ols:physics:gravity_concept
      level: 1
    - skill: ols:physics:freefall
      level: 1
```

This powers the adaptive ordering engine — students won't see a lesson until they've mastered its prerequisites.

---

## Validation

Always validate before sharing:

```bash
# Validate a specific file (runs both schema and runtime checks)
node src/cli.js lessons/my-lesson.yaml --validate

# Validate all lessons at once
npm run validate
```

The `--validate` flag runs two layers of checks:

1. **Schema validation** — required fields, correct types, valid enums, no extra fields
2. **Runtime compatibility** — step types the runtime supports, valid sensor names, SVG factory names, threshold grammar, directive targets (`skip_to:` / `redirect:` point to real step IDs), Bloom's levels, VARK tags

Errors block compilation. Warnings are advisory (e.g. "missing description — recommended for discoverability").

---

## AI-assisted lesson creation

Two options:

**Option A: Automated generation** — give a skill description, get a complete lesson:

```bash
# Requires AGNI_LLM_API_KEY env var (OpenAI or Anthropic)
node scripts/generate-lesson.js "Understand buoyancy through a hands-on water experiment" --out lessons/buoyancy.yaml
```

The generator drives the LLM through a 10-phase pedagogical design process, validates the output, and auto-fixes errors if needed.

**Option B: Manual with AI prompts** — use **[prompts/lesson-design-stack.md](../prompts/lesson-design-stack.md)** as a step-by-step workflow with ChatGPT, Claude, or any LLM. Copy each prompt phase into the chat, paste the output back, and iterate.

---

## Translating a lesson

See the full tutorial: **[tutorials/fork-and-translate-lesson.md](../tutorials/fork-and-translate-lesson.md)**.

Short version:
1. Copy the original lesson.
2. Change `meta.language` to the target language code.
3. Update the `identifier` to include the language (e.g. `gravity_v1_sw`).
4. Translate all `content` fields. Keep structure, sensors, thresholds unchanged.
5. Validate and compile.

---

## Publishing

To make your lesson available on a Village Hub:

1. Place the `.yaml` file in the hub's `data/yaml/` directory (or send it to the administrator).
2. The hub compiles lessons on demand — no build step needed.
3. If the hub has a governance policy, your lesson must be compliant (correct UTU labels, allowed teaching mode, etc.) and added to the approved catalog.

---

## Tips

- **Start simple**: an instruction step + a quiz step is a complete lesson. Add sensor steps later.
- **Test on a real phone**: the browser on a laptop doesn't have accelerometer/gyroscope APIs. Test sensor steps on an actual mobile device.
- **Use high-contrast, simple language**: many students will be reading on cracked screens in bright sunlight.
- **Declare skills**: even if ontology is optional, declaring `provides` helps the adaptive engine recommend your lesson to the right students at the right time.

---

## Example lessons

| File | Purpose |
|------|---------|
| `lessons/hello-world.yaml` | Simplest possible lesson — text + quiz, no sensors. Start here. |
| `lessons/examples/all-step-types.yaml` | Every step type (quiz, fill_blank, matching, ordering, sensor, etc.) |
| `lessons/gravity.yaml` | Full sensor lesson — the flagship example with accelerometer |
| `lessons/ShakeRhythm.yaml` | Rhythm-based sensor lesson |
| `lessons/gravity-es.yaml` | Spanish translation — see how fork/translate works |
| `lessons/Gravity.sw.ke.yaml` | Swahili/Kenya localization |

---

## What to read next

- [Threshold Grammar spec](../specs/threshold_grammar.md) — full sensor threshold syntax
- [UTU Architecture spec](../specs/utu-architecture.md) — skill coordinate system
- [OLS JSON Schema](../../schemas/ols.schema.json) — the definitive field reference (your editor reads this)
- [AI lesson design prompts](../prompts/lesson-design-stack.md) — structured AI-assisted authoring
- [Translation tutorial](../tutorials/fork-and-translate-lesson.md) — fork and translate step-by-step
