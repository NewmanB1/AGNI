'use strict';

/**
 * Safe YAML loading for untrusted/semi-trusted OLS lesson files.
 * Mitigates: anchor/alias DoS, prototype pollution (via JSON_SCHEMA), custom tags/functions.
 *
 * OLS lessons must not use YAML anchors or aliases. See docs/ARCHITECTURE.md.
 */
const yaml = require('js-yaml');

// Prevent anchor/alias DoS (billion laughs).
// Anchors: &id at line-start only (block) or after [ { , (flow).
// Aliases: *id after [ or , followed by structural char — excludes Markdown *italic*.
const UNSAFE_ANCHOR = /(?:^[\s]*|[\n[,])\s*&[a-zA-Z0-9_-]+/m;
const UNSAFE_ALIAS = /[[,]\s*\*[a-zA-Z0-9_-]+(?=[\s,\]}\n]|$)/;

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 50;
const DEFAULT_MAX_KEYS = 10000;
const DEFAULT_MAX_STEPS = 500;

const UNSAFE_KEYS = { '__proto__': 1, constructor: 1, prototype: 1 };

function hasUnsafeKeys(obj, depth, maxDepth) {
  if (depth > maxDepth) return false;
  if (obj === null || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    if (UNSAFE_KEYS[keys[i]]) return true;
    if (hasUnsafeKeys(obj[keys[i]], depth + 1, maxDepth)) return true;
  }
  return false;
}

function depthOf(obj, depth, maxDepth, maxKeys) {
  if (depth > maxDepth) return true;
  if (obj === null || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  if (keys.length > maxKeys) return true;
  for (let i = 0; i < keys.length; i++) {
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
  const maxBytes = (opts.maxBytes != null) ? opts.maxBytes : DEFAULT_MAX_BYTES;
  const maxDepth = (opts.maxDepth != null) ? opts.maxDepth : DEFAULT_MAX_DEPTH;
  const maxKeys = (opts.maxKeys != null) ? opts.maxKeys : DEFAULT_MAX_KEYS;
  const maxSteps = (opts.maxSteps != null) ? opts.maxSteps : DEFAULT_MAX_STEPS;
  const byteLen = (typeof Buffer !== 'undefined') ? Buffer.byteLength(str, 'utf8') : str.length;
  if (byteLen > maxBytes) {
    throw new Error('YAML exceeds max size (' + byteLen + ' > ' + maxBytes + ')');
  }
  const anchorHit = (str.indexOf('&') !== -1) ? UNSAFE_ANCHOR.test(str) : false;
  const aliasHit = (str.indexOf('*') !== -1) ? UNSAFE_ALIAS.test(str) : false;
  if (anchorHit || aliasHit) {
    throw new Error('YAML anchors/aliases are not allowed (DoS risk)');
  }
  const loadOpts = { schema: yaml.JSON_SCHEMA, maxAliasCount: 50 };
  let parsed;
  try {
    parsed = yaml.load(str, loadOpts);
  } catch (e) {
    throw new Error('YAML parse failed: ' + (e.message || String(e)));
  }
  if (parsed && hasUnsafeKeys(parsed, 0, maxDepth)) {
    throw new Error('YAML contains disallowed keys (__proto__, constructor, prototype)');
  }
  if (depthOf(parsed, 0, maxDepth, maxKeys)) {
    throw new Error('YAML nesting or key count exceeds safe limits (DoS risk)');
  }
  const steps = parsed && parsed.steps;
  if (Array.isArray(steps) && steps.length > maxSteps) {
    throw new Error('YAML steps count exceeds max (' + steps.length + ' > ' + maxSteps + ')');
  }
  if (parsed && typeof parsed.steps === 'object' && !Array.isArray(parsed.steps)) {
    const stepKeys = Object.keys(parsed.steps);
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
