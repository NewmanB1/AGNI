// scripts/validate-all.js
// Validates all .yaml/.yml lessons in lessons/ against the OLS schema
// and threshold syntax for hardware_trigger steps (e.g. freefall > 0.2s).
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');
const { validateThresholdSyntax } = require('../src/utils/threshold-syntax');

const lessonsDir = path.resolve(__dirname, '..', 'lessons');
const schemaPath = path.resolve(__dirname, '..', 'schemas', 'ols.schema.json');

console.log('🔍 Validating all .yaml lessons...\n');

function collectYaml(dir, prefix) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let result = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      result = result.concat(collectYaml(path.join(dir, e.name), prefix ? prefix + e.name + '/' : e.name + '/'));
    } else if (e.name.endsWith('.yaml') || e.name.endsWith('.yml')) {
      result.push({ rel: (prefix || '') + e.name, full: path.join(dir, e.name) });
    }
  }
  return result;
}

const files = collectYaml(lessonsDir, '');

if (files.length === 0) {
  console.log('No .yaml or .yml files found in lessons/');
  process.exit(0);
}

let passed = 0;
let failed = 0;

function validateThresholds(data, file) {
  const steps = data.steps || [];
  const errors = [];
  steps.forEach((step, idx) => {
    if (step.type === 'hardware_trigger' && step.threshold) {
      const result = validateThresholdSyntax(step.threshold);
      if (!result.valid) {
        errors.push(`step ${idx + 1} (${step.id || '?'}): threshold "${step.threshold}" — ${result.error}`);
      }
    }
  });
  return errors;
}

files.forEach(({ rel: file, full: fullPath }) => {
  const safeFile = file.replace(/[\\/]/g, '_');
  const tmpJson = path.resolve(__dirname, '..', `tmp_${safeFile}.json`);

  console.log(`→ Checking ${file}`);

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const data = yaml.load(content);
    fs.writeFileSync(tmpJson, JSON.stringify(data));

    execSync(`npx ajv validate -s "${schemaPath}" -d "${tmpJson}" -c ajv-formats`, {
      stdio: 'pipe'
    });

    const thresholdErrors = validateThresholds(data, file);
    if (thresholdErrors.length > 0) {
      thresholdErrors.forEach(e => console.error(`   ✗ ${e}`));
      throw new Error('Threshold syntax errors');
    }

    console.log(`   ✓ Valid\n`);
    passed++;
  } catch (err) {
    const output = err.stdout ? err.stdout.toString() : '';
    const errOutput = err.stderr ? err.stderr.toString() : '';
    if (err.message !== 'Threshold syntax errors') {
      console.error(`   ✗ INVALID`);
      if (output) console.error(`   ${output.trim()}`);
      if (errOutput) console.error(`   ${errOutput.trim()}`);
    }
    console.log('');
    failed++;
  } finally {
    if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${files.length} total`);

if (failed > 0) {
  process.exit(1);
}
