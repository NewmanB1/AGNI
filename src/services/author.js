'use strict';

/**
 * Authoring API service: validate and preview lesson payloads (YAML or JSON).
 * Used by POST /api/author/validate and POST /api/author/preview on the hub.
 * Phase 2 / Sprint K: uses shared lessonSchema so validation matches CLI and hub-transform.
 */

var yaml = require('js-yaml');
var compiler = require('../compiler');
var buildLessonIR = compiler.buildLessonIR;
var buildLessonSidecar = compiler.buildLessonSidecar;
var lessonSchema = require('./lessonSchema');

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
 * Run schema + structure + threshold validation (shared with CLI and hub).
 * @param {object} lessonData
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateForAuthor(lessonData) {
  return lessonSchema.validateLessonData(lessonData);
}

/**
 * Build IR and sidecar for preview (no disk write).
 * Validates with shared schema before buildIR.
 * @param {object} lessonData  parsed lesson
 * @returns {Promise<{ ir: object, sidecar: object }|{ error: string }>}
 */
async function previewForAuthor(lessonData) {
  if (!lessonData || typeof lessonData !== 'object') {
    return { error: 'Invalid payload: must be an object' };
  }
  var validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    return { error: 'Validation failed: ' + validation.errors.join('; ') };
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
