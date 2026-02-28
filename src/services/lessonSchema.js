'use strict';

/**
 * Shared OLS lesson schema validation — single source for CLI, hub-transform, and author API.
 * Phase 2 / Sprint K: every lesson path validates with the same schema before business logic.
 */

var path = require('path');
var fs = require('fs');
var validateThresholdSyntax = require('../utils/threshold-syntax').validateThresholdSyntax;

var schemaPath = path.join(__dirname, '../../schemas', 'ols.schema.json');
var Ajv;
var ajvFormats;
try {
  Ajv = require('ajv');
  ajvFormats = require('ajv-formats');
} catch (e) {
  Ajv = null;
}

var validateSchema = null;
if (Ajv && fs.existsSync(schemaPath)) {
  try {
    var schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    var ajv = new Ajv({ allErrors: true });
    if (typeof ajvFormats === 'function') ajvFormats(ajv);
    validateSchema = ajv.compile(schema);
  } catch (err) {
    validateSchema = null;
  }
}

/**
 * Run OLS schema validation only (no structure or threshold checks).
 * Pure: (lessonData) → { valid, errors: string[] }.
 *
 * @param  {object} lessonData  parsed lesson object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWithSchema(lessonData) {
  var errors = [];
  if (!lessonData || typeof lessonData !== 'object') {
    return { valid: false, errors: ['Lesson data must be an object'] };
  }
  if (!validateSchema) {
    return {
      valid: false,
      errors: ['Schema validation unavailable. Install dependencies: npm install ajv ajv-formats']
    };
  }
  var ok = validateSchema(lessonData);
  if (!ok && validateSchema.errors) {
    validateSchema.errors.forEach(function (err) {
      var msg = (err.instancePath || err.params?.missingProperty || '') + ' ' + (err.message || '');
      errors.push(msg.trim());
    });
  }
  return { valid: errors.length === 0, errors: errors };
}

/**
 * Run structure checks (meta, steps). Throws on invalid.
 * Kept in sync with compiler's validateLessonStructure for backward compatibility.
 *
 * @param  {object} lessonData
 */
function validateStructure(lessonData) {
  if (!lessonData || !lessonData.meta || !lessonData.steps) {
    throw new Error('Invalid OLS file. Must contain "meta" and "steps" fields.');
  }
  if (!Array.isArray(lessonData.steps)) {
    throw new Error('"steps" must be a YAML array (each item prefixed with "-").');
  }
}

/**
 * Run threshold syntax validation for hardware_trigger steps.
 * Pure: (lessonData) → { valid: boolean, errors: string[] }.
 *
 * @param  {object} lessonData
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateThresholds(lessonData) {
  var errors = [];
  var steps = lessonData && lessonData.steps;
  if (!Array.isArray(steps)) return { valid: true, errors: [] };
  steps.forEach(function (step, idx) {
    if (step.type === 'hardware_trigger' && step.threshold) {
      var result = validateThresholdSyntax(step.threshold);
      if (!result.valid) {
        errors.push('step ' + (idx + 1) + ' (' + (step.id || '?') + '): threshold "' + step.threshold + '" — ' + result.error);
      }
    }
  });
  return { valid: errors.length === 0, errors: errors };
}

/**
 * Semantic validation: step ID uniqueness, quiz answer bounds, sensor fields,
 * step ID reference checks, and soft warnings for missing optional metadata.
 *
 * @param  {object} lessonData
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateSemantics(lessonData) {
  var errors = [];
  var warnings = [];
  var steps = lessonData && lessonData.steps;
  if (!Array.isArray(steps)) return { errors: errors, warnings: warnings };

  var ids = {};
  steps.forEach(function (step, idx) {
    if (step.id) {
      if (ids[step.id] !== undefined) {
        errors.push('Duplicate step ID "' + step.id + '" at steps ' + (ids[step.id] + 1) + ' and ' + (idx + 1));
      }
      ids[step.id] = idx;
    }
  });

  steps.forEach(function (step, idx) {
    var label = 'step ' + (idx + 1) + ' (' + (step.id || '?') + ')';

    if (step.type === 'quiz') {
      if (!Array.isArray(step.answer_options) || step.answer_options.length < 2) {
        errors.push(label + ': quiz steps require at least 2 answer_options');
      }
      if (step.correct_index != null && Array.isArray(step.answer_options)) {
        if (step.correct_index < 0 || step.correct_index >= step.answer_options.length) {
          errors.push(label + ': correct_index (' + step.correct_index + ') out of bounds (0–' + (step.answer_options.length - 1) + ')');
        }
      }
      if (Array.isArray(step.answer_options)) {
        step.answer_options.forEach(function (opt, oi) {
          if (typeof opt === 'string' && !opt.trim()) {
            warnings.push(label + ': answer option ' + (oi + 1) + ' is empty');
          }
        });
      }
    }

    if (step.type === 'hardware_trigger' && !step.sensor) {
      warnings.push(label + ': hardware_trigger step has no sensor field');
    }

    if (step.type === 'svg') {
      if (!step.svg_spec || !step.svg_spec.factory) {
        errors.push(label + ': svg step requires svg_spec with a factory id');
      } else if (typeof step.svg_spec.factory !== 'string') {
        errors.push(label + ': svg_spec.factory must be a string');
      }
    }

    function checkStepRef(fieldName, val) {
      if (!val || typeof val !== 'string') return;
      var ref = val.replace(/^redirect:|^skip_to:|^ols:/i, '').trim();
      if (ref && ids[ref] === undefined && ref !== 'skip' && ref !== 'hint') {
        warnings.push(label + ': ' + fieldName + ' references unknown step ID "' + ref + '"');
      }
    }
    checkStepRef('on_fail', step.on_fail);
    checkStepRef('on_success', step.on_success);
  });

  var meta = lessonData.meta || {};
  if (meta.is_group != null && typeof meta.is_group !== 'boolean') {
    warnings.push('meta.is_group should be a boolean (true / false)');
  }
  if (!meta.description && !lessonData.description) {
    warnings.push('Missing description (recommended for discoverability)');
  }
  if (!meta.time_required && !lessonData.time_required) {
    warnings.push('Missing time_required (helps students plan)');
  }
  var ont = lessonData.ontology || {};
  if ((!ont.provides || ont.provides.length === 0) && (!ont.requires || ont.requires.length === 0)) {
    warnings.push('No ontology skills defined (limits adaptive recommendations)');
  }

  return { errors: errors, warnings: warnings };
}

/**
 * Full validation: structure (throws) + schema + thresholds + semantics.
 * Use this before buildIR in every path (CLI, hub-transform, author).
 * Returns { valid, errors, warnings }. Structure failure throws instead of returning.
 *
 * @param  {object} lessonData
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateLessonData(lessonData) {
  var errors = [];
  var warnings = [];

  if (!lessonData || typeof lessonData !== 'object') {
    return { valid: false, errors: ['Lesson data must be an object'], warnings: [] };
  }

  try {
    validateStructure(lessonData);
  } catch (e) {
    return { valid: false, errors: [e.message], warnings: [] };
  }

  var schemaResult = validateWithSchema(lessonData);
  if (!schemaResult.valid) {
    errors = errors.concat(schemaResult.errors);
  }

  var thresholdResult = validateThresholds(lessonData);
  if (!thresholdResult.valid) {
    errors = errors.concat(thresholdResult.errors);
  }

  var semanticResult = validateSemantics(lessonData);
  errors = errors.concat(semanticResult.errors);
  warnings = warnings.concat(semanticResult.warnings);

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

module.exports = {
  validateWithSchema: validateWithSchema,
  validateStructure: validateStructure,
  validateThresholds: validateThresholds,
  validateSemantics: validateSemantics,
  validateLessonData: validateLessonData
};
