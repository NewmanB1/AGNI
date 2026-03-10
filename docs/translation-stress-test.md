# Translation stress test (Sprint B)

This document records the **translation stress test** for the Golden Master lesson: fork, translate to another language, run validator and (optionally) player.

## What was done

- **Source:** `lessons/gravity.yaml` (Golden Master — Feeling Gravity).
- **Translation:** `lessons/gravity-es.yaml` (Spanish: *Sentir la gravedad*).
- **Changes:** All user-facing text translated to Spanish (`meta.title`, `meta.description`, `gate.question`/`expected_answer`, all `steps[].content`). Structure, step `id`s, `ontology`, `threshold` strings, and `gate` shape unchanged.
- **Validation:** `npm run validate` (schema + threshold syntax) was run; **gravity-es.yaml passes**.

## Schema and i18n notes

- **Schema:** No schema changes were required. `meta.language` and `meta.locale` are already in the OLS schema; setting `language: es` and `locale: ES` is sufficient.
- **Threshold strings:** Left in English (e.g. `freefall > 0.35s`, `accel.z > 7.5`). They are technical and not shown to the learner; the runtime uses them as-is.
- **Gate:** `expected_answer` was translated to `gravedad` so the gate quiz accepts the Spanish answer. The validator does not check gate semantics beyond schema.

## How to run

```bash
npm run validate
```

To compile the Spanish lesson to HTML:

```bash
node packages/agni-cli/cli.js lessons/gravity-es.yaml --format=html --output=dist/gravity-es.html
# or: npm run build then copy and rename for gravity-es, or add a script
```

Open `dist/gravity-es.html` in a browser to confirm the player renders the translated content. Threshold behaviour (calibration, freefall step) is unchanged. Build completed successfully in Sprint B (output ~52 KB).

## Gaps / follow-ups

- **RTL:** Not tested; schema and runtime are language-agnostic but RTL layout may need CSS or player tweaks.
- **Pluralization / templates:** Not used; all content is static strings. Future i18n could add placeholder or template support in the schema if needed.
