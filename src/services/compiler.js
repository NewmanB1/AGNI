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

var fs   = require('fs');
var path = require('path');
var yaml = require('js-yaml');

var buildHtml   = require('../builders/html');
var buildNative = require('../builders/native');
var inferFeatures = require('../utils/featureInference').inferFeatures;
var lessonSchema = require('./lessonSchema');
var compiler = require('../compiler');
var buildLessonIR = compiler.buildLessonIR;
var buildLessonSidecar = compiler.buildLessonSidecar;

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
    var lessonData = yaml.load(rawYaml.trim(), { schema: yaml.JSON_SCHEMA });
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
  var raw = fs.readFileSync(inputPath, 'utf8');
  var lessonData = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
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
    var result = inferFeatures(lessonData);
    var title  = (lessonData.meta && lessonData.meta.title) || 'Unnamed lesson';
    console.log('\n[FEATURE INFERENCE] ' + title + ' (' + inputPath + ')');
    console.log(JSON.stringify(result, null, 2));
    // Preserve current CLI behaviour: attach result to lessonData for future
    // consumers, even though buildLessonIR runs its own inference.
    lessonData.inferredFeatures = result;
  } catch (err) {
    console.warn('[Warning] Feature inference failed: ' + err.message);
  }
}

/**
 * Compile from raw YAML string: parse → validate(schema + thresholds) → buildIR.
 * Pure pipeline: no file I/O; returns { ir, sidecar } or throws.
 * Use for author preview and tests. Caller is responsible for writing artifacts.
 *
 * @param  {string} rawYaml
 * @param  {object} options  { dev: boolean }
 * @returns {Promise<{ ir: object, sidecar: object }>}
 */
async function runCompilePipeline(rawYaml, options) {
  options = options || {};
  var parsed = parseLessonFromString(rawYaml);
  if (parsed.error) {
    throw new Error('Parse error: ' + parsed.error);
  }
  var lessonData = parsed.lessonData;
  var validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    throw new Error('Validation failed: ' + validation.errors.join('; '));
  }
  var ir = await buildLessonIR(lessonData, { dev: options.dev === true });
  var sidecar = buildLessonSidecar(ir);
  return { ir: ir, sidecar: sidecar };
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

  var parsed;
  try {
    parsed = parseLessonYaml(inputPath);
  } catch (err) {
    throw new Error('Error parsing YAML: ' + (err && err.message ? err.message : String(err)));
  }

  var lessonData = parsed.lessonData;

  var validation = lessonSchema.validateLessonData(lessonData);
  if (!validation.valid) {
    throw new Error('Validation failed: ' + validation.errors.join('; '));
  }
  if (validation.warnings && validation.warnings.length > 0) {
    validation.warnings.forEach(function (w) { console.warn('[Compiler]', w); });
  }

  if (options.dev) {
    console.log('⚠️  Developer mode enabled — not for distribution');
  }

  if (options.logFeatures) {
    maybeLogFeatureInference(lessonData, inputPath);
  }

  var format = options.format || 'html';

  if (format === 'html') {
    if (!options.output) {
      throw new Error('--output=<path> is required for HTML format.');
    }
    await buildHtml(lessonData, options);
  } else if (format === 'native') {
    if (!options.outputDir) {
      throw new Error('--output-dir=<path> is required for Native format.');
    }
    var ir = await buildLessonIR(lessonData, { dev: options.dev === true });
    var sidecar = buildLessonSidecar(ir);
    await buildNative(ir, options);
    fs.writeFileSync(
      path.join(options.outputDir, 'lesson-ir.json'),
      JSON.stringify(sidecar, null, 2)
    );
  } else if (format === 'yaml-packet') {
    if (!options.outputDir) {
      throw new Error('--output-dir=<path> is required for yaml-packet format.');
    }
    var buildYamlPacket = require('../builders/yaml-packet').buildYamlPacket;
    var ir = await buildLessonIR(lessonData, { dev: options.dev === true });
    var sidecar = buildLessonSidecar(ir);
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
  parseLessonFromString:   parseLessonFromString,
  parseLessonYaml:          parseLessonYaml,
  validateLessonStructure:  validateLessonStructure,
  maybeLogFeatureInference: maybeLogFeatureInference,
  runCompilePipeline:       runCompilePipeline,
  compileLessonFromYamlFile: compileLessonFromYamlFile
};

