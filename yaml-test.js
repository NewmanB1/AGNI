// yaml-test.js
// Diagnostic: test YAML parsing for one lesson file

const yaml = require('js-yaml');
const fs = require('fs');

const filePath = 'lessons/ShakeRhythm.yaml'; // change this to test other files

try {
  console.log('Reading file:', filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  console.log('File content length:', content.length, 'bytes');
  console.log('First 100 chars:', content.substring(0, 100));

  const data = yaml.load(content);

  console.log('Parsed data:', data);
  console.log('steps exists:', !!data?.steps);
  console.log('steps type:', Array.isArray(data?.steps) ? 'array' : typeof data?.steps);

  if (data?.steps) {
    console.log('Number of steps:', data.steps.length);
    console.log('First step type:', data.steps[0]?.type || '(no type)');
  }
} catch (err) {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
}
