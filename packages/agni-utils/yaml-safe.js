'use strict';

/**
 * Safe YAML loading for untrusted/semi-trusted OLS lesson files.
 * Mitigates: anchor/alias DoS, prototype pollution (via JSON_SCHEMA), custom tags/functions.
 *
 * OLS lessons must not use YAML anchors or aliases. See docs/ARCHITECTURE.md.
 */
var yaml = require('js-yaml');

// Prevent anchor/alias DoS (billion laughs).
// Anchors: &id at line-start only (block) or after [ { , (flow).
// Aliases: *id after [ or , followed by structural char — excludes Markdown *italic*.
var UNSAFE_ANCHOR = /(?:^[\s]*|[\n\[,])\s*&[a-zA-Z0-9_-]+/m;
var UNSAFE_ALIAS = /[\[,]\s*\*[a-zA-Z0-9_-]+(?=[\s,\]}\n]|$)/;

var DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
var DEFAULT_MAX_DEPTH = 50;
var DEFAULT_MAX_KEYS = 10000;
var DEFAULT_MAX_STEPS = 500;

function depthOf(obj, depth, maxDepth, maxKeys) {
  if (depth > maxDepth) return true;
  if (obj === null || typeof obj !== 'object') return false;
  var keys = Object.keys(obj);
  if (keys.length > maxKeys) return true;
  for (var i = 0; i < keys.length; i++) {
    if (depthOf(obj[keys[i]], depth + 1, maxDepth, maxKeys)) return true;
  }
  return false;
}

/**
 * Safe YAML load: JSON_SCHEMA (no custom tags/functions), max size, no anchors/aliases,
 * max depth (DoS), max keys (explosion).
 * @param {string} str - Raw YAML string
 * @param {{ maxBytes?: number, maxDepth?: number, maxKeys?: number, maxSteps?: number }} [opts]
 * @returns {object} Parsed object
 * @throws {Error} If limits exceeded, anchors/aliases present, or parse fails
 */
function safeYamlLoad(str, opts) {
  opts = opts || {};
  var maxBytes = (opts.maxBytes != null) ? opts.maxBytes : DEFAULT_MAX_BYTES;
  var maxDepth = (opts.maxDepth != null) ? opts.maxDepth : DEFAULT_MAX_DEPTH;
  var maxKeys = (opts.maxKeys != null) ? opts.maxKeys : DEFAULT_MAX_KEYS;
  var maxSteps = (opts.maxSteps != null) ? opts.maxSteps : DEFAULT_MAX_STEPS;
  if (str.length > maxBytes) {
    throw new Error('YAML exceeds max size (' + str.length + ' > ' + maxBytes + ')');
  }
  var anchorHit = UNSAFE_ANCHOR.test(str);
  var aliasHit = UNSAFE_ALIAS.test(str);
  if (anchorHit || aliasHit) {
    throw new Error('YAML anchors/aliases are not allowed (DoS risk)');
  }
  var loadOpts = { schema: yaml.JSON_SCHEMA, maxAliasCount: 50 };
  var parsed = yaml.load(str, loadOpts);
  if (depthOf(parsed, 0, maxDepth, maxKeys)) {
    throw new Error('YAML nesting or key count exceeds safe limits (DoS risk)');
  }
  var steps = parsed && parsed.steps;
  if (Array.isArray(steps) && steps.length > maxSteps) {
    throw new Error('YAML steps count exceeds max (' + steps.length + ' > ' + maxSteps + ')');
  }
  if (parsed && typeof parsed.steps === 'object' && !Array.isArray(parsed.steps)) {
    var stepKeys = Object.keys(parsed.steps);
    if (stepKeys.length > maxSteps) {
      throw new Error('YAML steps count exceeds max (' + stepKeys.length + ' > ' + maxSteps + ')');
    }
  }
  return parsed;
}

module.exports = {
  safeYamlLoad: safeYamlLoad,
  DEFAULT_MAX_BYTES: DEFAULT_MAX_BYTES,
  DEFAULT_MAX_DEPTH: DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_KEYS: DEFAULT_MAX_KEYS,
  DEFAULT_MAX_STEPS: DEFAULT_MAX_STEPS
};
