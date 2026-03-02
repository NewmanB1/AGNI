'use strict';

/**
 * Generic schema-validated JSON file store.
 * Encapsulates the Ajv optional-require, schema compilation, validate-on-load,
 * validate-on-save, mkdir-on-save, and fallback-on-error patterns shared by
 * policy.js and catalog.js.
 */

const fs = require('fs');
const path = require('path');

let Ajv;
try {
  Ajv = require('ajv');
} catch (e) {
  Ajv = null;
}

/**
 * Create a schema-backed JSON store.
 *
 * @param {object} opts
 * @param {string}  opts.schemaPath    Absolute path to a JSON Schema file
 * @param {*}       opts.defaults      Default value returned when file is missing or invalid
 * @param {object}  opts.log           Logger instance (must have .warn())
 * @param {function} [opts.preValidate] Optional check before Ajv (e.g. type guard); return { valid, errors }
 * @returns {{ validate: function, load: function, save: function }}
 */
function createSchemaStore({ schemaPath, defaults, log, preValidate }) {
  let compiledValidator = null;
  if (Ajv && fs.existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      compiledValidator = new Ajv().compile(schema);
    } catch (err) {
      compiledValidator = null;
    }
  }

  function validate(data) {
    if (preValidate) {
      const pre = preValidate(data);
      if (!pre.valid) return pre;
    }
    if (!compiledValidator) return { valid: true, errors: [] };
    const ok = compiledValidator(data);
    const errors = [];
    if (!ok && compiledValidator.errors) {
      compiledValidator.errors.forEach(function (err) {
        errors.push((err.instancePath || '') + ' ' + (err.message || ''));
      });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function load(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return defaults;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const result = validate(data);
      if (!result.valid) {
        log.warn('File failed schema validation', { filePath, errors: result.errors });
        return defaults;
      }
      return data;
    } catch (err) {
      log.warn('Failed to load file', { filePath, error: err.message });
      return defaults;
    }
  }

  function save(data, filePath) {
    const result = validate(data);
    if (!result.valid) {
      return { ok: false, error: 'Validation failed: ' + result.errors.join('; ') };
    }
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { validate, load, save };
}

module.exports = { createSchemaStore };
