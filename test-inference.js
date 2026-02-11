// test-inference.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { inferFeatures } = require('./src/utils/featureInference');

(async () => {
  const lessonsDir = './lessons';

  console.log('Scanning:', path.resolve(lessonsDir));

  try {
    const files = fs.readdirSync(lessonsDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    if (files.length === 0) {
      console.log('No YAML files in lessons/');
      return;
    }

    console.log(`Found ${files.length} lesson(s):\n`);

    for (const file of files) {
      const fullPath = path.join(lessonsDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lesson = yaml.load(content);
        const features = await inferFeatures(lesson);  // now await

        console.log(`=== ${file} ===`);
        console.log('Title:', features.title || '(no title)');
        console.log('Features:');
        console.log(JSON.stringify(features, null, 2));
        console.log('---');
      } catch (err) {
        console.error(`Error in ${file}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error reading lessons/:', err.message);
  }
})();
