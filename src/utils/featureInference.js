// src/utils/featureInference.js

const unified = require('unified');
const remarkParse = require('remark-parse');
const remarkMath = require('remark-math'); // For detecting KaTeX blocks

// Helper to parse markdown content and traverse the AST
function parseMarkdown(content) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath); // Enables math node detection
  return processor.parse(content);
}

// Main inference function
// Takes a parsed lesson object (from js-yaml.load) and returns inferred features
function inferFeatures(lesson) {
  const features = {
    has_graphs: false,
    sensor_count: 0,
    sensors_used: new Set(),
    has_haptic_feedback: false,
    interactive_elements_count: 0,
  };

  // Traverse all steps
  lesson.steps.forEach((step) => {
    // Sensor detection
    if (step.type === 'hardware_trigger') {
      features.sensor_count++;
      if (step.sensor) {
        features.sensors_used.add(step.sensor.toLowerCase());
      }
    }

    // Haptic feedback
    if (step.feedback && /vibration:/i.test(step.feedback)) {
      features.has_haptic_feedback = true;
    }

    // Interactive elements (quizzes + branching)
    if (step.type === 'quiz') {
      features.interactive_elements_count++;
    }
    // Basic branching detection (e.g., on_fail in gate or steps)
    if (step.on_fail || (lesson.gate && lesson.gate.on_fail)) {
      features.interactive_elements_count++;
    }

    // Graphs/Visuals detection in content (if present)
    if (step.content) {
      // Image refs with keywords
      const imageRegex = /!\[.*?(graph|chart|diagram).*?\]\(.*?\)/i;
      if (imageRegex.test(step.content)) {
        features.has_graphs = true;
      }

      // Markdown tables: look for | --- | or multiple |
      const tableRegex = /^\|.*\|$\n^\|[-:\s]+\|$/m;
      if (tableRegex.test(step.content)) {
        features.has_graphs = true;
      }

      // KaTeX blocks with variables on both sides (e.g., y = mx + b)
      // Parse AST for math nodes
      const ast = parseMarkdown(step.content);
      ast.children.forEach((node) => {
        if (node.type === 'math' || node.type === 'inlineMath') {
          const mathContent = node.value;
          // Naive check for equation-like: has = with vars/expr on both sides
          if (/[a-z0-9].*?\s*=\s*.*?[a-z0-9]/i.test(mathContent)) {
            features.has_graphs = true;
          }
        }
      });
    }
  });

  // Convert set to array for JSON-friendly output
  features.sensors_used = Array.from(features.sensors_used);

  return features;
}

module.exports = { inferFeatures };
