/**
 * Node-side threshold syntax validator (same grammar as runtime threshold-evaluator.js).
 * Use from scripts/validate-all.js to verify hardware_trigger threshold strings
 * (e.g. "freefall > 0.2s", "accel.total > 2.5g") without loading the browser runtime.
 *
 * Grammar: condition (AND condition)*
 *   condition = sensorId op value | "steady" op duration "s" | "freefall" op duration "s"
 */

'use strict';

const TOKEN_RE = /\s*(>=|<=|==|!=|>|<|AND\b|[a-zA-Z_][\w.]*|-?[\d.]+g?|[()])\s*/g;

function tokenise(str) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(str)) !== null) {
    const tok = m[1].trim();
    if (tok) tokens.push(tok);
  }
  return tokens;
}

const ORIENTATION_VALUES = ['flat', 'portrait', 'landscape'];

function parseValue(tok) {
  if (!tok) throw new Error('Expected value, got end of input');
  if (/g$/i.test(tok)) return parseFloat(tok) * 9.81;
  if (ORIENTATION_VALUES.indexOf(tok) !== -1) return tok;
  const n = parseFloat(tok);
  if (isNaN(n)) throw new Error('Expected number or orientation (flat|portrait|landscape), got: ' + tok);
  return n;
}

function parseCondition(tokens, i) {
  const tok = tokens[i];
  if (!tok) throw new Error('Unexpected end of threshold string');

  if (tok === 'steady') {
    const op = tokens[i + 1];
    const durTok = tokens[i + 2] || '';
    let advance = 3;
    if (!/s$/i.test(durTok) && tokens[i + 3] === 's') advance = 4;
    const dur = parseFloat(durTok);
    if (!op || isNaN(dur)) throw new Error('Bad steady condition');
    return [{ type: 'steady', op: op, duration: dur }, i + advance];
  }

  if (tok === 'freefall') {
    const op2 = tokens[i + 1];
    const durTok2 = tokens[i + 2] || '';
    let advance2 = 3;
    if (!/s$/i.test(durTok2) && tokens[i + 3] === 's') advance2 = 4;
    const dur2 = parseFloat(durTok2);
    if (!op2 || isNaN(dur2)) throw new Error('Bad freefall condition');
    return [{ type: 'freefall', op: op2, duration: dur2 }, i + advance2];
  }

  if (/^[a-zA-Z_][\w.]*$/.test(tok)) {
    const sensorId = tok;
    const op3 = tokens[i + 1];
    const valTok = tokens[i + 2];
    if (!op3 || !valTok) throw new Error('Incomplete condition for: ' + sensorId);
    const parsedVal = parseValue(valTok);
    return [{ type: 'sensor', sensorId: sensorId, op: op3, value: parsedVal }, i + 3];
  }

  throw new Error('Unexpected token: ' + tok);
}

function parse(tokens) {
  if (tokens.length === 0) throw new Error('Empty threshold string');
  const result = parseCondition(tokens, 0);
  let node = result[0];
  let i = result[1];
  while (i < tokens.length) {
    if (tokens[i] !== 'AND') throw new Error('Expected AND, got: ' + tokens[i]);
    const right = parseCondition(tokens, i + 1);
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
    const trimmed = (thresholdStr || '').trim();
    if (!trimmed) return { valid: false, error: 'Empty threshold' };
    const tokens = tokenise(trimmed);
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
