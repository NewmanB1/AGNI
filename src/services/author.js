'use strict';

/**
 * Authoring API service: validate and preview lesson payloads (YAML or JSON).
 * Used by POST /api/author/validate and POST /api/author/preview on the hub.
 */

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var compiler = require('../compiler');
var buildLessonIR = compiler.buildLessonIR;
var buildLessonSidecar = compiler.buildLessonSidecar;
var validateLessonStructure = require('./compiler').validateLessonStructure;
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
 * Parse request body: YAML string or JSON string or object.
 * @param {string|object} body
 * @returns {{ lessonData: object }|{ error: string }}
 */
function parseAuthorBody(body) {
  if (body == null || body === '') {
    return { error: 'Request body is required' };
  }
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    return { lessonData: body };
  }
  var str = typeof body === 'string' ? body : String(body);
  str = str.trim();
  if (str.charAt(0) === '{') {
    try {
      return { lessonData: JSON.parse(str) };
    } catch (e) {
      return { error: 'Invalid JSON: ' + e.message };
    }
  }
  try {
    return { lessonData: yaml.load(str) };
  } catch (e) {
    return { error: 'Invalid YAML: ' + e.message };
  }
}

/**
 * Run schema + structure + threshold validation.
 * @param {object} lessonData
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateForAuthor(lessonData) {
  var errors = [];
  var warnings = [];

  if (!lessonData || typeof lessonData !== 'object') {
    return { valid: false, errors: ['Invalid payload: must be an object'], warnings: [] };
  }

  try {
    validateLessonStructure(lessonData);
  } catch (e) {
    errors.push(e.message);
    return { valid: false, errors: errors, warnings: warnings };
  }

  if (validateSchema) {
    var schemaValid = validateSchema(lessonData);
    if (!schemaValid && validateSchema.errors) {
      validateSchema.errors.forEach(function (err) {
        errors.push(((err.instancePath || '') + ' ' + (err.message || '')).trim());
      });
    }
  } else {
    warnings.push('Schema validation skipped (ajv not available)');
  }

  var steps = lessonData.steps || [];
  steps.forEach(function (step, idx) {
    if (step.type === 'hardware_trigger' && step.threshold) {
      var result = validateThresholdSyntax(step.threshold);
      if (!result.valid) {
        errors.push('step ' + (idx + 1) + ' (' + (step.id || '?') + '): threshold "' + step.threshold + '" — ' + result.error);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

/**
 * Build IR and sidecar for preview (no disk write).
 * @param {object} lessonData  parsed lesson
 * @returns {Promise<{ ir: object, sidecar: object }|{ error: string }>}
 */
async function previewForAuthor(lessonData) {
  if (!lessonData || typeof lessonData !== 'object') {
    return { error: 'Invalid payload: must be an object' };
  }
  try {
    validateLessonStructure(lessonData);
  } catch (e) {
    return { error: e.message };
  }
  try {
    var ir = await buildLessonIR(lessonData, { dev: true });
    var sidecar = buildLessonSidecar(ir);
    return { ir: ir, sidecar: sidecar };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  parseAuthorBody: parseAuthorBody,
  validateForAuthor: validateForAuthor,
  previewForAuthor: previewForAuthor
};
