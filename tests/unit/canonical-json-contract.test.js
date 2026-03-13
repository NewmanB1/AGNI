'use strict';

/**
 * Contract test: canonicalJSON for integrity signing (P2-11 hardening).
 *
 * Node (packages/agni-utils/crypto.js) and browser (packages/agni-runtime/shared-runtime.js)
 * both implement canonicalJSON. They MUST produce identical output for any LESSON_DATA object,
 * or signature verification will fail. This test pins the Node implementation's behavior.
 *
 * If you change canonicalJSON in crypto.js, update these expectations. Keep shared-runtime.js
 * canonicalJSON in sync — both must follow the same algorithm.
 */

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { canonicalJSON } = require('@agni/utils/crypto');

describe('canonicalJSON contract (Node ↔ browser integrity signing)', () => {
  it('sorts object keys recursively', () => {
    const obj = { z: 1, a: 2, m: 3 };
    assert.equal(canonicalJSON(obj), '{"a":2,"m":3,"z":1}');
  });

  it('handles nested objects with sorted keys', () => {
    const obj = { meta: { title: 'Test', id: 'x' } };
    assert.equal(canonicalJSON(obj), '{"meta":{"id":"x","title":"Test"}}');
  });

  it('omits undefined values', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    assert.equal(canonicalJSON(obj), '{"a":1,"c":3}');
  });

  it('handles null and empty values', () => {
    assert.equal(canonicalJSON(null), 'null');
    assert.equal(canonicalJSON({ a: null }), '{"a":null}');
    assert.equal(canonicalJSON([]), '[]');
    assert.equal(canonicalJSON({}), '{}');
  });

  it('handles numbers deterministically', () => {
    assert.equal(canonicalJSON(1), '1');
    assert.equal(canonicalJSON(1.0), '1');
    assert.equal(canonicalJSON(0), '0');
    assert.equal(canonicalJSON(1e10), '10000000000');
    assert.equal(canonicalJSON(-3.14), '-3.14');
  });

  it('replaces non-finite numbers with null', () => {
    assert.equal(canonicalJSON(NaN), 'null');
    assert.equal(canonicalJSON(Infinity), 'null');
    assert.equal(canonicalJSON(-Infinity), 'null');
    assert.equal(canonicalJSON({ x: NaN }), '{"x":null}');
  });

  it('escapes strings correctly', () => {
    assert.equal(canonicalJSON('hello'), '"hello"');
    assert.equal(canonicalJSON('"quoted"'), '"\\"quoted\\""');
    assert.equal(canonicalJSON('a\nb'), '"a\\nb"');
  });

  it('handles Unicode', () => {
    const obj = { title: 'Lesson \u{1F4DA}' };
    assert.equal(canonicalJSON(obj), '{"title":"Lesson 📚"}');
  });

  it('produces identical output regardless of input key order', () => {
    const a = { steps: [{ id: 's1', type: 'content' }], meta: { title: 'T' } };
    const b = { meta: { title: 'T' }, steps: [{ id: 's1', type: 'content' }] };
    assert.equal(canonicalJSON(a), canonicalJSON(b));
  });

  it('matches binding-hash signing input format', () => {
    // Simulates LESSON_DATA structure used in signContent
    const ir = {
      meta: { title: 'Test Lesson', language: 'en' },
      steps: [{ id: '1', type: 'content', content: 'Hello' }],
      inferredFeatures: {}
    };
    const out = canonicalJSON(ir);
    assert.ok(out.startsWith('{'));
    assert.ok(out.includes('"meta"'));
    assert.ok(out.includes('"steps"'));
    assert.ok(out.includes('"inferredFeatures"'));
  });

  it('shared-runtime canonicalJSON matches Node (P2-11 cross-impl)', () => {
    const nodeCJ = canonicalJSON;
    const { setupGlobals, teardownGlobals } = require('../helpers/browser-globals');
    setupGlobals();
    global.LESSON_DATA = {};
    global.performance = global.performance || { now: () => Date.now() };
    try {
      require('@agni/runtime/shared-runtime');
      const browserCJ = global.AGNI_SHARED && global.AGNI_SHARED.canonicalJSON;
      assert.ok(typeof browserCJ === 'function', 'AGNI_SHARED.canonicalJSON must exist after shared-runtime load');
      const cases = [
        { meta: { title: 'T' }, steps: [] },
        { z: 1, a: 2 },
        { meta: { title: 'Lesson \u{1F4DA}' } },
        [1, 2, 3]
      ];
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        assert.equal(browserCJ(c), nodeCJ(c), 'Node and browser canonicalJSON must match for case ' + i);
      }
    } finally {
      teardownGlobals();
    }
  });
});
