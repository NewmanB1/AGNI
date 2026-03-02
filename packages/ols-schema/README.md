# @ols/schema

**The Open Lesson Standard itself.** This package contains the JSON schema, validators, and threshold grammar that define what a valid OLS lesson is.

Everything here is spec — not application logic. If you're building an alternative OLS runtime, this is the package you'd consume.

## What's here

| File | Purpose |
|------|---------|
| `schema.json` | The JSON Schema defining the OLS lesson format (`meta`, `steps`, `gate`, `ontology`, `svg_spec`, etc.) |
| `lesson-schema` | Ajv-based validator: `validateLessonData(data)` returns errors/warnings |
| `lesson-validator` | Runtime compatibility checker: ensures a lesson uses only supported factories, sensors, and step types |
| `threshold-syntax` | Parser and validator for the OLS threshold expression grammar (`accel.total > 2.5g AND steady > 1.5s`) |

## Usage

```js
const { lessonSchema, thresholdSyntax } = require('@ols/schema');

// Validate a lesson
const { errors, warnings } = lessonSchema.validateLessonData(parsedYaml);

// Validate a threshold expression
const result = thresholdSyntax.validate('freefall > 0.35s');
// { valid: true, description: 'Free-fall detected for 0.35 seconds' }
```

## The Threshold Grammar

```ebnf
Expression := Condition (AND Condition)*
Condition  := SensorId Operator Value [Unit]
            | "steady" Operator Duration "s"
            | "freefall" Operator Duration "s"
Operator   := ">" | "<" | ">=" | "<=" | "==" | "!="
```

See `docs/specs/threshold_grammar.md` for the full specification.

## Contributing

Changes to this package change the OLS standard. New step types, new sensor IDs, new svg_spec fields — all require updating the schema, validators, and documentation together. Keep the schema as the single source of truth.
