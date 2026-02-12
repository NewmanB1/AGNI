// src/utils/featureInference.js - good enough v1
const unified = require('unified');
const remarkParse = require('remark-parse');
const remarkMath = require('remark-math');

function parseMarkdown(content) {
  if (!content) return { type: 'root', children: [] };
  return unified()
    .use(remarkParse)
    .use(remarkMath)
    .parse(content);
}

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

    // Quiz/interactive
    if (step.type === 'quiz') {
      features.interactive_elements_count++;
    }

    // Branching
    if (step.on_fail || step.on_success || step.condition) {
      features.has_branching = true;
      features.interactive_elements_count++;
    }

    // Audio (basic)
    const text = (step.content || '') + (step.title || '');
    if (/\.(mp3|wav|ogg)/i.test(text) || /audio:/i.test(text)) {
      features.has_audio = true;
    }

    // Metaphor (simple keywords)
    const metaphorKeywords = {
      weaving: /weav|thread|loom|fabric|stitch/i,
      farming: /farm|seed|harvest|season|crop/i,
      music: /rhythm|beat|melody|tune/i,
      building: /build|construct|foundation/i,
    };
    Object.entries(metaphorKeywords).forEach(([type, regex]) => {
      if (regex.test(text)) {
        features.has_metaphor = true;
        features.metaphor_types.add(type);
      }
    });

    // Graphs (current working version)
    if (text) {
      if (/!\[.*?(graph|chart|diagram).*?\]/gi.test(text) ||
          /\|.*\|.*\|/m.test(text)) {
        features.has_graphs = true;
      }
      const ast = parseMarkdown(text);
      ast.children.forEach(node => {
        if (node.type === 'math' || node.type === 'inlineMath') {
          if (/[=~]/.test(node.value || '')) {
            features.has_graphs = true;
          }
        }
      });
    }
  });

  if (lesson.gate?.on_fail) features.has_branching = true;

  features.sensors_used = Array.from(features.sensors_used);
  features.metaphor_types = Array.from(features.metaphor_types);

  return features;
}

module.exports = { inferFeatures };
