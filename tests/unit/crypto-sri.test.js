'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { computeSRI } = require('@agni/utils/crypto');

describe('computeSRI', () => {
  it('returns sha384-<base64> format', () => {
    const sri = computeSRI('hello');
    assert.match(sri, /^sha384-[A-Za-z0-9+/]+=*$/);
    assert.ok(sri.startsWith('sha384-'));
  });

  it('produces deterministic output for same input', () => {
    const content = 'var x = 1;';
    assert.equal(computeSRI(content), computeSRI(content));
  });

  it('produces different hashes for different content', () => {
    assert.notEqual(computeSRI('a'), computeSRI('b'));
    assert.notEqual(computeSRI('script1'), computeSRI('script2'));
  });

  it('matches Node crypto SHA-384 base64', () => {
    const content = '// factory code';
    const expected = crypto.createHash('sha384').update(content, 'utf8').digest('base64');
    const sri = computeSRI(content);
    assert.equal(sri, 'sha384-' + expected);
  });

  it('accepts Buffer input', () => {
    const buf = Buffer.from('test', 'utf8');
    const sri = computeSRI(buf);
    assert.equal(sri, computeSRI('test'));
  });

  it('handles empty string', () => {
    const sri = computeSRI('');
    assert.match(sri, /^sha384-[A-Za-z0-9+/]+=*$/);
  });

  it('handles unicode content', () => {
    const content = '// \u{1F4DA}';
    const sri = computeSRI(content);
    assert.match(sri, /^sha384-/);
  });
});
