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
    has_branching: false,
    has_audio: false,
    has_metaphor: false,
    metaphor_types: new Set(),
  };

  (lesson.steps || []).forEach(step => {
    // Sensors
    if (step.type === 'hardware_trigger') {
      features.sensor_count++;
      if (step.sensor) features.sensors_used.add(step.sensor.toLowerCase());
    }

    // Haptic
    if (step.feedback && /vibration:/i.test(step.feedback)) {
      features.has_haptic_feedback = true;
    }

    // Quizzes
    if (step.type === 'quiz') {
      features.interactive_elements_count++;
    }

    // Branching / conditional logic
    if (step.on_fail || step.on_success || step.condition || step.next_if) {
      features.has_branching = true;
      features.interactive_elements_count++;
    }

    // Audio references
    const content = (step.content || '') + (step.title || '');
    if (
      /audio:/i.test(content) ||
      /\.(mp3|wav|ogg|m4a|aac)/i.test(content) ||
      /\[sound\b/i.test(content) ||
      /<audio/i.test(content) ||
      /sound effect/i.test(content)
    ) {
      features.has_audio = true;
    }

    // Metaphor / cultural reference keywords
    const metaphorPatterns = {
      weaving: /weav|thread|loom|fabric|stitch|pattern|warp|weft/i,
      farming: /farm|seed|harvest|season|crop|soil|plant|grow/i,
      building: /build|construct|foundation|brick|frame|scaffold/i,
      cooking: /cook|recipe|mix|stir|bake|ingredient|flavor/i,
      music: /rhythm|beat|melody|tune|drum|song/i,
    };

    Object.entries(metaphorPatterns).forEach(([type, regex]) => {
      if (regex.test(content)) {
        features.has_metaphor = true;
        features.metaphor_types.add(type);
      }
    });
  });

  // Also check gate-level branching
  if (lesson.gate?.on_fail || lesson.gate?.on_success) {
    features.has_branching = true;
  }

  features.sensors_used = Array.from(features.sensors_used);
  features.metaphor_types = Array.from(features.metaphor_types);

  return features;
}

module.exports = {
  inferFeatures,
  // Export parseMarkdown if needed elsewhere
  parseMarkdown,
};
