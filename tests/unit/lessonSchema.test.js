'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const lessonSchema = require('@agni/services/lesson-schema');
const { minimalLesson } = require('../helpers/fixtures');

// ── validateStructure ────────────────────────────────────────────────────────

describe('validateStructure', () => {
  it('accepts a well-formed lesson', () => {
    assert.doesNotThrow(() => lessonSchema.validateStructure(minimalLesson()));
  });

  it('throws on null input', () => {
    assert.throws(() => lessonSchema.validateStructure(null), /Must contain "meta" and "steps"/);
  });

  it('throws when meta is missing', () => {
    assert.throws(
      () => lessonSchema.validateStructure({ steps: [] }),
      /Must contain "meta" and "steps"/
    );
  });

  it('throws when steps is missing', () => {
    assert.throws(
      () => lessonSchema.validateStructure({ meta: {} }),
      /Must contain "meta" and "steps"/
    );
  });

  it('throws when steps is not an array', () => {
    assert.throws(
      () => lessonSchema.validateStructure({ meta: {}, steps: 'not-array' }),
      /"steps" must be a YAML array/
    );
  });
});

// ── validateThresholds ───────────────────────────────────────────────────────

describe('validateThresholds', () => {
  it('passes when no hardware_trigger steps exist', () => {
    const result = lessonSchema.validateThresholds(minimalLesson());
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  it('passes for valid threshold syntax', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 's1', type: 'hardware_trigger', sensor: 'accelerometer', threshold: 'accel.total > 2.5g' }
      ]
    });
    const result = lessonSchema.validateThresholds(lesson);
    assert.ok(result.valid);
  });

  it('reports invalid threshold syntax', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 's1', type: 'hardware_trigger', sensor: 'accelerometer', threshold: '!@#garbage' }
      ]
    });
    const result = lessonSchema.validateThresholds(lesson);
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('s1'));
  });

  it('handles steps with no threshold gracefully', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'hardware_trigger', sensor: 'accelerometer' }]
    });
    const result = lessonSchema.validateThresholds(lesson);
    assert.ok(result.valid);
  });
});

// ── validateSemantics ────────────────────────────────────────────────────────

describe('validateSemantics', () => {
  it('detects duplicate step IDs', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 'dup', type: 'instruction', content: 'A' },
        { id: 'dup', type: 'instruction', content: 'B' }
      ]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /Duplicate step ID/.test(e)));
  });

  it('requires quiz steps to have at least 2 options', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'q1', type: 'quiz', answer_options: ['only one'], correct_index: 0 }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /at least 2 answer_options/.test(e)));
  });

  it('detects correct_index out of bounds', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'q1', type: 'quiz', answer_options: ['A', 'B'], correct_index: 5 }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /correct_index.*out of bounds/.test(e)));
  });

  it('accepts valid correct_index', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'q1', type: 'quiz', answer_options: ['A', 'B', 'C'], correct_index: 1 }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.equal(result.errors.filter(e => /correct_index/.test(e)).length, 0);
  });

  it('requires svg steps to have svg_spec with factory', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'v1', type: 'svg' }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /svg_spec/.test(e)));
  });

  it('warns on missing description', () => {
    const lesson = minimalLesson();
    delete lesson.meta.description;
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.warnings.some(w => /description/.test(w)));
  });

  it('warns on missing ontology', () => {
    const lesson = minimalLesson();
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.warnings.some(w => /ontology/.test(w)));
  });

  it('warns on unknown step ID references in on_fail', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 's1', type: 'instruction', content: 'A', on_fail: 'nonexistent_step' }
      ]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.warnings.some(w => /on_fail.*unknown step ID/.test(w)));
  });

  it('does not warn on special on_fail values (skip, hint)', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 's1', type: 'instruction', content: 'A', on_fail: 'skip' }
      ]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(!result.warnings.some(w => /on_fail.*unknown/.test(w)));
  });

  it('requires fill_blank steps to have non-empty blanks', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'f1', type: 'fill_blank', content: 'The ___ is blue.', blanks: [] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /fill_blank.*blanks/.test(e)));
  });

  it('requires fill_blank blanks to have answer', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'f1', type: 'fill_blank', content: 'The ___ is blue.', blanks: [{}] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /blanks.*answer/.test(e)));
  });

  it('accepts valid fill_blank', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'f1', type: 'fill_blank', content: 'The ___ is blue.', blanks: [{ answer: 'sky' }] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(!result.errors.some(e => /fill_blank|blanks/.test(e)));
  });

  it('requires matching steps to have non-empty pairs', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'm1', type: 'matching', content: 'Match.', pairs: [] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /matching.*pairs/.test(e)));
  });

  it('requires matching pairs to have left and right', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'm1', type: 'matching', content: 'Match.', pairs: [{ left: 'A' }] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /pairs.*left.*right/.test(e)));
  });

  it('accepts valid matching', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'm1', type: 'matching', content: 'Match.', pairs: [{ left: 'A', right: '1' }] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(!result.errors.some(e => /matching|pairs/.test(e)));
  });

  it('requires ordering steps to have items and correct_order', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'o1', type: 'ordering', content: 'Order.', items: ['A', 'B'], correct_order: [0] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /ordering.*correct_order/.test(e)));
  });

  it('rejects ordering with invalid correct_order indices', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'o1', type: 'ordering', content: 'Order.', items: ['A', 'B'], correct_order: [0, 5] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /correct_order.*index/.test(e)));
  });

  it('rejects ordering with duplicate correct_order indices', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'o1', type: 'ordering', content: 'Order.', items: ['A', 'B', 'C'], correct_order: [0, 1, 1] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /repeat indices/.test(e)));
  });

  it('accepts valid ordering', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'o1', type: 'ordering', content: 'Order.', items: ['A', 'B', 'C'], correct_order: [2, 0, 1] }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(!result.errors.some(e => /ordering|correct_order/.test(e)));
  });

  it('requires hardware_trigger to have threshold', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'h1', type: 'hardware_trigger', sensor: 'accelerometer' }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(result.errors.some(e => /hardware_trigger.*threshold/.test(e)));
  });

  it('accepts hardware_trigger with threshold', () => {
    const lesson = minimalLesson({
      steps: [{ id: 'h1', type: 'hardware_trigger', sensor: 'accelerometer', threshold: 'accel.total > 2.5g' }]
    });
    const result = lessonSchema.validateSemantics(lesson);
    assert.ok(!result.errors.some(e => /hardware_trigger.*threshold/.test(e)));
  });
});

// ── validateLessonData (full pipeline) ───────────────────────────────────────

describe('validateLessonData', () => {
  it('passes a minimal valid lesson', () => {
    const result = lessonSchema.validateLessonData(minimalLesson());
    assert.ok(result.valid, 'Expected valid, got errors: ' + result.errors.join('; '));
  });

  it('rejects null input', () => {
    const result = lessonSchema.validateLessonData(null);
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
  });

  it('rejects a lesson with no steps', () => {
    const result = lessonSchema.validateLessonData({ meta: { identifier: 'x', title: 'X', language: 'en', license: 'MIT', created: '2026-01-01T00:00:00Z' } });
    assert.ok(!result.valid);
  });

  it('collects errors from multiple validation layers', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 'dup', type: 'quiz', answer_options: ['only'], correct_index: 0 },
        { id: 'dup', type: 'instruction', content: 'X' }
      ]
    });
    const result = lessonSchema.validateLessonData(lesson);
    assert.ok(result.errors.length >= 2, 'Expected at least 2 errors (dup ID + quiz options)');
  });

  it('returns warnings alongside errors', () => {
    const result = lessonSchema.validateLessonData(minimalLesson());
    assert.ok(Array.isArray(result.warnings));
  });
});
