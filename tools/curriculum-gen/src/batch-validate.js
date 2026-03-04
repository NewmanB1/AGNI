'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { validateYaml } = require('./lesson-validate');

const LESSONS_DIR = path.join(__dirname, '..', 'output', 'lessons');
const PLAN_PATH = path.join(__dirname, '..', 'output', 'lesson-plan.json');
const REPORT_PATH = path.join(__dirname, '..', 'output', 'reports', 'validation.json');

function collectYamlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectYamlFiles(full));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const files = collectYamlFiles(LESSONS_DIR);
  if (files.length === 0) {
    console.log('No YAML files found in ' + LESSONS_DIR);
    return;
  }

  let plan = null;
  const specMap = {};
  if (fs.existsSync(PLAN_PATH)) {
    plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
    for (const lesson of plan.lessons) {
      const key = lesson.unit + '--' + lesson.archetype;
      specMap[key] = lesson;
    }
  }

  let valid = 0;
  let invalid = 0;
  const errorSummary = {};
  const results = [];

  for (const filepath of files) {
    const relative = path.relative(LESSONS_DIR, filepath);
    const basename = path.basename(filepath, '.yaml');
    const spec = specMap[basename] || null;

    let content;
    try {
      content = fs.readFileSync(filepath, 'utf8');
    } catch (e) {
      console.log('SKIP ' + relative + ' (read error)');
      continue;
    }

    const result = validateYaml(content, spec);

    if (result.valid) {
      valid++;
    } else {
      invalid++;
      for (const err of result.errors) {
        const key = err.replace(/["'][^"']+["']/g, '<X>').replace(/\d+/g, '<N>');
        errorSummary[key] = (errorSummary[key] || 0) + 1;
      }
    }

    results.push({
      file: relative,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      features: result.features
    });
  }

  const report = {
    generated: new Date().toISOString(),
    totalFiles: files.length,
    valid: valid,
    invalid: invalid,
    errorPatterns: Object.entries(errorSummary)
      .sort(function (a, b) { return b[1] - a[1]; }),
    results: results
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('Batch Validation');
  console.log('================');
  console.log('Total files: ' + files.length);
  console.log('Valid:       ' + valid);
  console.log('Invalid:     ' + invalid);
  console.log('');

  if (Object.keys(errorSummary).length > 0) {
    console.log('Top error patterns:');
    const sorted = Object.entries(errorSummary).sort(function (a, b) { return b[1] - a[1]; });
    for (const [pattern, count] of sorted.slice(0, 10)) {
      console.log('  [' + count + 'x] ' + pattern.slice(0, 80));
    }
  }

  console.log('\nReport: ' + REPORT_PATH);
}

main();
