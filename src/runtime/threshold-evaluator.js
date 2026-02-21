// src/runtime/threshold-evaluator.js
// AGNI Threshold Evaluator  v1.7.0
//
// Parses threshold strings from lesson YAML into stateful evaluator functions.
//
// Grammar:
//   threshold  = condition (AND condition)*
//   condition  = sensorId operator value unit?
//              | "steady" operator duration "s"
//              | "freefall" operator duration "s"
//   sensorId   = word ("." word)*       e.g. accel.total, accel.magnitude
//   operator   = ">" | "<" | ">=" | "<=" | "==" | "!="
//   value      = number ("g")?          e.g. 2.5  9.8  2.5g
//   duration   = number                 e.g. 0.4  1.5
//
// Examples:
//   "accel.total > 2.5g"
//   "accel.magnitude > 8.0 AND steady > 1.5s"
//   "accel.total < 1.0 AND freefall > 0.4s"
//   "rotation.gamma > 30"
//   "accel.x >= 5.0"
//
// The "g" unit converts the value to m/s² by multiplying by 9.81.
// "steady > 1.5s" means the primary sensor has been above its threshold
//   for at least 1.5 continuous seconds.
// "freefall > 0.4s" means accel.total has been below 1.0 m/s² for 0.4s.
//
// Usage:
//   var evaluate = AGNI_SHARED.thresholdEvaluator.compile("accel.total > 2.5g");
//   // In sensor subscription:
//   if (evaluate(AGNI_SHARED.lastSensorValues)) { ... trigger ... }
//
// compile() returns a stateful function — it tracks duration windows internally.
// Each compile() call produces an independent evaluator with its own state.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;
  if (!S) { console.error('[THRESHOLD] AGNI_SHARED not found'); return; }

  var log = S.log;
  var G   = 9.81;   // m/s² per g

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Tokeniser
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Parser — produces an AST of condition nodes
  // ═══════════════════════════════════════════════════════════════════════════

  // Node types:
  //   { type: 'sensor',   sensorId, op, value }        — simple comparison
  //   { type: 'steady',   op, duration }                — sensor held above threshold
  //   { type: 'freefall', op, duration }                — accel.total below 1.0 for duration
  //   { type: 'and',      left, right }                 — both conditions

  function parseValue(tok) {
    if (!tok) throw new Error('[THRESHOLD] Expected value, got end of input');
    if (/g$/i.test(tok)) {
      return parseFloat(tok) * G;   // convert g → m/s²
    }
    var n = parseFloat(tok);
    if (isNaN(n)) throw new Error('[THRESHOLD] Expected number, got: ' + tok);
    return n;
  }

  function parseCondition(tokens, i) {
    var tok = tokens[i];
    if (!tok) throw new Error('[THRESHOLD] Unexpected end of threshold string');

    // "steady" keyword
    if (tok === 'steady') {
      var op  = tokens[i + 1];
      // Duration token may be "1.5s" (single token) or "1.5" followed by "s"
      var durTok = tokens[i + 2] || '';
      var advance = 3;
      if (!/s$/i.test(durTok) && tokens[i + 3] === 's') {
        // "1.5" "s" — two tokens
        advance = 4;
      }
      var dur = parseFloat(durTok);
      if (!op || isNaN(dur)) throw new Error('[THRESHOLD] Bad steady condition');
      return [{ type: 'steady', op: op, duration: dur }, i + advance];
    }

    // "freefall" keyword
    if (tok === 'freefall') {
      var op2  = tokens[i + 1];
      var durTok2 = tokens[i + 2] || '';
      var advance2 = 3;
      if (!/s$/i.test(durTok2) && tokens[i + 3] === 's') {
        advance2 = 4;
      }
      var dur2 = parseFloat(durTok2);
      if (!op2 || isNaN(dur2)) throw new Error('[THRESHOLD] Bad freefall condition');
      return [{ type: 'freefall', op: op2, duration: dur2 }, i + advance2];
    }

    // sensorId op value
    // A sensorId looks like "accel.total" — word chars and dots, not a number, not an operator
    if (/^[a-zA-Z_][\w.]*$/.test(tok)) {
      var sensorId = tok;
      var op3 = tokens[i + 1];
      var valTok = tokens[i + 2];
      if (!op3 || !valTok) throw new Error('[THRESHOLD] Incomplete condition for: ' + sensorId);
      return [{ type: 'sensor', sensorId: sensorId, op: op3, value: parseValue(valTok) }, i + 3];
    }

    throw new Error('[THRESHOLD] Unexpected token: ' + tok);
  }

  function parse(tokens) {
    if (tokens.length === 0) throw new Error('[THRESHOLD] Empty threshold string');
    var result = parseCondition(tokens, 0);
    var node = result[0];
    var i    = result[1];

    // AND chain
    while (i < tokens.length) {
      if (tokens[i] !== 'AND') {
        throw new Error('[THRESHOLD] Expected AND, got: ' + tokens[i]);
      }
      var right = parseCondition(tokens, i + 1);
      node = { type: 'and', left: node, right: right[0] };
      i    = right[1];
    }

    return node;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Operator evaluation helper
  // ═══════════════════════════════════════════════════════════════════════════

  function evalOp(op, a, b) {
    switch (op) {
      case '>':  return a >  b;
      case '<':  return a <  b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '==': return a === b;
      case '!=': return a !== b;
      default:   throw new Error('[THRESHOLD] Unknown operator: ' + op);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Stateful evaluator factory
  //    Each AST node gets its own state closure so duration tracking is
  //    independent per condition even in an AND chain.
  // ═══════════════════════════════════════════════════════════════════════════

  function buildEvaluator(node) {
    if (node.type === 'sensor') {
      // Simple comparison — stateless
      var sensorId = node.sensorId;
      var op       = node.op;
      var val      = node.value;
      return function (sensorValues) {
        var current = sensorValues.get(sensorId);
        if (current === undefined || current === null) return false;
        return evalOp(op, current, val);
      };
    }

    if (node.type === 'steady') {
      // "steady > Xs" — the most recent sensor reading has continuously
      // satisfied its own condition for at least X seconds.
      // "steady" wraps the immediately preceding sensor condition, but since
      // we don't have that context here we track whether the primary sensor
      // (accel.total by convention) has been above its companion threshold.
      // In practice, lessons write:
      //   "accel.total > 8.0 AND steady > 1.5s"
      // so the AND evaluator drives both; steady just tracks elapsed time.
      var required   = node.duration;        // seconds
      var op2        = node.op;
      var _startTime = null;

      return function (_sensorValues, _passed) {
        // _passed is set by the AND evaluator to the result of the sibling
        // sensor condition — see AND handling below.
        var now = performance.now() / 1000;
        if (_passed) {
          if (_startTime === null) _startTime = now;
          return evalOp(op2, now - _startTime, required);
        } else {
          _startTime = null;
          return false;
        }
      };
    }

    if (node.type === 'freefall') {
      // "freefall > Xs" — accel.total has been below 1.0 m/s² for X seconds
      var required3 = node.duration;
      var op3       = node.op;
      var FREEFALL_THRESHOLD = 1.0;   // m/s²
      var _ffStart  = null;

      return function (sensorValues) {
        var total = sensorValues.get('accel.total');
        if (total === undefined) total = sensorValues.get('accel.magnitude') || 0;
        var now3 = performance.now() / 1000;
        if (total < FREEFALL_THRESHOLD) {
          if (_ffStart === null) _ffStart = now3;
          return evalOp(op3, now3 - _ffStart, required3);
        } else {
          _ffStart = null;
          return false;
        }
      };
    }

    if (node.type === 'and') {
      var leftFn  = buildEvaluator(node.left);
      var rightFn = buildEvaluator(node.right);

      // Special case: if the right side is a "steady" evaluator we pass
      // the left result as context so steady knows whether to advance its timer
      var rightIsSteady = (node.right.type === 'steady');

      return function (sensorValues) {
        var leftResult = leftFn(sensorValues);
        var rightResult;
        if (rightIsSteady) {
          // Pass leftResult as the second argument so steady can use it
          rightResult = rightFn(sensorValues, leftResult);
        } else {
          // Short-circuit for non-steady AND
          if (!leftResult) { rightFn(sensorValues, false); return false; }
          rightResult = rightFn(sensorValues);
        }
        return leftResult && rightResult;
      };
    }

    throw new Error('[THRESHOLD] Unknown node type: ' + node.type);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compile a threshold string into a stateful evaluator function.
   *
   * @param  {string} thresholdStr   e.g. "accel.total > 2.5g AND steady > 1.5s"
   * @returns {function(Map) → boolean}
   *   Pass AGNI_SHARED.lastSensorValues; returns true when threshold is met.
   *   The function is stateful — call it on every sensor reading tick.
   *
   * @throws {Error} if the threshold string cannot be parsed
   */
  function compile(thresholdStr) {
    if (!thresholdStr || typeof thresholdStr !== 'string') {
      throw new Error('[THRESHOLD] compile() requires a non-empty string');
    }
    var trimmed = thresholdStr.trim();
    var tokens  = tokenise(trimmed);
    var ast     = parse(tokens);
    return buildEvaluator(ast);
  }

  /**
   * Compile and immediately wrap in a sensor subscription that fires once
   * when the threshold is met, then unsubscribes.
   *
   * @param {string}   thresholdStr
   * @param {string}   primarySensor   sensor to subscribe to (drives evaluation cadence)
   * @param {function} onMet           called with the triggering reading when met
   * @returns {function}               cancel — call to unsubscribe without firing onMet
   */
  function watch(thresholdStr, primarySensor, onMet) {
    var evaluate = compile(thresholdStr);
    var fired    = false;

    var unsub = S.subscribeToSensor(primarySensor, function (reading) {
      if (fired) return;
      if (evaluate(S.lastSensorValues)) {
        fired = true;
        unsub();
        onMet(reading);
      }
    });

    return function cancel() {
      fired = true;
      unsub();
    };
  }

  /**
   * Parse a threshold string and return a human-readable description.
   * Used by the WYSIWYG and lesson validation tooling.
   *
   * @param  {string} thresholdStr
   * @returns {string}
   */
  function describe(thresholdStr) {
    try {
      var tokens = tokenise(thresholdStr.trim());
      var ast    = parse(tokens);
      return describeNode(ast);
    } catch (e) {
      return '(invalid: ' + e.message + ')';
    }
  }

  function describeNode(node) {
    if (node.type === 'sensor') {
      var unit = ['accel.total','accel.magnitude','accel.x','accel.y','accel.z'].indexOf(node.sensorId) !== -1
        ? ' m/s²' : '';
      return node.sensorId + ' ' + node.op + ' ' + node.value.toFixed(2) + unit;
    }
    if (node.type === 'steady') {
      return 'held for ' + node.duration + 's';
    }
    if (node.type === 'freefall') {
      return 'in freefall for ' + node.duration + 's';
    }
    if (node.type === 'and') {
      return describeNode(node.left) + ' AND ' + describeNode(node.right);
    }
    return '?';
  }

  /**
   * Validate a threshold string without compiling it.
   * Returns { valid: bool, error: string|null, description: string|null }
   */
  function validate(thresholdStr) {
    try {
      var tokens = tokenise((thresholdStr || '').trim());
      var ast    = parse(tokens);
      return { valid: true, error: null, description: describeNode(ast) };
    } catch (e) {
      return { valid: false, error: e.message, description: null };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Attach and register
  // ═══════════════════════════════════════════════════════════════════════════

  S.thresholdEvaluator = {
    compile:  compile,
    watch:    watch,
    describe: describe,
    validate: validate
  };

  S.registerModule('threshold-evaluator', '1.7.0');

  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);
  if (DEV_MODE) log.debug('threshold-evaluator v1.7.0 loaded');

}(window));
