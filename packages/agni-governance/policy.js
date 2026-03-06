'use strict';

// Load governance policy from a JSON file.
// Policy is data-driven so authorities can change rules without code edits.
// Phase 2 / Sprint L: validate against schemas/governance-policy.schema.json when loading.
//
// Expected shape: see schemas/governance-policy.schema.json

const { createSchemaStore } = require('./schema-store');
const envConfig = require('@agni/utils/env-config');
const log = require('@agni/utils/logger').createLogger('governance');

const store = createSchemaStore({
  schemaPath: envConfig.governancePolicySchema,
  defaults: {},
  log,
  preValidate: function (policy) {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      return { valid: false, errors: ['Policy must be a non-null object'] };
    }
    return { valid: true, errors: [] };
  }
});

function validatePolicy(policy) {
  return store.validate(policy);
}

function loadPolicy(filePath) {
  return store.load(filePath);
}

function savePolicy(policy, filePath) {
  const p = filePath || envConfig.governancePolicy;
  return store.save(policy, p);
}

module.exports = {
  loadPolicy: loadPolicy,
  savePolicy: savePolicy,
  validatePolicy: validatePolicy
};
