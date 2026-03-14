// scripts/validate-all.js
// Validates all .yaml/.yml lessons in lessons/ against the OLS schema,
// threshold syntax, and step-type-specific semantics (P2-18).
const fs = require('fs');
const path = require('path');
const { safeYamlLoad } = require('@ols/compiler/services/compiler');
const lessonSchema = require('@agni/services/lesson-schema');
const { walkDir } = require('@agni/utils/io');

const lessonsDir = path.resolve(__dirname, '..', 'lessons');

console.log('🔍 Validating all .yaml lessons...\n');

const fullPaths = walkDir(lessonsDir, { extensions: ['.yaml', '.yml'] });
const files = fullPaths.map(function (full) {
  const rel = path.relative(lessonsDir, full).replace(/\\/g, '/');
  return { rel: rel, full: full };
});

if (files.length === 0) {
  console.log('No .yaml or .yml files found in lessons/');
  process.exit(0);
}

let passed = 0;
let failed = 0;

files.forEach(({ rel: file, full: fullPath }) => {
  console.log(`→ Checking ${file}`);

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const data = safeYamlLoad(content);
    const result = lessonSchema.validateLessonData(data);

    if (!result.valid) {
      result.errors.forEach(function (e) { console.error(`   ✗ ${e}`); });
      throw new Error('Validation failed');
    }

    console.log(`   ✓ Valid\n`);
    passed++;
  } catch (err) {
    if (err.message !== 'Validation failed') {
      console.error(`   ✗ ${err.message}`);
    }
    console.log('');
    failed++;
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${files.length} total`);

if (failed > 0) {
  process.exit(1);
}
