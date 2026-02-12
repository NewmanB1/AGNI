// src/utils/featureInference.js - good enough v1 (sync, no remark-math dependency)

/**
 * Infers features from a parsed OLS lesson object
 * @param {object} lesson - The loaded YAML lesson
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

    // Haptic feedback
    if (step.feedback && /vibration:/i.test(step.feedback)) {
      features.has_haptic_feedback = true;
    }

    // Interactive (quizzes)
    if (step.type === 'quiz') {
      features.interactive_elements_count++;
    }

    // Branching / conditional logic
    if (step.on_fail || step.on_success || step.condition || step.next_if) {
      features.has_branching = true;
      features.interactive_elements_count++;
    }

    // Audio references
    const text = (step.content || '') + (step.title || '');
    if (
      /audio:/i.test(text) ||
      /\.(mp3|wav|ogg|m4a|aac)/i.test(text) ||
      /\[sound\b/i.test(text) ||
      /<audio/i.test(text) ||
      /sound effect|voice|spoken/i.test(text)
    ) {
      features.has_audio = true;
    }

    // Metaphor / cultural references (keyword-based)
    const metaphorPatterns = {
      weaving: /weav|thread|loom|fabric|stitch|pattern|warp|weft/i,
      farming: /farm|seed|harvest|season|crop|soil|plant|grow/i,
      building: /build|construct|foundation|brick|frame|scaffold/i,
      cooking: /cook|recipe|mix|stir|bake|ingredient|flavor/i,
      music: /rhythm|beat|melody|tune|drum|song/i,
    };

    Object.entries(metaphorPatterns).forEach(([type, regex]) => {
      if (regex.test(text)) {
        features.has_metaphor = true;
        features.metaphor_types.add(type);
      }
    });

    // Graph / visual detection
    const content = step.content || '';
    if (content) {
      // Images with relevant keywords
      if (
        /!\[.*?(\bgraph\b|\bchart\b|\bdiagram\b|\bplot\b|\bvisual\b|\bcurve\b|\bline\b|\bbar\b|\bpie\b).*?\]\(.*?\)/gi.test(content) ||
        /!\[.*?(accel|speed|time|fall|gravity|function|data|trend).*?\]/gi.test(content)
      ) {
        features.has_graphs = true;
      }

      // Markdown tables (lenient)
      if (/\|.*\|/m.test(content) && /[-:| ]{3,}/.test(content)) {
        features.has_graphs = true;
      }

      // Math/KaTeX equations (regex-based, no async parsing needed)
      // Matches block math $$...$$ and inline math $...$
      if (/\$\$.+?\$\$/s.test(content) || /\$[^$\n]+?\$/g.test(content)) {
        // Check if the math content looks like an equation (has = ~ → : and alphanumeric)
        const mathBlocks = content.match(/\$\$(.+?)\$\$/gs) || [];
        const inlineMath = content.match(/\$([^$\n]+?)\$/g) || [];
        const allMath = [...mathBlocks, ...inlineMath];

        allMath.forEach(block => {
          const math = block.replace(/\$/g, '');
          if (/[=~→:]/.test(math) && /[a-zA-Z0-9]/.test(math)) {
            features.has_graphs = true;
          }
        });
      }
    }
  });

  // Gate-level branching
  if (lesson.gate?.on_fail || lesson.gate?.on_success) {
    features.has_branching = true;
  }

  features.sensors_used = Array.from(features.sensors_used);
  features.metaphor_types = Array.from(features.metaphor_types);

  return features;
}

module.exports = { inferFeatures };
