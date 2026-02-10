// src/utils/featureInference.js
// Reusable module to infer features from an OLS lesson object (parsed YAML)

const unified = require('unified');
const remarkParse = require('remark-parse');
const remarkMath = require('remark-math');

/**
 * Parses markdown content into an AST using unified + remark-math
 * @param {string} content - Markdown string
 * @returns {object} MDAST
 */
function parseMarkdown(content) {
  if (!content) return { type: 'root', children: [] };
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath);
  return processor.parse(content);
}

/**
 * Infers features from a full lesson object
 * @param {object} lesson - Parsed YAML lesson (with version, meta, steps, etc.)
 * @returns {object} Inferred features
 */
function inferFeatures(lesson) {
  const features = {
    title: lesson.meta?.title || 'Untitled',
    has_graphs: false,
    sensor_count: 0,
    sensors_used: new Set(),
    has_haptic_feedback: false,
    interactive_elements_count: 0,
  };

  // Process each step
  (lesson.steps || []).forEach((step) => {
    // 1. Sensor detection
    if (step.type === 'hardware_trigger') {
      features.sensor_count++;
      if (step.sensor) {
        features.sensors_used.add(step.sensor.toLowerCase());
      }
    }

    // 2. Haptic feedback detection
    if (step.feedback && /vibration:/i.test(step.feedback)) {
      features.has_haptic_feedback = true;
    }

    // 3. Interactive elements (quizzes for now; branching can be added later)
    if (step.type === 'quiz') {
      features.interactive_elements_count++;
    }
    // Optional: detect basic branching (gate or step-level on_fail)
    if (step.on_fail) {
      features.interactive_elements_count++;
    }

    // 4. Graphs/visuals detection in content
    const content = step.content || '';
    if (content) {
      // a. Image references with keywords
      const imageRegex = /!\[.*?(graph|chart|diagram).*?\]\(.*?\)/gi;
      if (imageRegex.test(content)) {
        features.has_graphs = true;
      }

      // b. Markdown tables (simple pipe-table detection)
      const tableRegex = /^\s*\|.*\|\s*$\n^\s*\|[-:\s|]+\|\s*$/m;
      if (tableRegex.test(content)) {
        features.has_graphs = true;
      }

      // c. KaTeX/math blocks that look like equations (variables on both sides of =)
      const ast = parseMarkdown(content);
      ast.children.forEach((node) => {
        if (node.type === 'math' || node.type === 'inlineMath') {
          const mathText = node.value || '';
          // Heuristic: contains = with non-empty content on both sides
          if (/[a-zA-Z0-9]\s*=\s*[a-zA-Z0-9]/.test(mathText)) {
            features.has_graphs = true;
          }
        }
      });
    }
  });

  // Convert Set to Array for clean JSON output
  features.sensors_used = Array.from(features.sensors_used);

  return features;
}

module.exports = {
  inferFeatures,
  // Export parseMarkdown if needed elsewhere
  parseMarkdown,
};
