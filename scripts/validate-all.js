// scripts/validate-all.js
// Validates all .yaml/.yml lessons in lessons/ against the OLS schema
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

const lessonsDir = path.resolve(__dirname, '..', 'lessons');
const schemaPath = path.resolve(__dirname, '..', 'schemas', 'ols.schema.json');

console.log('🔍 Validating all .yaml lessons...\n');

const files = fs.readdirSync(lessonsDir)
  .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

if (files.length === 0) {
  console.log('No .yaml or .yml files found in lessons/');
  process.exit(0);
}

let passed = 0;
let failed = 0;

files.forEach(file => {
  const fullPath = path.join(lessonsDir, file);
  const tmpJson = path.resolve(__dirname, '..', `tmp_${file}.json`);

  console.log(`→ Checking ${file}`);

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const data = yaml.load(content);
    fs.writeFileSync(tmpJson, JSON.stringify(data));

    execSync(`npx ajv validate -s "${schemaPath}" -d "${tmpJson}" -c ajv-formats`, {
      stdio: 'pipe'
    });

    console.log(`   ✓ Valid\n`);
    passed++;
  } catch (err) {
    const output = err.stdout ? err.stdout.toString() : '';
    const errOutput = err.stderr ? err.stderr.toString() : '';
    console.error(`   ✗ INVALID`);
    if (output) console.error(`   ${output.trim()}`);
    if (errOutput) console.error(`   ${errOutput.trim()}`);
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
