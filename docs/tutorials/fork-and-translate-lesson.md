# How to Fork and Translate a Lesson

This tutorial walks you through **forking** an existing OLS lesson and **translating** it into another language. No coding required — just YAML and a text editor. The result is a new lesson that works with the same compiler, runtime, and hub.

**Time:** about 15–20 minutes.  
**You need:** this repo, a text editor, and basic familiarity with YAML (key-value pairs and lists).

---

## 1. Pick a source lesson

We’ll use the **Golden Master** lesson as the source:

- **File:** `lessons/gravity.yaml`
- **Title:** “Feeling Gravity” — a short physics lesson using the accelerometer (calibration, freefall).

You can use any existing lesson under `lessons/` (e.g. `ShakeRhythm.yaml`, `graph_test.yaml`).

---

## 2. Copy the file

Create a new file with a clear name. For a Spanish translation of the gravity lesson:

```bash
cp lessons/gravity.yaml lessons/gravity-es.yaml
```

Use a suffix that indicates language or locale (e.g. `-es`, `-sw`, `-fr`) so you can keep multiple translations alongside the original.

---

## 3. Update metadata

Open `lessons/gravity-es.yaml` and change only the fields that identify the lesson and its language:

| Field | What to do |
|-------|------------|
| **meta.identifier** | Make it unique. Example: `ols:physics:gravity_intro_v1_es` (add a language/variant suffix). |
| **meta.title** | Translate to the target language. Example: `Sentir la gravedad`. |
| **meta.description** | Translate the short description. |
| **meta.language** | Set to the BCP‑47 language code (e.g. `es`, `sw`, `fr`). |
| **meta.locale** | Optional; set to the region if relevant (e.g. `ES`, `KE`). |
| **meta.updated** | Set to today’s date in ISO format, e.g. `"2026-02-24T00:00:00Z"`. |

Leave **version**, **license**, **subject**, **tags**, **audience**, **time_required**, **difficulty**, **ontology**, and **gate** structure unchanged unless you intentionally want to change pedagogy or skills.

---

## 4. Translate the gate (quiz)

The **gate** is the optional quiz that gates entry to the lesson. Translate only the user-facing strings:

- **gate.question** — the question text (e.g. “What force pulls objects toward the center of the Earth?” → “¿Qué fuerza atrae los objetos hacia el centro de la Tierra?”).
- **gate.expected_answer** — the accepted answer (e.g. `gravity` → `gravedad`). The learner must type this (or a matching value) to pass.

Leave **gate.type**, **gate.skill_target**, **gate.on_fail**, **gate.passing_score**, **gate.retry_delay** as-is.

---

## 5. Translate step content

Go through each **step** in **steps**. For each step:

- **Translate** the **content** field. This is the Markdown that the learner sees (headings, paragraphs, lists). Translate every user-visible string.
- **Do not change:** step **id**, **type**, **threshold** (sensor conditions), **feedback**, **expected_duration**, **weight**, or any other structural fields. Thresholds like `freefall > 0.35s` or `accel.z > 7.5` are technical and not shown to the learner; leave them as-is.

Example (first instruction step):

**Before (en):**
```yaml
  - id: intro
    type: instruction
    content: |
      ## The Invisible Force
      Gravity is pulling **everything** downward all the time — even right now!
      Your phone can actually **feel** this force using its built-in sensor.
```

**After (es):**
```yaml
  - id: intro
    type: instruction
    content: |
      ## La fuerza invisible
      La gravedad está tirando de **todo** hacia abajo todo el tiempo — ¡incluso ahora!
      Tu teléfono puede **sentir** esta fuerza con su sensor.
```

---

## 6. Validate the lesson

From the repo root, run:

```bash
npm run validate
```

This checks:

- OLS schema (required fields, types, step types).
- Threshold syntax for any **hardware_trigger** steps (e.g. `freefall > 0.35s`).

If validation fails, fix the reported errors (often a typo in a key or an invalid value). The message will point you to the file and, for schema errors, the path in the YAML.

---

## 7. Build and open in a browser (optional)

Compile the translated lesson to HTML:

```bash
node src/cli.js lessons/gravity-es.yaml --format=html --output=dist/gravity-es.html
```

Open `dist/gravity-es.html` in a browser. Confirm that:

- All visible text is in the target language.
- The gate question and expected answer work (e.g. typing “gravedad” passes the gate).
- Sensor steps (calibration, freefall) still work; threshold behaviour is unchanged.

---

## 8. Reference example

The repo includes a full Spanish translation of the Golden Master:

- **Source:** `lessons/gravity.yaml`
- **Translation:** `lessons/gravity-es.yaml`

See also **`docs/translation-stress-test.md`** for the validation and build notes from that run.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Choose a source lesson (e.g. `gravity.yaml`). |
| 2 | Copy to a new file (e.g. `gravity-es.yaml`). |
| 3 | Update **meta**: identifier, title, description, language, locale, updated. |
| 4 | Translate **gate**: question, expected_answer. |
| 5 | Translate every step **content**; leave ids, types, thresholds, and structure unchanged. |
| 6 | Run **npm run validate**. |
| 7 | Optionally build and open in browser to confirm. |

That’s it. You’ve forked and translated a lesson. Share it via a PR or use it on your own hub.
