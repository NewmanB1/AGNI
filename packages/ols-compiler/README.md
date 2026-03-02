# @ols/compiler

The OLS lesson compiler. Transforms lesson YAML into intermediate representation (IR) and then into deployable artifacts (HTML bundles, native packages, YAML packets).

## Pipeline

```
YAML source
    │
    ▼
  parse (js-yaml)
    │
    ▼
  validate (@ols/schema)
    │
    ▼
  buildLessonIR → IR + sidecar
    │
    ▼
  build artifact
    ├── HTML bundle (self-contained PWA page)
    ├── Native package (Android/Flutter asset)
    └── YAML packet (sneakernet transfer)
```

## What's here

| Module | Purpose |
|--------|---------|
| `compiler` | Service layer: `runCompilePipeline(rawYaml)` — the complete pipeline |
| `build-lesson-ir` | Pure transform: parsed YAML → IR (intermediate representation) + sidecar |
| `feature-inference` | Infers Bloom's level, VARK modalities, sensor requirements from lesson content |
| `builders/html` | Generates self-contained HTML with embedded runtime, styles, and lesson data |
| `builders/native` | Generates native app package (Android/Flutter) |
| `builders/yaml-packet` | Generates compact YAML transfer packets for sneakernet |

## Usage

```js
const { compiler } = require('@ols/compiler');

// Compile a lesson from YAML string
const result = await compiler.compile(yamlString, {
  format: 'html',
  outputPath: 'dist/lesson.html'
});
```

## Dependencies

- `@ols/schema` — lesson validation
- `@agni/utils` — logging, crypto, I/O

## Contributing

The compiler pipeline should remain **pure** (YAML in → artifact out). Side effects (file I/O, network) happen at the edges (CLI, hub-transform). If you're adding a new output format, create a new builder in `builders/`.
