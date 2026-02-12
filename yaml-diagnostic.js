// yaml-diagnostic.js
// Test if YAML parsing works for a single file

const yaml = require('js-yaml');
const fs = require('fs');

const file = 'lessons/ShakeRhythm.yaml';

console.log('Testing file:', file);

try {
  const content = fs.readFileSync(file, 'utf8');
  console.log('File size:', content.length, 'bytes');
  console.log('First 100 chars:', content.substring(0, 100));

  const data = yaml.load(content);

  console.log('Parsed data type:', typeof data);
  console.log('Parsed data keys:', data ? Object.keys(data) : 'undefined');
  console.log('steps exists:', !!data?.steps);
  console.log('steps type:', data?.steps ? (Array.isArray(data.steps) ? 'array' : typeof data.steps) : 'undefined');

  if (data?.steps) {
    console.log('Number of steps:', data.steps.length);
  }
} catch (err) {
  console.error('Error loading/parsing file:');
  console.error(err.message);
  console.error(err.stack);
}
