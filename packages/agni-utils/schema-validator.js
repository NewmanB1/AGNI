'use strict';

/**
 * Shared Ajv schema validator factory.
 * Centralizes Ajv configuration and ajv-formats setup used across ols-schema, sentry, governance, and scripts.
 */

let Ajv;
let addFormatsFn;
try {
  Ajv = require('ajv');
  const formats = require('ajv-formats');
  addFormatsFn = typeof formats === 'function' ? formats : (formats.default || function () {});
} catch (e) {
  Ajv = null;
  addFormatsFn = null;
}

/**
 * Create a configured Ajv instance.
 *
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.strict=true] - Ajv strict mode
 * @param {boolean} [opts.allErrors=false] - Collect all validation errors
 * @param {boolean} [opts.addFormats=false] - Add ajv-formats (date, email, etc.)
 * @returns {object|null} Configured Ajv instance, or null if ajv not installed
 */
function createSchemaValidator(opts) {
  if (!Ajv) return null;
  opts = opts || {};
  const ajv = new Ajv({
    strict: opts.strict !== false,
    allErrors: opts.allErrors === true
  });
  if (opts.addFormats && addFormatsFn) {
    addFormatsFn(ajv);
  }
  return ajv;
}

module.exports = { createSchemaValidator, Ajv, addFormatsFn };
