'use strict';

// Load governance policy from a JSON file.
// Policy is data-driven so authorities can change rules without code edits.
// Phase 2 / Sprint L: validate against schemas/governance-policy.schema.json when loading.
//
// Expected shape: see schemas/governance-policy.schema.json

var fs = require('fs');
var path = require('path');
var log = require('../utils/logger').createLogger('governance');

var schemaPath = path.join(__dirname, '../../schemas', 'governance-policy.schema.json');
var Ajv;
try {
  Ajv = require('ajv');
} catch (e) {
  Ajv = null;
}

var validatePolicySchema = null;
if (Ajv && fs.existsSync(schemaPath)) {
  try {
    var schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    validatePolicySchema = new Ajv().compile(schema);
  } catch (err) {
    validatePolicySchema = null;
  }
}

/**
 * Validate policy object against governance-policy schema.
 * Pure: (policy) → { valid: boolean, errors: string[] }.
 *
 * @param  {object} policy
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    return { valid: true, errors: [] };
  }
  if (!validatePolicySchema) {
    return { valid: true, errors: [] };
  }
  var ok = validatePolicySchema(policy);
  var errors = [];
  if (!ok && validatePolicySchema.errors) {
    validatePolicySchema.errors.forEach(function (err) {
      errors.push((err.instancePath || '') + ' ' + (err.message || ''));
    });
  }
  return { valid: errors.length === 0, errors: errors };
}

/**
 * Load policy from a JSON file. Returns empty policy (no restrictions) if file missing or invalid.
 * When a file exists, validates against governance-policy.schema.json; invalid content logs a warning and returns {}.
 *
 * @param  {string} filePath
 * @returns {object}
 */
function loadPolicy(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  try {
    var raw = fs.readFileSync(filePath, 'utf8');
    var policy = JSON.parse(raw);
    var result = validatePolicy(policy);
    if (!result.valid) {
      log.warn('Policy file failed schema validation', { errors: result.errors });
      return {};
    }
    return policy;
  } catch (err) {
    log.warn('Failed to load policy', { filePath, error: err.message });
    return {};
  }
}

/**
 * Save policy to a JSON file. Validates against schema before writing.
 *
 * @param  {object} policy
 * @param  {string} [filePath]
 * @returns {{ ok: boolean, error?: string }}
 */
function savePolicy(policy, filePath) {
  var p = filePath || (process.env.AGNI_GOVERNANCE_POLICY || path.join(__dirname, '../../data', 'governance_policy.json'));
  var result = validatePolicy(policy);
  if (!result.valid) {
    return { ok: false, error: 'Policy validation failed: ' + result.errors.join('; ') };
  }
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(policy, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  loadPolicy: loadPolicy,
  savePolicy: savePolicy,
  validatePolicy: validatePolicy
};
