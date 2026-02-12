// test-inference.js
// Runs inference on all YAML lessons in ./lessons and prints results

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { inferFeatures } = require('./src/utils/featureInference');

const lessonsDir = './lessons';

console.log('Scanning directory:', path.resolve(lessonsDir));

try {
  const files = fs.readdirSync(lessonsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (files.length === 0) {
    console.log('No .yaml or .yml files found in lessons/');
    console.log('Make sure your pilot lessons are saved there.');
    process.exit(0);
  }

  console.log(`Found ${files.length} lesson file(s):\n`);

  files.forEach(file => {
    const fullPath = path.join(lessonsDir, file);
    console.log(`Processing: ${file}`);

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lesson = yaml.load(content);

      // Safety: ensure lesson is a valid object
      if (!lesson || typeof lesson !== 'object') {
        throw new Error('YAML did not parse to a valid object (possibly empty or malformed)');
      }

      // Safety: ensure steps is an array
      if (!Array.isArray(lesson.steps)) {
        throw new Error('lesson.steps is missing or not an array');
      }

      const features = inferFeatures(lesson);

      console.log(`\n=== ${file} ===`);
      console.log('Title:', features.title || '(no title)');
      console.log('Features:');
      console.log(JSON.stringify(features, null, 2));
      console.log('---\n');
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
      // Optional: show full stack for debugging
      // console.error(err.stack);
    }
  });
} catch (err) {
  console.error('Error reading lessons directory:', err.message);
}
