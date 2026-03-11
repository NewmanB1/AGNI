# @agni/curriculum-gen

**Independent tool** — not part of core AGNI. The lesson creator in AGNI is a template-based wizard.

LLM-driven K-12 curriculum generator for OLS/AGNI. Generates hundreds of lessons
to systematically exercise every archetype, SVG factory, sensor, and step type —
surfacing gaps in the platform that need to be addressed.

## Why

AGNI has 24 archetypes, 18 SVG factories, 25 sensors, 7 step types, and a rich
schema with branching, gates, accessibility modes, and more. The only way to know
if all of it *actually works well together* is to create real lessons that exercise
every combination. That's too many to write by hand, so we use an LLM.

Every generated lesson also includes a `_gap_analysis` section where the LLM
explicitly identifies features AGNI *should* have but doesn't yet — new factory
types, new step types, new sensors, schema additions, and pedagogical limitations.
This turns curriculum generation into a platform discovery tool.

## Quick Start

```bash
# 1. Generate the lesson plan (no API key needed)
node src/planner.js

# 2. Preview sample prompts (no API key needed)
node src/preview.js --random 5

# 3. Copy config and add your API key
cp config.example.json config.json
# Edit config.json with your key

# 4. Generate lessons (calls the LLM)
node src/runner.js

# 5. Check coverage
node src/coverage.js

# 6. Generate gap report
node src/gap-report.js
```

## Pipeline

```
taxonomy.json          Static K-12 curriculum: 252 units across math, science, social studies
       │
  planner.js           Assigns archetypes to units, ensures 100% capability coverage
       │
output/lesson-plan.json   765 lesson specs with metadata
       │
  preview.js           Dry-run: write prompts to output/previews/ for inspection
       │
  runner.js            Calls LLM API in resumable batches
       │               ├── Writes YAML to output/lessons/{subject}/grade-{N}/
       │               ├── Writes .gaps.json sidecar files
       │               └── Tracks progress in output/progress.json
       │
  batch-validate.js    Re-validates all generated YAML against OLS schema
       │
  coverage.js          Tracks which factories/sensors/archetypes/step-types are covered
       │
  gap-report.js        Aggregates passive (hallucinated) + active (declared) gaps
       │
output/reports/
  ├── gaps.json        Machine-readable gap data
  ├── gaps.md          Human-readable gap report with recommendations
  ├── coverage.json    Feature coverage data
  └── validation.json  Batch validation results
```

## Configuration

Create `config.json` from the example:

```json
{
  "provider": "gemini",         // gemini recommended; other providers configurable
  "apiKey": "YOUR_API_KEY",
  "model": "gemini-2.0-flash",  // or gemini-2.5-flash for this provider
  "maxTokens": 4096,
  "temperature": 0.7,
  "rateLimit": {
    "requestsPerMinute": 5,     // match your API quota (RPM)
    "delayMs": 12000            // 60000 / RPM; 5 RPM = 12s, 15 RPM = 4s
  },
  "maxRetries": 3,
  "batchSize": 20,              // smaller for free tier; increase for paid
  "skipFailed": true,
  "startFrom": 0
}
```

### Rate limits (match to your API quota)

| Tier | RPM | TPM | delayMs | batchSize |
|------|-----|-----|---------|-----------|
| Gemini free | 5 | 250k | 12000 | 20 |
| Gemini free (higher) | 15 | 250k | 4000 | 50 |
| Paid | 60+ | 1M+ | 1000 | 100 |

Set `delayMs` to at least `60000 / requestsPerMinute` to avoid quota errors.

### Provider notes

| Provider | Best model | Cost | Notes |
|----------|-----------|------|-------|
| Gemini | `gemini-2.0-flash` | Lowest | Recommended (free tier, open) |

## Preview mode

Inspect prompts before spending API credits:

```bash
node src/preview.js                    # first 5 lessons
node src/preview.js --random 10        # 10 random lessons
node src/preview.js --search "physics" # search by keyword
node src/preview.js --subjects         # one per subject/grade combo
node src/preview.js --id math--8--linear-equations--systematic-consolidation
```

## Import to hub

Copy generated lessons into the hub's YAML catalog:

```bash
node import-to-hub.js output/lessons/math/grade-8/lesson-name.yaml
```

Uses `AGNI_YAML_DIR` or defaults to `data/yaml` (from repo root).

## Resumable generation

The runner tracks progress in `output/progress.json`. If interrupted or when the
API quota is reached, run `node src/runner.js` again — it skips completed lessons
and (by default) failed lessons, then continues with the next batch.

**Quota handling:** When the API returns a quota/rate-limit error, the runner
stops immediately, saves progress, and exits. The in-flight lesson is not marked
failed (so it will be retried next run). Run again the next day to continue.

## Gap Analysis

The gap report merges two detection methods:

**Passive** — the LLM hallucinated capabilities that don't exist:
- Unknown factory IDs (e.g., `histogram`, `timeline`, `scatterPlot`)
- Unknown sensors, step types
- SVG opts that aren't in the factory registry

**Active** — the LLM explicitly declared what's missing via `_gap_analysis`:
- `wished_factories` — with reasons and workarounds
- `wished_step_types` — drawing, drag-and-drop, simulation, free-text, etc.
- `wished_sensors` — GPS, humidity, camera, etc.
- `wished_svg_opts` — options on existing factories
- `wished_schema_fields` — metadata OLS should support
- `pedagogical_limitations` — things it couldn't express
- `accessibility_gaps` — a11y concerns it couldn't address

The report ranks everything by frequency across all 765 lessons, giving you a
prioritized roadmap of what to build next.

## Curriculum Taxonomy

The taxonomy covers K-12 across three subjects:

| Subject | Grades | Units | Lesson specs |
|---------|--------|-------|-------------|
| Mathematics | K-12 | 104 | 339 |
| Science | K-12 | 77 | 210 |
| Social Studies | K-12 | 71 | 216 |
| **Total** | | **252** | **765** |

Each unit has:
- Specific topics from international K-12 standards
- SVG factory hints (which visuals fit naturally)
- Sensor hints (which physical sensors are relevant)

## Directory Structure

```
tools/curriculum-gen/
├── config.example.json      Sample config (copy to config.json)
├── taxonomy.json            K-12 curriculum taxonomy
├── prompts/
│   └── system.md            System prompt with full OLS schema
├── src/
│   ├── planner.js           Lesson plan generator
│   ├── preview.js           Dry-run prompt previewer
│   ├── prompt-builder.js    Per-lesson prompt construction
│   ├── generator.js         LLM API client (Gemini recommended)
│   ├── runner.js            Batch orchestrator with resume
│   ├── lesson-validate.js   OLS validation + gap extraction
│   ├── batch-validate.js    Bulk re-validation
│   ├── coverage.js          Feature coverage tracker
│   └── gap-report.js        Gap analysis aggregator
└── output/
    ├── lesson-plan.json     Generated plan (765 lessons)
    ├── progress.json        Generation progress (auto-resume)
    ├── lessons/             Generated YAML files + .gaps.json sidecars
    ├── previews/            Dry-run prompt previews
    └── reports/             Coverage and gap reports
```
