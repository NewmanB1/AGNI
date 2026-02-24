'use strict';

// High-level compiler services.
// These functions provide a small, top-down API for:
//   - Reading and validating OLS YAML files
//   - Running feature inference (optional logging)
//   - Dispatching to the appropriate builder (HTML or Native)
//
// They are used by the CLI today and are intended to be reused by
// future authoring tools and HTTP endpoints.

var fs   = require('fs');
var path = require('path');
var yaml = require('js-yaml');

var buildHtml   = require('../builders/html');
var buildNative = require('../builders/native');
var inferFeatures = require('../utils/featureInference').inferFeatures;

/**
 * Read and parse an OLS lesson YAML file from disk.
 *
 * @param  {string} inputPath
 * @returns {{ lessonData: object, raw: string }}
 */
function parseLessonYaml(inputPath) {
  var raw = fs.readFileSync(inputPath, 'utf8');
  var lessonData = yaml.load(raw);
  return { lessonData: lessonData, raw: raw };
}

/**
 * Basic structural validation shared by CLI and services.
 * Throws on invalid structure.
 *
 * @param {object} lessonData
 */
function validateLessonStructure(lessonData) {
  if (!lessonData || !lessonData.meta || !lessonData.steps) {
    throw new Error('Invalid OLS file. Must contain "meta" and "steps" fields.');
  }
  if (!Array.isArray(lessonData.steps)) {
    throw new Error('"steps" must be a YAML array (each item prefixed with "-").');
  }
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
 * Compile a lesson from a YAML file path, performing:
 *   - YAML parse
 *   - basic structural validation
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

  validateLessonStructure(lessonData);

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
    await buildNative(lessonData, options);
  } else {
    throw new Error('Unknown format "' + format + '". Use "html" or "native".');
  }
}

module.exports = {
  parseLessonYaml:          parseLessonYaml,
  validateLessonStructure:  validateLessonStructure,
  maybeLogFeatureInference: maybeLogFeatureInference,
  compileLessonFromYamlFile: compileLessonFromYamlFile
};

