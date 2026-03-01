'use strict';

/**
 * Lesson runtime-compatibility validator.
 *
 * Validates that a lesson YAML/JSON uses ONLY mechanics the AGNI runtime
 * actually supports. Catches design errors before they reach the player.
 *
 * Usage:
 *   const { validateLesson } = require('./lesson-validator');
 *   const issues = validateLesson(lessonData);
 *   // issues: Array<{ severity: 'error'|'warning', step?: string, message: string }>
 */

// ── Known runtime constants ─────────────────────────────────────────────────

const VALID_STEP_TYPES = new Set([
  'instruction', 'hardware_trigger', 'quiz', 'fill_blank',
  'matching', 'ordering', 'completion'
]);

const VALID_STEP_FIELDS = new Set([
  'id', 'type', 'content', 'sensor', 'threshold', 'feedback',
  'answer_options', 'correct_index', 'blanks', 'pairs',
  'items', 'correct_order', 'expected_duration', 'max_attempts',
  'weight', 'on_fail', 'on_success', 'condition', 'next_if',
  'svg_spec', 'spec'
]);

const KNOWN_SENSORS = new Set([
  'accel.x', 'accel.y', 'accel.z', 'accel.magnitude', 'accel.total',
  'accel.total.x', 'accel.total.y', 'accel.total.z',
  'gyro.x', 'gyro.y', 'gyro.z', 'gyro.magnitude',
  'rotation.alpha', 'rotation.beta', 'rotation.gamma',
  'mag.x', 'mag.y', 'mag.z', 'mag.magnitude', 'mag.total',
  'light', 'light.ambient', 'pressure', 'temperature', 'sound.level'
]);

const VALID_FACTORIES = new Set([
  'venn', 'barGraph', 'pieChart', 'numberLine', 'balanceScale',
  'clockFace', 'flowMap', 'polygon', 'axis', 'tree',
  'numberLineDynamic', 'clockFaceDynamic', 'timeGraph',
  'arrowMap', 'polygonDynamic', 'cartesianGrid', 'unitCircle'
]);

const FACTORY_OPTS = {
  venn:              new Set(['title','w','h','sets']),
  barGraph:          new Set(['title','w','h','data','yLabel','yMax','horizontal']),
  pieChart:          new Set(['title','w','h','data','donut']),
  numberLine:        new Set(['title','w','h','min','max','step','marks']),
  balanceScale:      new Set(['title','w','h','left','right']),
  clockFace:         new Set(['w','h','hours','minutes','showDigital','label']),
  flowMap:           new Set(['title','w','h','nodes','edges']),
  polygon:           new Set(['title','w','h','sides','color','fillOpacity','filled','vertexLabels']),
  axis:              new Set(['title','w','h','min','max','step','xLabel','yLabel','fn','values']),
  tree:              new Set(['title','w','h','data','color']),
  numberLineDynamic: new Set(['title','w','h','min','max','step','sensor','sensorMin','sensorMax','bounce','bounceSpeed','ballColor','marks']),
  clockFaceDynamic:  new Set(['h','mode','sensor','hours','minutes','showDigital','label']),
  timeGraph:         new Set(['title','w','h','windowSeconds','xLabel','streams']),
  arrowMap:          new Set(['title','w','h','background','bgOpacity','timeline','arrows']),
  polygonDynamic:    new Set(['title','w','h','sides','r','cx','cy','color','fillOpacity',
                              'showCentroid','showVertexLabels','showSideLabels','showAngles',
                              'rotate','rotateAnimation','rotateSpeed','rotateSensor',
                              'rotateSensorMin','rotateSensorMax','rotateOrigin',
                              'scale','scaleAnimation','scaleMin','scaleMax','scaleSensor',
                              'decompose','decomposeAnimate']),
  cartesianGrid:     new Set(['title','w','h','xMin','xMax','yMin','yMax','xStep','yStep',
                              'xLabel','yLabel','showGrid','showMinorGrid','labelAxes',
                              'plots','points','vectors','slopeTriangles','tangents','animatedPlot']),
  unitCircle:        new Set(['title','w','h','angleDeg','animate','speed','sensor',
                              'sensorMin','sensorMax','showSine','showCosine','showTangent','showValues'])
};

const SENSOR_CAPABLE_OPTS = new Set([
  'sensor', 'rotateSensor', 'scaleSensor'
]);

const THRESHOLD_OPERATORS = new Set(['>', '<', '>=', '<=', '==', '!=']);
const THRESHOLD_KEYWORDS = new Set(['steady', 'freefall']);

const VALID_GATE_TYPES = new Set(['quiz', 'manual_verification']);

const VALID_DIRECTIVES = /^(skip_to|skip|redirect|hint):/;

// ── Threshold grammar validator ─────────────────────────────────────────────

function validateThreshold(threshold, stepId) {
  var issues = [];
  if (typeof threshold !== 'string' || !threshold.trim()) return issues;

  var raw = threshold.trim();

  if (/\bOR\b/i.test(raw)) {
    issues.push({ severity: 'error', step: stepId,
      message: 'Threshold uses OR — only AND is supported: "' + raw + '"' });
  }
  if (/[()]/.test(raw)) {
    issues.push({ severity: 'error', step: stepId,
      message: 'Threshold uses parentheses — grouping is not supported: "' + raw + '"' });
  }
  if (/\bNOT\b/i.test(raw)) {
    issues.push({ severity: 'error', step: stepId,
      message: 'Threshold uses NOT — negation is not supported: "' + raw + '"' });
  }

  var conditions = raw.split(/\bAND\b/);
  for (var i = 0; i < conditions.length; i++) {
    var cond = conditions[i].trim();
    if (!cond) continue;

    var parts = cond.split(/\s+/);
    var subject = parts[0];

    if (!subject) continue;

    if (THRESHOLD_KEYWORDS.has(subject.toLowerCase())) {
      if (parts.length < 3) {
        issues.push({ severity: 'error', step: stepId,
          message: 'Duration condition "' + subject + '" missing operator+value: "' + cond + '"' });
      } else if (!THRESHOLD_OPERATORS.has(parts[1])) {
        issues.push({ severity: 'error', step: stepId,
          message: 'Invalid operator "' + parts[1] + '" in duration condition: "' + cond + '"' });
      }
      continue;
    }

    if (parts.length < 3) {
      issues.push({ severity: 'error', step: stepId,
        message: 'Sensor condition missing operator+value: "' + cond + '"' });
      continue;
    }

    if (!THRESHOLD_OPERATORS.has(parts[1])) {
      issues.push({ severity: 'error', step: stepId,
        message: 'Invalid threshold operator "' + parts[1] + '": "' + cond + '"' });
    }

    if (/[+\-*/^%]/.test(parts[0]) || /[+\-*/^%]/.test(parts[2])) {
      issues.push({ severity: 'error', step: stepId,
        message: 'Arithmetic expressions in thresholds are not supported: "' + cond + '"' });
    }

    if (!KNOWN_SENSORS.has(subject)) {
      issues.push({ severity: 'warning', step: stepId,
        message: 'Unknown sensor ID "' + subject + '" — may not fire on most devices' });
    }
  }

  var steadyCount = (raw.match(/\bsteady\b/gi) || []).length;
  var freefallCount = (raw.match(/\bfreefall\b/gi) || []).length;
  if (steadyCount > 1) {
    issues.push({ severity: 'warning', step: stepId,
      message: 'Multiple "steady" conditions — only the rightmost gets duration coupling' });
  }
  if (freefallCount > 1) {
    issues.push({ severity: 'warning', step: stepId,
      message: 'Multiple "freefall" conditions — only the rightmost gets duration coupling' });
  }

  return issues;
}

// ── SVG spec validator ──────────────────────────────────────────────────────

function validateSvgSpec(spec, stepId) {
  var issues = [];
  if (!spec || typeof spec !== 'object') return issues;

  if (spec.compose) {
    if (!Array.isArray(spec.layers) || spec.layers.length === 0) {
      issues.push({ severity: 'error', step: stepId,
        message: 'compose svg_spec has no layers array' });
      return issues;
    }
    for (var li = 0; li < spec.layers.length; li++) {
      var layer = spec.layers[li];
      var layerLabel = stepId + '.layers[' + li + ']';
      if (!layer.factory) {
        issues.push({ severity: 'error', step: layerLabel,
          message: 'Compose layer missing factory name' });
        continue;
      }
      issues = issues.concat(validateSingleFactory(layer.factory, layer.opts || {}, layerLabel));
    }
    return issues;
  }

  if (!spec.factory) {
    issues.push({ severity: 'warning', step: stepId,
      message: 'svg_spec has no factory field — will be ignored by renderer' });
    return issues;
  }

  return issues.concat(validateSingleFactory(spec.factory, spec.opts || {}, stepId));
}

function validateSingleFactory(factoryName, opts, label) {
  var issues = [];

  if (!VALID_FACTORIES.has(factoryName)) {
    issues.push({ severity: 'error', step: label,
      message: 'Unknown SVG factory "' + factoryName + '". Valid: ' +
        Array.from(VALID_FACTORIES).join(', ') });
    return issues;
  }

  var allowed = FACTORY_OPTS[factoryName];
  if (allowed) {
    var keys = Object.keys(opts);
    for (var k = 0; k < keys.length; k++) {
      if (!allowed.has(keys[k])) {
        issues.push({ severity: 'error', step: label,
          message: 'SVG factory "' + factoryName + '" does not accept opt "' + keys[k] +
            '". Valid opts: ' + Array.from(allowed).join(', ') });
      }
    }
  }

  for (var sk of SENSOR_CAPABLE_OPTS) {
    if (opts[sk] && typeof opts[sk] === 'string' && !KNOWN_SENSORS.has(opts[sk])) {
      issues.push({ severity: 'warning', step: label,
        message: 'SVG sensor binding "' + sk + ': ' + opts[sk] +
          '" references unknown sensor — may not update on most devices' });
    }
  }

  if (opts.background && typeof opts.background === 'string') {
    if (/^https?:\/\//.test(opts.background)) {
      issues.push({ severity: 'warning', step: label,
        message: 'arrowMap background uses external URL — will fail offline. Bundle the image.' });
    }
  }

  if (opts.fn && typeof opts.fn === 'string') {
    if (/\bfetch\b|\bXMLHttp|\bimport\b|\brequire\b/.test(opts.fn)) {
      issues.push({ severity: 'error', step: label,
        message: 'fn expression contains prohibited runtime call' });
    }
  }

  return issues;
}

// ── Step-level validation ───────────────────────────────────────────────────

function validateStep(step, stepIndex, allStepIds) {
  var issues = [];
  var stepId = step.id || ('step[' + stepIndex + ']');

  if (!step.id) {
    issues.push({ severity: 'error', step: stepId,
      message: 'Step missing required "id" field' });
  }
  if (!step.type) {
    issues.push({ severity: 'error', step: stepId,
      message: 'Step missing required "type" field' });
  } else if (!VALID_STEP_TYPES.has(step.type)) {
    issues.push({ severity: 'error', step: stepId,
      message: 'Unknown step type "' + step.type + '". Valid: ' +
        Array.from(VALID_STEP_TYPES).join(', ') });
  }

  var keys = Object.keys(step);
  for (var k = 0; k < keys.length; k++) {
    if (!VALID_STEP_FIELDS.has(keys[k])) {
      issues.push({ severity: 'error', step: stepId,
        message: 'Unknown step field "' + keys[k] + '" — runtime will ignore or reject this. ' +
          'OLS fields: ' + Array.from(VALID_STEP_FIELDS).join(', ') });
    }
  }

  if (step.type === 'hardware_trigger') {
    if (step.threshold) {
      issues = issues.concat(validateThreshold(step.threshold, stepId));
    }
    if (step.sensor && !KNOWN_SENSORS.has(step.sensor)) {
      issues.push({ severity: 'warning', step: stepId,
        message: 'Unknown sensor "' + step.sensor + '" — may not fire on most devices' });
    }
    if (!step.on_fail) {
      issues.push({ severity: 'warning', step: stepId,
        message: 'hardware_trigger has no on_fail — learner will be stuck if sensors are unavailable' });
    }
  }

  if (step.type === 'quiz') {
    if (!Array.isArray(step.answer_options) || step.answer_options.length < 2) {
      issues.push({ severity: 'error', step: stepId,
        message: 'Quiz step needs answer_options with at least 2 items' });
    }
    if (step.correct_index == null) {
      issues.push({ severity: 'error', step: stepId,
        message: 'Quiz step missing correct_index' });
    } else if (step.answer_options && step.correct_index >= step.answer_options.length) {
      issues.push({ severity: 'error', step: stepId,
        message: 'correct_index (' + step.correct_index + ') out of bounds for ' +
          step.answer_options.length + ' options' });
    }
  }

  if (step.type === 'fill_blank') {
    if (!Array.isArray(step.blanks) || step.blanks.length === 0) {
      issues.push({ severity: 'error', step: stepId,
        message: 'fill_blank step needs a non-empty blanks array' });
    }
  }

  if (step.type === 'matching') {
    if (!Array.isArray(step.pairs) || step.pairs.length < 2) {
      issues.push({ severity: 'error', step: stepId,
        message: 'matching step needs pairs array with at least 2 entries' });
    }
  }

  if (step.type === 'ordering') {
    if (!Array.isArray(step.items) || step.items.length < 2) {
      issues.push({ severity: 'error', step: stepId,
        message: 'ordering step needs items array with at least 2 entries' });
    }
    if (!Array.isArray(step.correct_order)) {
      issues.push({ severity: 'error', step: stepId,
        message: 'ordering step missing correct_order array' });
    } else if (step.items && step.correct_order.length !== step.items.length) {
      issues.push({ severity: 'error', step: stepId,
        message: 'correct_order length (' + step.correct_order.length +
          ') does not match items length (' + step.items.length + ')' });
    }
  }

  if (step.on_fail) {
    validateDirectiveTarget(step.on_fail, stepId, 'on_fail', allStepIds, issues);
  }
  if (step.on_success) {
    validateDirectiveTarget(step.on_success, stepId, 'on_success', allStepIds, issues);
  }

  var svgSpec = step.svg_spec || step.spec;
  if (svgSpec) {
    issues = issues.concat(validateSvgSpec(svgSpec, stepId));
  }

  return issues;
}

function validateDirectiveTarget(directive, stepId, fieldName, allStepIds, issues) {
  if (typeof directive !== 'string') return;
  var match = directive.match(/^(?:skip_to|redirect):(.+)$/);
  if (match) {
    var targetId = match[1];
    if (!allStepIds.has(targetId)) {
      issues.push({ severity: 'error', step: stepId,
        message: fieldName + ' references step "' + targetId + '" which does not exist' });
    }
  }
}

// ── Gate validation ─────────────────────────────────────────────────────────

function validateGate(gate) {
  var issues = [];
  if (!gate || typeof gate !== 'object') return issues;

  if (gate.type && !VALID_GATE_TYPES.has(gate.type)) {
    issues.push({ severity: 'error', step: 'gate',
      message: 'Unknown gate type "' + gate.type + '". Valid: quiz, manual_verification' });
  }
  if (gate.passing_score != null && (gate.passing_score < 0 || gate.passing_score > 1)) {
    issues.push({ severity: 'error', step: 'gate',
      message: 'Gate passing_score must be 0.0–1.0, got ' + gate.passing_score });
  }
  return issues;
}

// ── Top-level lesson validation ─────────────────────────────────────────────

function validateLesson(lesson) {
  var issues = [];
  if (!lesson || typeof lesson !== 'object') {
    issues.push({ severity: 'error', message: 'Lesson data is not an object' });
    return issues;
  }

  if (!Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    issues.push({ severity: 'error', message: 'Lesson has no steps array' });
    return issues;
  }

  var allStepIds = new Set();
  for (var s = 0; s < lesson.steps.length; s++) {
    if (lesson.steps[s].id) allStepIds.add(lesson.steps[s].id);
  }

  var seenIds = new Set();
  for (var i = 0; i < lesson.steps.length; i++) {
    var step = lesson.steps[i];
    if (step.id && seenIds.has(step.id)) {
      issues.push({ severity: 'error', step: step.id,
        message: 'Duplicate step ID "' + step.id + '"' });
    }
    if (step.id) seenIds.add(step.id);
    issues = issues.concat(validateStep(step, i, allStepIds));
  }

  if (lesson.gate) {
    issues = issues.concat(validateGate(lesson.gate));
  }

  var meta = lesson.meta;
  if (meta && typeof meta === 'object') {
    if (meta.utu && typeof meta.utu === 'object') {
      if (meta.utu.protocol != null && (meta.utu.protocol < 1 || meta.utu.protocol > 5)) {
        issues.push({ severity: 'error', step: 'meta.utu',
          message: 'UTU protocol must be 1–5, got ' + meta.utu.protocol });
      }
      if (meta.utu.band != null && (meta.utu.band < 1 || meta.utu.band > 6)) {
        issues.push({ severity: 'error', step: 'meta.utu',
          message: 'UTU band must be 1–6, got ' + meta.utu.band });
      }
    }
    if (meta.declared_features && typeof meta.declared_features === 'object') {
      var df = meta.declared_features;
      var validBlooms = ['remember','understand','apply','analyze','evaluate','create'];
      if (df.blooms_level && validBlooms.indexOf(df.blooms_level) === -1) {
        issues.push({ severity: 'error', step: 'meta.declared_features',
          message: 'Invalid blooms_level "' + df.blooms_level + '". Valid: ' + validBlooms.join(', ') });
      }
      var validVark = ['visual','auditory','read_write','kinesthetic'];
      var varkArr = Array.isArray(df.vark) ? df.vark : (df.vark ? [df.vark] : []);
      for (var v = 0; v < varkArr.length; v++) {
        if (validVark.indexOf(varkArr[v]) === -1) {
          issues.push({ severity: 'error', step: 'meta.declared_features',
            message: 'Invalid VARK modality "' + varkArr[v] + '". Valid: ' + validVark.join(', ') });
        }
      }
    }
  }

  return issues;
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (require.main === module) {
  var fs = require('fs');
  var path = require('path');
  var filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node lesson-validator.js <lesson.yaml|lesson.json>');
    process.exit(1);
  }

  var raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  var data;

  if (/\.ya?ml$/i.test(filePath)) {
    try {
      var yaml = require('js-yaml');
      data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    } catch (e) {
      console.error('YAML parse error:', e.message);
      process.exit(1);
    }
  } else {
    data = JSON.parse(raw);
  }

  var results = validateLesson(data);

  if (results.length === 0) {
    console.log('✓ Lesson is runtime-compatible. No issues found.');
    process.exit(0);
  }

  var errors = results.filter(function (r) { return r.severity === 'error'; });
  var warnings = results.filter(function (r) { return r.severity === 'warning'; });

  if (errors.length) {
    console.log('\n✗ ' + errors.length + ' error(s):');
    errors.forEach(function (e) {
      console.log('  ERROR ' + (e.step ? '[' + e.step + '] ' : '') + e.message);
    });
  }
  if (warnings.length) {
    console.log('\n⚠ ' + warnings.length + ' warning(s):');
    warnings.forEach(function (w) {
      console.log('  WARN  ' + (w.step ? '[' + w.step + '] ' : '') + w.message);
    });
  }

  console.log('\nTotal: ' + errors.length + ' errors, ' + warnings.length + ' warnings');
  process.exit(errors.length > 0 ? 1 : 0);
}

module.exports = {
  validateLesson:    validateLesson,
  validateStep:      validateStep,
  validateThreshold: validateThreshold,
  validateSvgSpec:   validateSvgSpec,
  validateGate:      validateGate,
  VALID_FACTORIES:   VALID_FACTORIES,
  FACTORY_OPTS:      FACTORY_OPTS,
  KNOWN_SENSORS:     KNOWN_SENSORS,
  VALID_STEP_TYPES:  VALID_STEP_TYPES,
  VALID_STEP_FIELDS: VALID_STEP_FIELDS
};
