const fs = require('fs');
const yaml = require('js-yaml');
const { inferFeatures } = require('./utils/featureInference');

// Change this path to point to one of your YAML files
const lessonPath = './lessons/gravity.yaml'; // ← update this

try {
  const fileContent = fs.readFileSync(lessonPath, 'utf8');
  const lesson = yaml.load(fileContent);
  
  const features = inferFeatures(lesson);
  
  console.log('Lesson:', features.title);
  console.log('Inferred features:');
  console.log(JSON.stringify(features, null, 2));
} catch (err) {
  console.error('Error:', err.message);
}
