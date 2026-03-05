/**
 * Node-side threshold syntax validator (same grammar as runtime threshold-evaluator.js).
 * Use from scripts/validate-all.js to verify hardware_trigger threshold strings
 * (e.g. "freefall > 0.2s", "accel.total > 2.5g") without loading the browser runtime.
 *
 * Grammar: condition (AND condition)*
 *   condition = sensorId op value | "steady" op duration "s" | "freefall" op duration "s"
 */

'use strict';

var TOKEN_RE = /\s*(>=|<=|==|!=|>|<|AND\b|[a-zA-Z_][\w.]*|-?[\d.]+g?|[()])\s*/g;

function tokenise(str) {
  var tokens = [];
  var m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(str)) !== null) {
    var tok = m[1].trim();
    if (tok) tokens.push(tok);
  }
  return tokens;
}

var ORIENTATION_VALUES = ['flat', 'portrait', 'landscape'];

function parseValue(tok) {
  if (!tok) throw new Error('Expected value, got end of input');
  if (/g$/i.test(tok)) return parseFloat(tok) * 9.81;
  if (ORIENTATION_VALUES.indexOf(tok) !== -1) return tok;
  var n = parseFloat(tok);
  if (isNaN(n)) throw new Error('Expected number or orientation (flat|portrait|landscape), got: ' + tok);
  return n;
}

function parseCondition(tokens, i) {
  var tok = tokens[i];
  if (!tok) throw new Error('Unexpected end of threshold string');

  if (tok === 'steady') {
    var op = tokens[i + 1];
    var durTok = tokens[i + 2] || '';
    var advance = 3;
    if (!/s$/i.test(durTok) && tokens[i + 3] === 's') advance = 4;
    var dur = parseFloat(durTok);
    if (!op || isNaN(dur)) throw new Error('Bad steady condition');
    return [{ type: 'steady', op: op, duration: dur }, i + advance];
  }

  if (tok === 'freefall') {
    var op2 = tokens[i + 1];
    var durTok2 = tokens[i + 2] || '';
    var advance2 = 3;
    if (!/s$/i.test(durTok2) && tokens[i + 3] === 's') advance2 = 4;
    var dur2 = parseFloat(durTok2);
    if (!op2 || isNaN(dur2)) throw new Error('Bad freefall condition');
    return [{ type: 'freefall', op: op2, duration: dur2 }, i + advance2];
  }

  if (/^[a-zA-Z_][\w.]*$/.test(tok)) {
    var sensorId = tok;
    var op3 = tokens[i + 1];
    var valTok = tokens[i + 2];
    if (!op3 || !valTok) throw new Error('Incomplete condition for: ' + sensorId);
    var parsedVal = parseValue(valTok);
    return [{ type: 'sensor', sensorId: sensorId, op: op3, value: parsedVal }, i + 3];
  }

  throw new Error('Unexpected token: ' + tok);
}

function parse(tokens) {
  if (tokens.length === 0) throw new Error('Empty threshold string');
  var result = parseCondition(tokens, 0);
  var node = result[0];
  var i = result[1];
  while (i < tokens.length) {
    if (tokens[i] !== 'AND') throw new Error('Expected AND, got: ' + tokens[i]);
    var right = parseCondition(tokens, i + 1);
    node = { type: 'and', left: node, right: right[0] };
    i = right[1];
  }
  return node;
}

/**
 * Validate a threshold string (e.g. "freefall > 0.2s", "accel.total > 2.5g").
 * @param {string} thresholdStr
 * @returns {{ valid: boolean, error?: string, description?: string }}
 */
function validateThresholdSyntax(thresholdStr) {
  try {
    var trimmed = (thresholdStr || '').trim();
    if (!trimmed) return { valid: false, error: 'Empty threshold' };
    var tokens = tokenise(trimmed);
    parse(tokens);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = {
  validateThresholdSyntax: validateThresholdSyntax,
  tokenise: tokenise,
  parse: parse
};
