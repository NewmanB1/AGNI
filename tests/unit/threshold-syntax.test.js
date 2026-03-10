'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { validateThresholdSyntax, tokenise, parse } = require('@agni/utils/threshold-syntax');

// ── tokenise ─────────────────────────────────────────────────────────────────

describe('tokenise', () => {
  it('splits a simple sensor condition', () => {
    const tokens = tokenise('accel.total > 2.5g');
    assert.deepEqual(tokens, ['accel.total', '>', '2.5g']);
  });

  it('splits an AND compound condition', () => {
    const tokens = tokenise('accel.total > 2.5g AND freefall > 0.2');
    assert.ok(tokens.includes('AND'));
    assert.equal(tokens.length, 7);
  });

  it('handles steady condition', () => {
    const tokens = tokenise('steady > 3');
    assert.deepEqual(tokens, ['steady', '>', '3']);
  });

  it('handles all comparison operators', () => {
    for (const op of ['>', '<', '>=', '<=', '==', '!=']) {
      const tokens = tokenise('sensor ' + op + ' 1');
      assert.ok(tokens.includes(op), 'Expected op ' + op);
    }
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(tokenise(''), []);
  });

  it('handles negative values', () => {
    const tokens = tokenise('temp > -10');
    assert.ok(tokens.includes('-10'));
  });

  it('handles g-unit suffix', () => {
    const tokens = tokenise('accel.x >= 1.5g');
    assert.ok(tokens.includes('1.5g'));
  });
});

// ── parse ────────────────────────────────────────────────────────────────────

describe('parse', () => {
  it('parses a sensor condition', () => {
    const ast = parse(tokenise('accel.total > 2.5g'));
    assert.equal(ast.type, 'sensor');
    assert.equal(ast.sensorId, 'accel.total');
    assert.equal(ast.op, '>');
  });

  it('parses a steady condition', () => {
    const ast = parse(tokenise('steady > 3'));
    assert.equal(ast.type, 'steady');
    assert.equal(ast.op, '>');
    assert.equal(ast.duration, 3);
  });

  it('parses a freefall condition', () => {
    const ast = parse(tokenise('freefall > 0.2'));
    assert.equal(ast.type, 'freefall');
    assert.equal(ast.duration, 0.2);
  });

  it('parses AND compound conditions', () => {
    const ast = parse(tokenise('accel.total > 2.5g AND steady > 1'));
    assert.equal(ast.type, 'and');
    assert.equal(ast.left.type, 'sensor');
    assert.equal(ast.right.type, 'steady');
  });

  it('parses orientation == flat', () => {
    const ast = parse(tokenise('orientation == flat'));
    assert.equal(ast.type, 'sensor');
    assert.equal(ast.sensorId, 'orientation');
    assert.equal(ast.op, '==');
    assert.equal(ast.value, 'flat');
  });

  it('parses orientation == portrait', () => {
    const ast = parse(tokenise('orientation == portrait'));
    assert.equal(ast.value, 'portrait');
  });

  it('chains multiple AND conditions', () => {
    const ast = parse(tokenise('a > 1 AND b > 2 AND c > 3'));
    assert.equal(ast.type, 'and');
    assert.equal(ast.right.type, 'sensor');
    assert.equal(ast.right.sensorId, 'c');
  });

  it('throws on empty token list', () => {
    assert.throws(() => parse([]), /Empty threshold/);
  });

  it('throws on unexpected token', () => {
    assert.throws(() => parse(['>', '1']), /Unexpected token/);
  });

  it('throws on incomplete condition', () => {
    assert.throws(() => parse(tokenise('accel.total >')), /Incomplete/);
  });
});

// ── validateThresholdSyntax ──────────────────────────────────────────────────

describe('validateThresholdSyntax', () => {
  it('validates simple sensor threshold', () => {
    assert.ok(validateThresholdSyntax('accel.total > 2.5g').valid);
  });

  it('validates freefall threshold', () => {
    assert.ok(validateThresholdSyntax('freefall > 0.2').valid);
  });

  it('validates steady threshold', () => {
    assert.ok(validateThresholdSyntax('steady >= 5').valid);
  });

  it('validates compound AND threshold', () => {
    assert.ok(validateThresholdSyntax('accel.total > 2.5g AND freefall > 0.2').valid);
  });

  it('rejects empty string', () => {
    const r = validateThresholdSyntax('');
    assert.ok(!r.valid);
    assert.ok(r.error.includes('Empty'));
  });

  it('rejects null input', () => {
    assert.ok(!validateThresholdSyntax(null).valid);
  });

  it('rejects garbage input', () => {
    assert.ok(!validateThresholdSyntax('!@#$%^&*').valid);
  });

  it('rejects incomplete expressions', () => {
    assert.ok(!validateThresholdSyntax('accel.total >').valid);
  });

  it('rejects missing operator', () => {
    assert.ok(!validateThresholdSyntax('accel.total 2.5g').valid);
  });

  it('validates orientation == flat', () => {
    assert.ok(validateThresholdSyntax('orientation == flat').valid);
  });

  it('validates orientation == portrait', () => {
    assert.ok(validateThresholdSyntax('orientation == portrait').valid);
  });

  it('validates orientation == landscape', () => {
    assert.ok(validateThresholdSyntax('orientation == landscape').valid);
  });

  it('validates orientation != flat', () => {
    assert.ok(validateThresholdSyntax('orientation != flat').valid);
  });
});
