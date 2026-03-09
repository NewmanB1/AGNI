'use strict';

/**
 * Regression: YAML security mitigations (anchor/alias DoS, max size, JSON_SCHEMA).
 */
const assert = require('assert');
const { safeYamlLoad, parseLessonFromString } = require('@ols/compiler/services/compiler');
const yaml = require('js-yaml');

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
});
