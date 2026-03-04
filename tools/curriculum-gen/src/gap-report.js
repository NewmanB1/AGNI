'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const LESSONS_DIR = path.join(__dirname, '..', 'output', 'lessons');
const PROGRESS_PATH = path.join(__dirname, '..', 'output', 'progress.json');
const REPORT_PATH = path.join(__dirname, '..', 'output', 'reports', 'gaps.json');
const READABLE_PATH = path.join(__dirname, '..', 'output', 'reports', 'gaps.md');

function collectGapFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectGapFiles(full));
    } else if (entry.name.endsWith('.gaps.json')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Aggregate a list of items by id/key, counting occurrences and
 * collecting unique reasons.
 */
function aggregateById(items, idField) {
  const map = {};
  for (const item of items) {
    const key = item[idField];
    if (!key) continue;
    if (!map[key]) {
      map[key] = { count: 0, reasons: new Set(), workarounds: new Set(), lessons: [] };
    }
    map[key].count++;
    if (item.reason) map[key].reasons.add(item.reason);
    if (item.workaround) map[key].workarounds.add(item.workaround);
  }
  return map;
}

/**
 * Scans all generated YAML + .gaps.json sidecar files and extracts
 * both passive (hallucinated) and active (declared) platform gaps.
 */
function main() {
  if (!fs.existsSync(PROGRESS_PATH)) {
    console.error('No progress file. Run the generator first.');
    process.exit(1);
  }

  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  const failed = progress.failed || {};
  const completed = progress.completed || {};

  const gaps = {
    // ── Passive detection (hallucinated / schema violations) ──
    unknownFactories: {},
    unknownSensors: {},
    unknownStepTypes: {},
    missingFactoryOpts: [],
    validationPatterns: {},

    // ── Active detection (LLM-declared via _gap_analysis) ──
    wishedFactories: [],
    wishedSensors: [],
    wishedStepTypes: [],
    wishedSvgOpts: [],
    wishedSchemaFields: [],
    pedagogicalLimitations: [],
    accessibilityGaps: [],

    // ── Aggregated recommendations ──
    suggestedFactories: [],
    suggestedStepTypes: [],
    suggestedSensors: [],
    suggestedSvgOpts: [],
    suggestedSchemaFields: [],
    topLimitations: [],
    topAccessibilityGaps: []
  };

  // ── Phase 1: Analyze validation failures ──────────────────────────────────

  for (const [id, data] of Object.entries(failed)) {
    const errors = data.errors || [];
    for (const err of errors) {
      const key = err.replace(/["'][^"']+["']/g, '<X>').replace(/\d+/g, '<N>');
      gaps.validationPatterns[key] = (gaps.validationPatterns[key] || 0) + 1;

      const factoryMatch = err.match(/Unknown factory:?\s*["']?([a-zA-Z_]+)/i);
      if (factoryMatch) {
        gaps.unknownFactories[factoryMatch[1]] = (gaps.unknownFactories[factoryMatch[1]] || 0) + 1;
      }

      const sensorMatch = err.match(/Unknown sensor:?\s*["']?([a-z._]+)/i);
      if (sensorMatch) {
        gaps.unknownSensors[sensorMatch[1]] = (gaps.unknownSensors[sensorMatch[1]] || 0) + 1;
      }

      const stepMatch = err.match(/Unknown step type:?\s*["']?([a-z_]+)/i);
      if (stepMatch) {
        gaps.unknownStepTypes[stepMatch[1]] = (gaps.unknownStepTypes[stepMatch[1]] || 0) + 1;
      }
    }
  }

  // ── Phase 2: Scan completed lessons for hallucinated capabilities ────────

  const pluginFactoryIds = require('@agni/plugins').getFactoryIds();
  const pluginFactoryOpts = require('@agni/plugins').getFactoryOpts();

  for (const [id, data] of Object.entries(completed)) {
    if (!data.file) continue;
    const filepath = path.join(__dirname, '..', data.file);
    if (!fs.existsSync(filepath)) continue;

    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const lesson = YAML.parse(content);
      if (!lesson || !lesson.steps) continue;

      for (const step of lesson.steps) {
        if (step.svg_spec && step.svg_spec.factory) {
          if (!pluginFactoryIds.has(step.svg_spec.factory)) {
            gaps.unknownFactories[step.svg_spec.factory] =
              (gaps.unknownFactories[step.svg_spec.factory] || 0) + 1;
          }
        }

        if (step.svg_spec && step.svg_spec.opts && step.svg_spec.factory) {
          const knownOpts = pluginFactoryOpts[step.svg_spec.factory];
          if (knownOpts) {
            for (const key of Object.keys(step.svg_spec.opts)) {
              if (!knownOpts.includes(key)) {
                gaps.missingFactoryOpts.push({
                  factory: step.svg_spec.factory,
                  opt: key,
                  lesson: id
                });
              }
            }
          }
        }
      }
    } catch (e) { /* already tracked */ }
  }

  // Deduplicate missing opts
  const optSet = new Set();
  gaps.missingFactoryOpts = gaps.missingFactoryOpts.filter(function (c) {
    const key = c.factory + '.' + c.opt;
    if (optSet.has(key)) return false;
    optSet.add(key);
    return true;
  });

  // ── Phase 3: Aggregate LLM-declared gap analysis sidecar files ────────────

  const gapFiles = collectGapFiles(LESSONS_DIR);
  let gapFilesLoaded = 0;

  for (const gapFile of gapFiles) {
    try {
      const ga = JSON.parse(fs.readFileSync(gapFile, 'utf8'));
      gapFilesLoaded++;

      if (Array.isArray(ga.wished_factories)) {
        for (const w of ga.wished_factories) gaps.wishedFactories.push(w);
      }
      if (Array.isArray(ga.wished_sensors)) {
        for (const w of ga.wished_sensors) gaps.wishedSensors.push(w);
      }
      if (Array.isArray(ga.wished_step_types)) {
        for (const w of ga.wished_step_types) gaps.wishedStepTypes.push(w);
      }
      if (Array.isArray(ga.wished_svg_opts)) {
        for (const w of ga.wished_svg_opts) gaps.wishedSvgOpts.push(w);
      }
      if (Array.isArray(ga.wished_schema_fields)) {
        for (const w of ga.wished_schema_fields) gaps.wishedSchemaFields.push(w);
      }
      if (Array.isArray(ga.pedagogical_limitations)) {
        for (const w of ga.pedagogical_limitations) gaps.pedagogicalLimitations.push(w);
      }
      if (Array.isArray(ga.accessibility_gaps)) {
        for (const w of ga.accessibility_gaps) gaps.accessibilityGaps.push(w);
      }
    } catch (e) { /* malformed gap file */ }
  }

  // ── Phase 4: Aggregate and rank ──────────────────────────────────────────

  // Merge passive (hallucinated) + active (wished) factory suggestions
  const factoryAgg = aggregateById(gaps.wishedFactories, 'id');
  for (const [f, count] of Object.entries(gaps.unknownFactories)) {
    if (!factoryAgg[f]) factoryAgg[f] = { count: 0, reasons: new Set(), workarounds: new Set() };
    factoryAgg[f].count += count;
    factoryAgg[f].reasons.add('LLM hallucinated this factory in ' + count + ' lesson(s)');
  }
  gaps.suggestedFactories = Object.entries(factoryAgg)
    .map(function (e) {
      return { id: e[0], requestCount: e[1].count, reasons: Array.from(e[1].reasons), workarounds: Array.from(e[1].workarounds) };
    })
    .sort(function (a, b) { return b.requestCount - a.requestCount; });

  // Merge sensors
  const sensorAgg = aggregateById(gaps.wishedSensors, 'id');
  for (const [s, count] of Object.entries(gaps.unknownSensors)) {
    if (!sensorAgg[s]) sensorAgg[s] = { count: 0, reasons: new Set(), workarounds: new Set() };
    sensorAgg[s].count += count;
  }
  gaps.suggestedSensors = Object.entries(sensorAgg)
    .map(function (e) {
      return { id: e[0], requestCount: e[1].count, reasons: Array.from(e[1].reasons) };
    })
    .sort(function (a, b) { return b.requestCount - a.requestCount; });

  // Merge step types
  const stepAgg = aggregateById(gaps.wishedStepTypes, 'id');
  for (const [t, count] of Object.entries(gaps.unknownStepTypes)) {
    if (!stepAgg[t]) stepAgg[t] = { count: 0, reasons: new Set(), workarounds: new Set() };
    stepAgg[t].count += count;
  }
  gaps.suggestedStepTypes = Object.entries(stepAgg)
    .map(function (e) {
      return { id: e[0], requestCount: e[1].count, reasons: Array.from(e[1].reasons) };
    })
    .sort(function (a, b) { return b.requestCount - a.requestCount; });

  // SVG opts aggregation
  const svgOptAgg = {};
  for (const w of gaps.wishedSvgOpts) {
    const key = (w.factory || '?') + '.' + (w.opt || '?');
    if (!svgOptAgg[key]) svgOptAgg[key] = { factory: w.factory, opt: w.opt, count: 0, reasons: [] };
    svgOptAgg[key].count++;
    if (w.reason) svgOptAgg[key].reasons.push(w.reason);
  }
  for (const c of gaps.missingFactoryOpts) {
    const key = c.factory + '.' + c.opt;
    if (!svgOptAgg[key]) svgOptAgg[key] = { factory: c.factory, opt: c.opt, count: 0, reasons: [] };
    svgOptAgg[key].count++;
    svgOptAgg[key].reasons.push('Hallucinated in lesson ' + c.lesson);
  }
  gaps.suggestedSvgOpts = Object.values(svgOptAgg)
    .sort(function (a, b) { return b.count - a.count; });

  // Schema fields
  const schemaAgg = {};
  for (const w of gaps.wishedSchemaFields) {
    const key = (w.parent || '?') + '.' + (w.field || '?');
    if (!schemaAgg[key]) schemaAgg[key] = { field: w.field, parent: w.parent, count: 0, reasons: [] };
    schemaAgg[key].count++;
    if (w.reason) schemaAgg[key].reasons.push(w.reason);
  }
  gaps.suggestedSchemaFields = Object.values(schemaAgg)
    .sort(function (a, b) { return b.count - a.count; });

  // Deduplicate and rank free-text limitations
  const limMap = {};
  for (const l of gaps.pedagogicalLimitations) {
    const key = String(l).toLowerCase().trim();
    limMap[key] = (limMap[key] || 0) + 1;
  }
  gaps.topLimitations = Object.entries(limMap)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 30)
    .map(function (e) { return { text: e[0], count: e[1] }; });

  const a11yMap = {};
  for (const a of gaps.accessibilityGaps) {
    const key = String(a).toLowerCase().trim();
    a11yMap[key] = (a11yMap[key] || 0) + 1;
  }
  gaps.topAccessibilityGaps = Object.entries(a11yMap)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 20)
    .map(function (e) { return { text: e[0], count: e[1] }; });

  const sortedPatterns = Object.entries(gaps.validationPatterns)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 20);

  // ── Phase 5: Write reports ────────────────────────────────────────────────

  fs.writeFileSync(REPORT_PATH, JSON.stringify(gaps, null, 2));

  let md = '# AGNI Gap Analysis Report\n\n';
  md += '_Generated: ' + new Date().toISOString() + '_\n\n';
  md += '## Summary\n\n';
  md += '| Metric | Count |\n';
  md += '|--------|-------|\n';
  md += '| Completed lessons | ' + Object.keys(completed).length + ' |\n';
  md += '| Failed lessons | ' + Object.keys(failed).length + ' |\n';
  md += '| Gap analysis files loaded | ' + gapFilesLoaded + ' |\n';
  md += '| Suggested new factories | ' + gaps.suggestedFactories.length + ' |\n';
  md += '| Suggested new sensors | ' + gaps.suggestedSensors.length + ' |\n';
  md += '| Suggested new step types | ' + gaps.suggestedStepTypes.length + ' |\n';
  md += '| Suggested new SVG opts | ' + gaps.suggestedSvgOpts.length + ' |\n';
  md += '| Suggested schema fields | ' + gaps.suggestedSchemaFields.length + ' |\n';
  md += '| Pedagogical limitations | ' + gaps.topLimitations.length + ' |\n';
  md += '| Accessibility gaps | ' + gaps.topAccessibilityGaps.length + ' |\n\n';

  // ── Suggested Factories ──
  if (gaps.suggestedFactories.length > 0) {
    md += '## Suggested New SVG Factories\n\n';
    md += '_Ranked by how many lessons wanted them (passive hallucination + active request combined)._\n\n';
    for (const s of gaps.suggestedFactories) {
      md += '### `' + s.id + '` (' + s.requestCount + ' requests)\n\n';
      if (s.reasons.length > 0) {
        md += '**Why:**\n';
        for (const r of s.reasons.slice(0, 5)) md += '- ' + r + '\n';
      }
      if (s.workarounds.length > 0) {
        md += '\n**Workarounds used:**\n';
        for (const w of s.workarounds.slice(0, 3)) md += '- ' + w + '\n';
      }
      md += '\n';
    }
  }

  // ── Suggested Step Types ──
  if (gaps.suggestedStepTypes.length > 0) {
    md += '## Suggested New Step Types\n\n';
    for (const s of gaps.suggestedStepTypes) {
      md += '### `' + s.id + '` (' + s.requestCount + ' requests)\n\n';
      if (s.reasons.length > 0) {
        for (const r of s.reasons.slice(0, 5)) md += '- ' + r + '\n';
      }
      md += '\n';
    }
  }

  // ── Suggested Sensors ──
  if (gaps.suggestedSensors.length > 0) {
    md += '## Suggested New Sensors\n\n';
    md += '| Sensor ID | Requests | Reasons |\n';
    md += '|-----------|----------|---------|\n';
    for (const s of gaps.suggestedSensors) {
      md += '| `' + s.id + '` | ' + s.requestCount + ' | ' + s.reasons.slice(0, 2).join('; ') + ' |\n';
    }
    md += '\n';
  }

  // ── Suggested SVG Opts ──
  if (gaps.suggestedSvgOpts.length > 0) {
    md += '## Suggested New Factory Options\n\n';
    md += '| Factory | Option | Requests | Reason |\n';
    md += '|---------|--------|----------|--------|\n';
    for (const s of gaps.suggestedSvgOpts.slice(0, 30)) {
      md += '| `' + s.factory + '` | `' + s.opt + '` | ' + s.count + ' | ' + (s.reasons[0] || '') + ' |\n';
    }
    md += '\n';
  }

  // ── Suggested Schema Fields ──
  if (gaps.suggestedSchemaFields.length > 0) {
    md += '## Suggested Schema Additions\n\n';
    md += '| Location | Field | Requests | Reason |\n';
    md += '|----------|-------|----------|--------|\n';
    for (const s of gaps.suggestedSchemaFields.slice(0, 20)) {
      md += '| `' + s.parent + '` | `' + s.field + '` | ' + s.count + ' | ' + (s.reasons[0] || '') + ' |\n';
    }
    md += '\n';
  }

  // ── Pedagogical Limitations ──
  if (gaps.topLimitations.length > 0) {
    md += '## Pedagogical Limitations\n\n';
    md += '_Free-text concerns reported by the LLM, ranked by frequency._\n\n';
    for (const l of gaps.topLimitations) {
      md += '- **(' + l.count + 'x)** ' + l.text + '\n';
    }
    md += '\n';
  }

  // ── Accessibility Gaps ──
  if (gaps.topAccessibilityGaps.length > 0) {
    md += '## Accessibility Gaps\n\n';
    for (const a of gaps.topAccessibilityGaps) {
      md += '- **(' + a.count + 'x)** ' + a.text + '\n';
    }
    md += '\n';
  }

  // ── Validation Error Patterns ──
  if (sortedPatterns.length > 0) {
    md += '## Top Validation Error Patterns\n\n';
    md += '| Count | Pattern |\n';
    md += '|-------|---------|\n';
    for (const [pattern, count] of sortedPatterns) {
      md += '| ' + count + ' | `' + pattern.slice(0, 100) + '` |\n';
    }
    md += '\n';
  }

  fs.writeFileSync(READABLE_PATH, md);

  console.log('Gap Analysis Report');
  console.log('===================');
  console.log('Gap sidecar files loaded: ' + gapFilesLoaded);
  console.log('');
  console.log('Passive detection (hallucinated):');
  console.log('  Unknown factories:  ' + Object.keys(gaps.unknownFactories).length);
  console.log('  Unknown sensors:    ' + Object.keys(gaps.unknownSensors).length);
  console.log('  Unknown step types: ' + Object.keys(gaps.unknownStepTypes).length);
  console.log('  Missing SVG opts:   ' + gaps.missingFactoryOpts.length);
  console.log('');
  console.log('Active detection (LLM-declared):');
  console.log('  Wished factories:  ' + gaps.wishedFactories.length + ' raw → ' + gaps.suggestedFactories.length + ' unique');
  console.log('  Wished sensors:    ' + gaps.wishedSensors.length + ' raw → ' + gaps.suggestedSensors.length + ' unique');
  console.log('  Wished step types: ' + gaps.wishedStepTypes.length + ' raw → ' + gaps.suggestedStepTypes.length + ' unique');
  console.log('  Wished SVG opts:   ' + gaps.wishedSvgOpts.length + ' raw → ' + gaps.suggestedSvgOpts.length + ' unique');
  console.log('  Schema fields:     ' + gaps.wishedSchemaFields.length + ' raw → ' + gaps.suggestedSchemaFields.length + ' unique');
  console.log('  Ped. limitations:  ' + gaps.topLimitations.length + ' unique');
  console.log('  A11y gaps:         ' + gaps.topAccessibilityGaps.length + ' unique');
  console.log('');
  console.log('Reports:');
  console.log('  JSON:     ' + REPORT_PATH);
  console.log('  Markdown: ' + READABLE_PATH);
}

main();
