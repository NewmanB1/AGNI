'use strict';

/**
 * Regression: YAML security mitigations (anchor/alias DoS, max size, max depth,
 * key explosion, max steps). P0 #3, #4.
 */
const assert = require('assert');
const yaml = require('js-yaml');
const { describe, it } = require('../helpers/test-api');
const { parseLessonFromString } = require('@ols/compiler/services/compiler');
const { safeYamlLoad, DEFAULT_MAX_STEPS } = require('@agni/utils/yaml-safe');

describe('safeYamlLoad / YAML security', function () {
  it('parses valid lesson YAML', function () {
    const minimal = { version: '1.8.0', meta: { title: 'Test' }, steps: [] };
    const raw = yaml.dump(minimal);
    const r = parseLessonFromString(raw);
    assert.ok(!r.error, r.error || '');
    assert.ok(r.lessonData);
    assert.equal(r.lessonData.meta.title, 'Test');
  });

  it('rejects anchor/alias (DoS bomb)', function () {
    const bomb = 'a: &a ["LOL"]\nb: &b [*a,*a,*a,*a,*a,*a,*a]';
    const r = parseLessonFromString(bomb);
    assert.ok(r.error, 'Expected rejection');
    assert.ok(/anchors?\/aliases?|DoS/i.test(r.error), 'Expected DoS/anchor message: ' + r.error);
  });

  it('rejects on size exceeded', function () {
    const big = 'x: ' + 'a'.repeat(3 * 1024 * 1024);
    const r = parseLessonFromString(big, { maxBytes: 1024 * 1024 });
    assert.ok(r.error, 'Expected size rejection');
    assert.ok(/max size|exceeds/i.test(r.error), 'Expected size message: ' + r.error);
  });

  it('accepts when under maxBytes', function () {
    const small = 'meta: { title: OK }\nsteps: []';
    const r = parseLessonFromString(small, { maxBytes: 10000 });
    assert.ok(!r.error, r.error || '');
  });

  it('rejects deep nesting (P0 #3)', function () {
    let nested = 'x: 1';
    for (let i = 0; i < 60; i++) nested = 'a: { ' + nested + ' }';
    assert.throws(
      function () { safeYamlLoad(nested, { maxDepth: 10 }); },
      /nesting|limits|DoS/i
    );
  });

  it('rejects !!timestamp and !!binary (JSON_SCHEMA unknown tag)', function () {
    assert.throws(
      function () { safeYamlLoad('d: !!timestamp 2023-01-15'); },
      /parse failed|unknown tag/
    );
    assert.throws(
      function () { safeYamlLoad('data: !!binary SGVsbG8='); },
      /parse failed|unknown tag/
    );
  });

  it('LEN 2-5: JSON_SCHEMA keeps date-like values as strings (no Date, binary, omap)', function () {
    var r = safeYamlLoad('a: 1\nd: 2023-01-15');
    assert.strictEqual(typeof r.d, 'string', 'date-like stays string');
    assert.strictEqual(r.d, '2023-01-15');
  });

  it('rejects key explosion in steps (P0 #4)', function () {
    const steps = {};
    for (let i = 0; i < DEFAULT_MAX_STEPS + 10; i++) {
      steps['step' + i] = { id: 's' + i, type: 'content', content: 'x' };
    }
    const raw = yaml.dump({ meta: { title: 'Test' }, steps: steps });
    assert.throws(
      function () { safeYamlLoad(raw); },
      /steps.*max|exceeds/i
    );
  });
});
