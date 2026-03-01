'use strict';

// High-level compiler services.
// These functions provide a small, top-down API for:
//   - Reading and validating OLS YAML files
//   - Running feature inference (optional logging)
//   - Dispatching to the appropriate builder (HTML or Native)
//
// Phase 2 / Sprint K: Every path validates with the same OLS schema before
// business logic. Pure pipeline: parse → validate → buildIR → buildArtifact.
// I/O (file read/write) is at the edges; runCompilePipeline(rawYaml) is pure
// except for Markdown processor init.

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { createLogger } = require('../utils/logger');

const log = createLogger('compiler');

const buildHtml   = require('../builders/html');
const buildNative = require('../builders/native');
const inferFeatures = require('../utils/feature-inference').inferFeatures;
const lessonSchema = require('./lesson-schema');
const compiler = require('../compiler');
const buildLessonIR = compiler.buildLessonIR;
const buildLessonSidecar = compiler.buildLessonSidecar;

/**
 * Parse a YAML string using the OLS-standard JSON_SCHEMA option.
 * @param {string} str
 * @returns {object}
 */
function safeYamlLoad(str) {
  return yaml.load(str, { schema: yaml.JSON_SCHEMA });
}

/**
 * Build IR and sidecar from already-validated lesson data.
 * Callers are responsible for validation before calling this.
 *
 * @param  {object} lessonData
 * @param  {{ dev?: boolean }} [options]
 * @returns {Promise<{ ir: object, sidecar: object }>}
 */
async function buildIRWithSidecar(lessonData, options) {
  const ir = await buildLessonIR(lessonData, { dev: !!(options && options.dev) });
  const sidecar = buildLessonSidecar(ir);
  return { ir, sidecar };
}

/**
 * Parse raw YAML string to lesson data. Pure: no I/O.
 *
 * @param  {string} rawYaml
 * @returns {{ lessonData: object }|{ error: string }}
 */
function parseLessonFromString(rawYaml) {
  if (rawYaml == null || typeof rawYaml !== 'string') {
    return { error: 'Raw YAML must be a string' };
  }
  try {
    const lessonData = safeYamlLoad(rawYaml.trim());
    return { lessonData: lessonData };
  } catch (err) {
    return { error: (err && err.message) ? err.message : String(err) };
  }
}

/**
 * Read and parse an OLS lesson YAML file from disk.
 *
 * @param  {string} inputPath
 * @returns {{ lessonData: object, raw: string }}
 */
function parseLessonYaml(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const lessonData = safeYamlLoad(raw);
  return { lessonData: lessonData, raw: raw };
}

/**
 * Basic structural validation shared by CLI and services.
 * Throws on invalid structure.
 *
 * @param {object} lessonData
 */
function validateLessonStructure(lessonData) {
  lessonSchema.validateStructure(lessonData);
}

/**
 * Optionally run feature inference for logging/inspection.
 * Mirrors the CLI behaviour: logs to stdout but does not fail the build
 * if inference throws.
 *
 * @param {object} lessonData
 * @param {string} inputPath
 */
function maybeLogFeatureInference(lessonData, inputPath) {
  try {
    const result = inferFeatures(lessonData);
    const title  = (lessonData.meta && lessonData.meta.title) || 'Unnamed lesson';
    log.info('Feature inference: ' + title + ' (' + inputPath + ')', result);
    // Preserve current CLI behaviour: attach result to lessonData for future
    // consumers, even though buildLessonIR runs its own inference.
    lessonData.inferredFeatures = result;
  } catch (err) {
    log.warn('Feature inference failed: ' + err.message);
  }
}

/**
 * Compile from raw YAML string: parse → validate(schema + thresholds) → buildIR.
 * Pure pipeline: no file I/O. Returns { ir, sidecar } on success or { error }
 * on failure (consistent with other service-layer functions).
 *
 * @param  {string} rawYaml
 * @param  {object} options  { dev: boolean }
 * @returns {Promise<{ ir: object, sidecar: object }|{ error: string }>}
 */
async function runCompilePipeline(rawYaml, options) {
  options = options || {};
  const parsed = parseLessonFromString(rawYaml);
  if (parsed.error) {
    return { error: 'Parse error: ' + parsed.error };
  }
  const lessonData = parsed.lessonData;
  const validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    return { error: 'Validation failed: ' + validation.errors.join('; ') };
  }
  try {
    return await buildIRWithSidecar(lessonData, { dev: options.dev });
  } catch (err) {
    return { error: (err && err.message) ? err.message : String(err) };
  }
}

/**
 * Compile a lesson from a YAML file path, performing:
 *   - YAML parse
 *   - schema + structure + threshold validation (same as author API and hub)
 *   - optional feature inference logging
 *   - dispatch to the selected builder
 *
 * This function is used by the CLI but can also be reused by
 * authoring/preview services.
 *
 * @param  {string} inputPath
 * @param  {object} options  { format, output, outputDir, deviceId, privateKey, publicKey, dev, logFeatures }
 * @returns {Promise<void>}
 */
async function compileLessonFromYamlFile(inputPath, options) {
  options = options || {};

  let parsed;
  try {
    parsed = parseLessonYaml(inputPath);
  } catch (err) {
    throw new Error('Error parsing YAML: ' + (err && err.message ? err.message : String(err)));
  }

  const lessonData = parsed.lessonData;

  const validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    throw new Error('Validation failed: ' + validation.errors.join('; '));
  }
  if (validation.warnings && validation.warnings.length > 0) {
    validation.warnings.forEach(function (w) { log.warn(w); });
  }

  if (options.dev) {
    log.warn('Developer mode enabled — not for distribution');
  }

  if (options.logFeatures) {
    maybeLogFeatureInference(lessonData, inputPath);
  }

  const format = options.format || 'html';

  if (format === 'html') {
    if (!options.output) {
      throw new Error('--output=<path> is required for HTML format.');
    }
    await buildHtml(lessonData, options);
  } else if (format === 'native') {
    if (!options.outputDir) {
      throw new Error('--output-dir=<path> is required for Native format.');
    }
    const { ir, sidecar } = await buildIRWithSidecar(lessonData, { dev: options.dev });
    await buildNative(ir, options);
    fs.writeFileSync(
      path.join(options.outputDir, 'lesson-ir.json'),
      JSON.stringify(sidecar, null, 2)
    );
  } else if (format === 'yaml-packet') {
    if (!options.outputDir) {
      throw new Error('--output-dir=<path> is required for yaml-packet format.');
    }
    const buildYamlPacket = require('../builders/yaml-packet').buildYamlPacket;
    const { ir, sidecar } = await buildIRWithSidecar(lessonData, { dev: options.dev });
    await buildYamlPacket(parsed.raw, ir, sidecar, options);
    fs.writeFileSync(
      path.join(options.outputDir, 'lesson-ir.json'),
      JSON.stringify(sidecar, null, 2)
    );
  } else {
    throw new Error('Unknown format "' + format + '". Use "html", "native", or "yaml-packet".');
  }
}

module.exports = {
  safeYamlLoad:             safeYamlLoad,
  buildIRWithSidecar:       buildIRWithSidecar,
  parseLessonFromString:    parseLessonFromString,
  parseLessonYaml:          parseLessonYaml,
  validateLessonStructure:  validateLessonStructure,
  maybeLogFeatureInference: maybeLogFeatureInference,
  runCompilePipeline:       runCompilePipeline,
  compileLessonFromYamlFile: compileLessonFromYamlFile
};

