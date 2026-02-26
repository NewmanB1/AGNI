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
 * Full validation: structure (throws) + schema + thresholds.
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
  validateLessonData: validateLessonData
};
