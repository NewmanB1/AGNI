'use strict';

// Load governance policy from a JSON file.
// Policy is data-driven so authorities can change rules without code edits.
//
// Expected shape: {
//   utuTargets?: Array<{ class: string, band: number }>,
//   allowedTeachingModes?: string[],
//   minDifficulty?: number,
//   maxDifficulty?: number,
//   requireUtu?: boolean,
//   requireTeachingMode?: boolean
// }

var fs = require('fs');

/**
 * Load policy from a JSON file. Returns empty policy (no restrictions) if file missing or invalid.
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
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[GOVERNANCE] Failed to load policy from', filePath, ':', err.message);
    return {};
  }
}

module.exports = {
  loadPolicy: loadPolicy
};
