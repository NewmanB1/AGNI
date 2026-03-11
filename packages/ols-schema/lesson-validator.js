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

const { createLogger } = require('@agni/utils/logger');
const log = createLogger('lesson-validator');
const plugins = require('@agni/plugins');

// ── Known runtime constants (read from plugin registry) ─────────────────────

const VALID_STEP_TYPES  = plugins.getValidStepTypes();
const VALID_STEP_FIELDS = plugins.getValidStepFields();
const KNOWN_SENSORS     = plugins.getKnownSensorIds();
const VALID_FACTORIES   = plugins.getFactoryIds();
const FACTORY_OPTS      = plugins.getFactoryOpts();

const SENSOR_CAPABLE_OPTS = new Set([
  'sensor', 'rotateSensor', 'scaleSensor'
]);

const THRESHOLD_OPERATORS = new Set(['>', '<', '>=', '<=', '==', '!=']);
const THRESHOLD_KEYWORDS = new Set(['steady', 'freefall']);

const VALID_GATE_TYPES = new Set(['quiz', 'manual_verification']);

const VALID_DIRECTIVES = /^(skip_to|skip|redirect|hint):/;

// ── Threshold grammar validator ─────────────────────────────────────────────

function validateThreshold(threshold, stepId) {
  const issues = [];
  if (typeof threshold !== 'string' || !threshold.trim()) return issues;

  const raw = threshold.trim();

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

  const conditions = raw.split(/\bAND\b/);
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i].trim();
    if (!cond) continue;

    const parts = cond.split(/\s+/);
    const subject = parts[0];

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

  const steadyCount = (raw.match(/\bsteady\b/gi) || []).length;
  const freefallCount = (raw.match(/\bfreefall\b/gi) || []).length;
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
  let issues = [];
  if (!spec || typeof spec !== 'object') return issues;

  if (spec.compose) {
    if (!Array.isArray(spec.layers) || spec.layers.length === 0) {
      issues.push({ severity: 'error', step: stepId,
        message: 'compose svg_spec has no layers array' });
      return issues;
    }
    for (let li = 0; li < spec.layers.length; li++) {
      const layer = spec.layers[li];
      const layerLabel = stepId + '.layers[' + li + ']';
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
  const issues = [];

  if (!VALID_FACTORIES.has(factoryName)) {
    issues.push({ severity: 'error', step: label,
      message: 'Unknown SVG factory "' + factoryName + '". Valid: ' +
        Array.from(VALID_FACTORIES).join(', ') });
    return issues;
  }

  const allowed = FACTORY_OPTS[factoryName];
  if (allowed) {
    const keys = Object.keys(opts);
    for (let k = 0; k < keys.length; k++) {
      if (!allowed.has(keys[k])) {
        issues.push({ severity: 'error', step: label,
          message: 'SVG factory "' + factoryName + '" does not accept opt "' + keys[k] +
            '". Valid opts: ' + Array.from(allowed).join(', ') });
      }
    }
  }

  for (const sk of SENSOR_CAPABLE_OPTS) {
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
  let issues = [];
  const stepId = step.id || ('step[' + stepIndex + ']');

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

  const keys = Object.keys(step);
  for (let k = 0; k < keys.length; k++) {
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

  const svgSpec = step.svg_spec || step.spec;
  if (svgSpec) {
    issues = issues.concat(validateSvgSpec(svgSpec, stepId));
  }

  return issues;
}

function validateDirectiveTarget(directive, stepId, fieldName, allStepIds, issues) {
  if (typeof directive !== 'string') return;
  const match = directive.match(/^(?:skip_to|redirect):(.+)$/);
  if (match) {
    const targetId = match[1];
    if (!allStepIds.has(targetId)) {
      issues.push({ severity: 'error', step: stepId,
        message: fieldName + ' references step "' + targetId + '" which does not exist' });
    }
  }
}

// ── Gate validation ─────────────────────────────────────────────────────────

function validateGate(gate) {
  const issues = [];
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
  let issues = [];
  if (!lesson || typeof lesson !== 'object') {
    issues.push({ severity: 'error', message: 'Lesson data is not an object' });
    return issues;
  }

  if (!Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    issues.push({ severity: 'error', message: 'Lesson has no steps array' });
    return issues;
  }

  const allStepIds = new Set();
  for (let s = 0; s < lesson.steps.length; s++) {
    if (lesson.steps[s].id) allStepIds.add(lesson.steps[s].id);
  }

  const seenIds = new Set();
  for (let i = 0; i < lesson.steps.length; i++) {
    const step = lesson.steps[i];
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

  const meta = lesson.meta;
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
      const df = meta.declared_features;
      const validBlooms = ['remember','understand','apply','analyze','evaluate','create'];
      if (df.blooms_level && validBlooms.indexOf(df.blooms_level) === -1) {
        issues.push({ severity: 'error', step: 'meta.declared_features',
          message: 'Invalid blooms_level "' + df.blooms_level + '". Valid: ' + validBlooms.join(', ') });
      }
      const validVark = ['visual','auditory','read_write','kinesthetic'];
      const varkArr = Array.isArray(df.vark) ? df.vark : (df.vark ? [df.vark] : []);
      for (let v = 0; v < varkArr.length; v++) {
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
  const fs = require('fs');
  const path = require('path');
  const filePath = process.argv[2];

  if (!filePath) {
    log.error('Usage: node lesson-validator.js <lesson.yaml|lesson.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  let data;

  if (/\.ya?ml$/i.test(filePath)) {
    try {
      const safeYamlLoad = require('@agni/utils/yaml-safe').safeYamlLoad;
      data = safeYamlLoad(raw);
    } catch (e) {
      log.error('YAML parse error: ' + e.message);
      process.exit(1);
    }
  } else {
    data = JSON.parse(raw);
  }

  const results = validateLesson(data);

  if (results.length === 0) {
    log.info('Lesson is runtime-compatible. No issues found.');
    process.exit(0);
  }

  const errors = results.filter(function (r) { return r.severity === 'error'; });
  const warnings = results.filter(function (r) { return r.severity === 'warning'; });

  if (errors.length) {
    log.error(errors.length + ' error(s):');
    errors.forEach(function (e) {
      log.error('ERROR ' + (e.step ? '[' + e.step + '] ' : '') + e.message);
    });
  }
  if (warnings.length) {
    log.warn(warnings.length + ' warning(s):');
    warnings.forEach(function (w) {
      log.warn('WARN ' + (w.step ? '[' + w.step + '] ' : '') + w.message);
    });
  }

  log.info('Total: ' + errors.length + ' errors, ' + warnings.length + ' warnings');
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
