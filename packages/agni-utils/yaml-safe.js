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

/**
 * Safe YAML load: JSON_SCHEMA (no custom tags/functions), max size, no anchors/aliases.
 * @param {string} str - Raw YAML string
 * @param {{ maxBytes?: number }} [opts] - Optional: maxBytes (default 2MB)
 * @returns {object} Parsed object
 * @throws {Error} If size exceeded, anchors/aliases present, or parse fails
 */
function safeYamlLoad(str, opts) {
  opts = opts || {};
  var maxBytes = (opts.maxBytes != null) ? opts.maxBytes : DEFAULT_MAX_BYTES;
  if (str.length > maxBytes) {
    throw new Error('YAML exceeds max size (' + str.length + ' > ' + maxBytes + ')');
  }
  var anchorHit = UNSAFE_ANCHOR.test(str);
  var aliasHit = UNSAFE_ALIAS.test(str);
  if (anchorHit || aliasHit) {
    throw new Error('YAML anchors/aliases are not allowed (DoS risk)');
  }
  var loadOpts = { schema: yaml.JSON_SCHEMA, maxAliasCount: 50 };
  return yaml.load(str, loadOpts);
}

module.exports = {
  safeYamlLoad: safeYamlLoad,
  DEFAULT_MAX_BYTES: DEFAULT_MAX_BYTES
};
