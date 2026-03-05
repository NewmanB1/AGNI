'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseLessonFromString, validateLessonStructure, runCompilePipeline } = require('@agni/services/compiler');
const { minimalLesson } = require('../helpers/fixtures');
const yaml = require('js-yaml');

// ── parseLessonFromString ────────────────────────────────────────────────────

describe('parseLessonFromString', () => {
  it('parses valid YAML', () => {
    const raw = yaml.dump(minimalLesson());
    const r = parseLessonFromString(raw);
    assert.ok(r.lessonData);
    assert.equal(r.lessonData.meta.title, 'Test Lesson');
  });

  it('returns error for non-string input', () => {
    assert.ok(parseLessonFromString(null).error);
    assert.ok(parseLessonFromString(42).error);
    assert.ok(parseLessonFromString(undefined).error);
  });

  it('returns error for invalid YAML', () => {
    const r = parseLessonFromString('{{{{invalid yaml: [');
    assert.ok(r.error);
  });

  it('trims whitespace', () => {
    const raw = '\n\n  ' + yaml.dump(minimalLesson()) + '\n\n';
    const r = parseLessonFromString(raw);
    assert.ok(r.lessonData);
  });

  it('handles empty string (no crash)', () => {
    const r = parseLessonFromString('');
    assert.ok(!r.error || r.lessonData == null, 'Empty string should not produce a valid lessonData object');
  });
});

// ── validateLessonStructure ──────────────────────────────────────────────────

describe('validateLessonStructure', () => {
  it('accepts a valid lesson', () => {
    assert.doesNotThrow(() => validateLessonStructure(minimalLesson()));
  });

  it('throws on missing meta', () => {
    assert.throws(() => validateLessonStructure({ steps: [] }));
  });

  it('throws on missing steps', () => {
    assert.throws(() => validateLessonStructure({ meta: {} }));
  });
});

// ── runCompilePipeline ───────────────────────────────────────────────────────

describe('runCompilePipeline', () => {
  it('compiles valid YAML into ir and sidecar', async () => {
    const raw = yaml.dump(minimalLesson());
    const { ir, sidecar } = await runCompilePipeline(raw, { dev: false });
    assert.ok(ir);
    assert.ok(ir.steps);
    assert.ok(ir.inferredFeatures);
    assert.ok(sidecar);
    assert.equal(sidecar.title, 'Test Lesson');
  });

  it('sets devMode from options', async () => {
    const raw = yaml.dump(minimalLesson());
    const { ir } = await runCompilePipeline(raw, { dev: true });
    assert.equal(ir._devMode, true);
  });

  it('returns error on invalid YAML', async () => {
    const r = await runCompilePipeline('{{bad', {});
    assert.ok(r.error);
    assert.match(r.error, /Parse error/);
  });

  it('returns error on structurally invalid lesson', async () => {
    const r = await runCompilePipeline(yaml.dump({ not: 'a lesson' }), {});
    assert.ok(r.error);
    assert.match(r.error, /Validation failed/);
  });

  it('sidecar has compiledAt timestamp', async () => {
    const raw = yaml.dump(minimalLesson());
    const { sidecar } = await runCompilePipeline(raw, {});
    assert.ok(sidecar.compiledAt);
  });
});
