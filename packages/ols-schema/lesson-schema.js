'use strict';

/**
 * Shared OLS lesson schema validation — single source for CLI, hub-transform, and author API.
 * Phase 2 / Sprint K: every lesson path validates with the same schema before business logic.
 */

const path = require('path');
const fs = require('fs');
const validateThresholdSyntax = require('./threshold-syntax').validateThresholdSyntax;

const schemaPath = path.join(__dirname, '../../schemas', 'ols.schema.json');
const utuConstantsPath = path.join(__dirname, '../../data', 'utu-constants.json');
let Ajv;
let ajvFormats;
try {
  Ajv = require('ajv');
  ajvFormats = require('ajv-formats');
} catch (e) {
  Ajv = null;
}

let _canonicalSpineIds = null;
function getCanonicalSpineIds() {
  if (_canonicalSpineIds) return _canonicalSpineIds;
  try {
    if (fs.existsSync(utuConstantsPath)) {
      const data = JSON.parse(fs.readFileSync(utuConstantsPath, 'utf8'));
      _canonicalSpineIds = data.spineIds || [];
    }
  } catch (e) { /* ignore — validation will skip spine check */ }
  return _canonicalSpineIds || [];
}

let validateSchema = null;
if (Ajv && fs.existsSync(schemaPath)) {
  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true });
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
  const errors = [];
  if (!lessonData || typeof lessonData !== 'object') {
    return { valid: false, errors: ['Lesson data must be an object'] };
  }
  if (!validateSchema) {
    return {
      valid: false,
      errors: ['Schema validation unavailable. Install dependencies: npm install ajv ajv-formats']
    };
  }
  const ok = validateSchema(lessonData);
  if (!ok && validateSchema.errors) {
    validateSchema.errors.forEach(function (err) {
      const msg = (err.instancePath || err.params?.missingProperty || '') + ' ' + (err.message || '');
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
  const errors = [];
  const steps = lessonData && lessonData.steps;
  if (!Array.isArray(steps)) return { valid: true, errors: [] };
  steps.forEach(function (step, idx) {
    if (step.type === 'hardware_trigger' && step.threshold) {
      const result = validateThresholdSyntax(step.threshold);
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
  const errors = [];
  const warnings = [];
  const steps = lessonData && lessonData.steps;
  if (!Array.isArray(steps)) return { errors: errors, warnings: warnings };

  const ids = {};
  steps.forEach(function (step, idx) {
    if (step.id) {
      if (ids[step.id] !== undefined) {
        errors.push('Duplicate step ID "' + step.id + '" at steps ' + (ids[step.id] + 1) + ' and ' + (idx + 1));
      }
      ids[step.id] = idx;
    }
  });

  steps.forEach(function (step, idx) {
    const label = 'step ' + (idx + 1) + ' (' + (step.id || '?') + ')';

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
      const ref = val.replace(/^redirect:|^skip_to:|^ols:/i, '').trim();
      if (ref && ids[ref] === undefined && ref !== 'skip' && ref !== 'hint') {
        warnings.push(label + ': ' + fieldName + ' references unknown step ID "' + ref + '"');
      }
    }
    checkStepRef('on_fail', step.on_fail);
    checkStepRef('on_success', step.on_success);
  });

  const meta = lessonData.meta || {};
  if (meta.is_group != null && typeof meta.is_group !== 'boolean') {
    warnings.push('meta.is_group should be a boolean (true / false)');
  }
  if (!meta.description && !lessonData.description) {
    warnings.push('Missing description (recommended for discoverability)');
  }
  if (!meta.time_required && !lessonData.time_required) {
    warnings.push('Missing time_required (helps students plan)');
  }
  const ont = lessonData.ontology || {};
  if ((!ont.provides || ont.provides.length === 0) && (!ont.requires || ont.requires.length === 0)) {
    warnings.push('No ontology skills defined (limits adaptive recommendations)');
  }

  // UTU coordinate validation
  const utu = meta.utu;
  if (utu && typeof utu === 'object') {
    const spineId = utu.spineId || utu.class;
    if (spineId) {
      const canonical = getCanonicalSpineIds();
      if (canonical.length > 0 && canonical.indexOf(spineId) === -1) {
        warnings.push('meta.utu Spine ID "' + spineId + '" is not in canonical list (' + canonical.slice(0, 5).join(', ') + '…). Check docs/specs/utu-architecture.md');
      }
    }
    if (typeof utu.band === 'number' && (utu.band < 1 || utu.band > 6)) {
      errors.push('meta.utu.band must be 1–6 (got ' + utu.band + ')');
    }
    if (typeof utu.protocol === 'number' && (utu.protocol < 1 || utu.protocol > 5)) {
      errors.push('meta.utu.protocol must be 1–5 (got ' + utu.protocol + ')');
    }
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
  let errors = [];
  let warnings = [];

  if (!lessonData || typeof lessonData !== 'object') {
    return { valid: false, errors: ['Lesson data must be an object'], warnings: [] };
  }

  try {
    validateStructure(lessonData);
  } catch (e) {
    return { valid: false, errors: [e.message], warnings: [] };
  }

  const schemaResult = validateWithSchema(lessonData);
  if (!schemaResult.valid) {
    errors = errors.concat(schemaResult.errors);
  }

  const thresholdResult = validateThresholds(lessonData);
  if (!thresholdResult.valid) {
    errors = errors.concat(thresholdResult.errors);
  }

  const semanticResult = validateSemantics(lessonData);
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
