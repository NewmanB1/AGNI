'use strict';

const fs   = require('fs');
const path = require('path');
const { createLogger } = require('@agni/utils/logger');
const { safeYamlLoad: safeYamlLoadUtil, DEFAULT_MAX_BYTES } = require('@agni/utils/yaml-safe');

const log = createLogger('compiler');

const buildHtml   = require('../builders/html');
const buildNative = require('../builders/native');
const inferFeatures = require('@agni/utils/feature-inference').inferFeatures;
const lessonSchema = require('@ols/schema/lesson-schema');
const compiler = require('../compiler/build-lesson-ir');
const buildLessonIR = compiler.buildLessonIR;
const buildLessonSidecar = compiler.buildLessonSidecar;

const DEFAULT_YAML_MAX_BYTES = DEFAULT_MAX_BYTES;

function safeYamlLoad(str, opts) {
  return safeYamlLoadUtil(str, opts);
}

async function buildIRWithSidecar(lessonData, options) {
  const ir = await buildLessonIR(lessonData, { dev: !!(options && options.dev) });
  const sidecar = buildLessonSidecar(ir);
  return { ir, sidecar };
}

function parseLessonFromString(rawYaml, opts) {
  opts = opts || {};
  if (rawYaml == null || typeof rawYaml !== 'string') {
    return { error: 'Raw YAML must be a string' };
  }
  try {
    let maxBytes = opts.maxBytes;
    if (maxBytes == null) {
      try {
        maxBytes = require('@agni/utils/env-config').yamlMaxBytes;
      } catch (_) {
        maxBytes = DEFAULT_YAML_MAX_BYTES;
      }
    }
    const lessonData = safeYamlLoad(rawYaml.trim(), { maxBytes: maxBytes });
    return { lessonData: lessonData };
  } catch (err) {
    return { error: (err && err.message) ? err.message : String(err) };
  }
}

function parseLessonYaml(inputPath) {
  const stat = fs.statSync(inputPath);
  let maxBytes;
  try {
    maxBytes = require('@agni/utils/env-config').yamlMaxBytes;
  } catch (_) {
    maxBytes = DEFAULT_YAML_MAX_BYTES;
  }
  if (stat.size > maxBytes) {
    throw new Error('YAML file exceeds max size (' + stat.size + ' > ' + maxBytes + ')');
  }
  const raw = fs.readFileSync(inputPath, 'utf8');
  const lessonData = safeYamlLoad(raw, { maxBytes: maxBytes });
  return { lessonData: lessonData, raw: raw };
}

function validateLessonStructure(lessonData) {
  lessonSchema.validateStructure(lessonData);
}

function maybeLogFeatureInference(lessonData, inputPath) {
  try {
    const result = inferFeatures(lessonData);
    const title  = (lessonData.meta && lessonData.meta.title) || 'Unnamed lesson';
    log.info('Feature inference: ' + title + ' (' + inputPath + ')', result);
    lessonData.inferredFeatures = result;
  } catch (err) {
    log.warn('Feature inference failed: ' + err.message);
  }
}

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
  safeYamlLoad,
  buildIRWithSidecar,
  parseLessonFromString,
  parseLessonYaml,
  validateLessonStructure,
  maybeLogFeatureInference,
  runCompilePipeline,
  compileLessonFromYamlFile
};
