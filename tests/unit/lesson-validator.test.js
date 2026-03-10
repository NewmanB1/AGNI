'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const {
  validateLesson, validateStep, validateThreshold, validateSvgSpec, validateGate,
  VALID_FACTORIES, KNOWN_SENSORS
} = require('@ols/schema/lesson-validator');

// ── helpers ─────────────────────────────────────────────────────────────────

function minimalLesson(overrides) {
  return Object.assign({
    version: '1.8.0',
    meta: { title: 'Test', identifier: 'test-1' },
    steps: [{ id: 'step_1', type: 'instruction', content: 'Hello' }]
  }, overrides);
}

function errors(issues) { return issues.filter(i => i.severity === 'error'); }
function warnings(issues) { return issues.filter(i => i.severity === 'warning'); }

// ── validateLesson ──────────────────────────────────────────────────────────

describe('validateLesson', () => {
  it('passes a minimal valid lesson', () => {
    const r = validateLesson(minimalLesson());
    assert.equal(errors(r).length, 0);
  });

  it('rejects non-object input', () => {
    assert.ok(errors(validateLesson(null)).length > 0);
    assert.ok(errors(validateLesson('bad')).length > 0);
  });

  it('rejects missing steps', () => {
    assert.ok(errors(validateLesson({ meta: {} })).length > 0);
    assert.ok(errors(validateLesson({ steps: [] })).length > 0);
  });

  it('detects duplicate step IDs', () => {
    const r = validateLesson(minimalLesson({
      steps: [
        { id: 'dup', type: 'instruction', content: 'a' },
        { id: 'dup', type: 'instruction', content: 'b' }
      ]
    }));
    assert.ok(errors(r).some(e => /duplicate/i.test(e.message)));
  });

  it('validates UTU protocol range', () => {
    const r = validateLesson(minimalLesson({
      meta: { title: 'X', utu: { class: 'MAC-1', band: 3, protocol: 7 } }
    }));
    assert.ok(errors(r).some(e => /protocol/i.test(e.message)));
  });

  it('validates UTU band range', () => {
    const r = validateLesson(minimalLesson({
      meta: { title: 'X', utu: { class: 'MAC-1', band: 0 } }
    }));
    assert.ok(errors(r).some(e => /band/i.test(e.message)));
  });

  it('validates declared_features.blooms_level', () => {
    const r = validateLesson(minimalLesson({
      meta: { title: 'X', declared_features: { blooms_level: 'memorize' } }
    }));
    assert.ok(errors(r).some(e => /blooms/i.test(e.message)));
  });

  it('validates declared_features.vark', () => {
    const r = validateLesson(minimalLesson({
      meta: { title: 'X', declared_features: { vark: ['tactile'] } }
    }));
    assert.ok(errors(r).some(e => /vark/i.test(e.message)));
  });

  it('accepts valid declared_features', () => {
    const r = validateLesson(minimalLesson({
      meta: { title: 'X', declared_features: {
        blooms_level: 'apply', vark: ['visual', 'kinesthetic'], teaching_style: 'socratic'
      } }
    }));
    assert.equal(errors(r).length, 0);
  });
});

// ── step validation ─────────────────────────────────────────────────────────

describe('validateStep', () => {
  const ids = new Set(['s1', 's2', 's3']);

  it('rejects unknown step type', () => {
    const r = validateStep({ id: 's1', type: 'drag_drop' }, 0, ids);
    assert.ok(errors(r).some(e => /unknown step type/i.test(e.message)));
  });

  it('rejects unknown step fields (hidden state)', () => {
    const r = validateStep({ id: 's1', type: 'instruction', content: 'hi', gesture_sequence: ['swipe', 'tap'] }, 0, ids);
    assert.ok(errors(r).some(e => /unknown step field.*gesture_sequence/i.test(e.message)));
  });

  it('rejects custom timing fields', () => {
    const r = validateStep({ id: 's1', type: 'instruction', delay_ms: 3000 }, 0, ids);
    assert.ok(errors(r).some(e => /unknown step field.*delay_ms/i.test(e.message)));
  });

  it('warns when hardware_trigger lacks on_fail', () => {
    const r = validateStep({ id: 's1', type: 'hardware_trigger', sensor: 'accel.magnitude', threshold: 'accel.magnitude > 2g' }, 0, ids);
    assert.ok(warnings(r).some(w => /on_fail/i.test(w.message)));
  });

  it('passes hardware_trigger with on_fail', () => {
    const r = validateStep({
      id: 's1', type: 'hardware_trigger', sensor: 'accel.magnitude',
      threshold: 'accel.magnitude > 2g', on_fail: 'skip_to:s2'
    }, 0, ids);
    assert.equal(errors(r).length, 0);
  });

  it('validates quiz step structure', () => {
    const r = validateStep({ id: 's1', type: 'quiz', answer_options: ['A'], correct_index: 0 }, 0, ids);
    assert.ok(errors(r).some(e => /at least 2/i.test(e.message)));
  });

  it('validates quiz correct_index bounds', () => {
    const r = validateStep({ id: 's1', type: 'quiz', answer_options: ['A', 'B'], correct_index: 5 }, 0, ids);
    assert.ok(errors(r).some(e => /out of bounds/i.test(e.message)));
  });

  it('validates fill_blank needs blanks', () => {
    const r = validateStep({ id: 's1', type: 'fill_blank', content: 'The ___ is blue' }, 0, ids);
    assert.ok(errors(r).some(e => /blanks/i.test(e.message)));
  });

  it('validates matching needs pairs', () => {
    const r = validateStep({ id: 's1', type: 'matching', pairs: [{ left: 'a', right: 'b' }] }, 0, ids);
    assert.ok(errors(r).some(e => /at least 2/i.test(e.message)));
  });

  it('validates ordering items/correct_order mismatch', () => {
    const r = validateStep({ id: 's1', type: 'ordering', items: ['a', 'b', 'c'], correct_order: [0, 1] }, 0, ids);
    assert.ok(errors(r).some(e => /length.*does not match/i.test(e.message)));
  });

  it('validates on_fail references existing step', () => {
    const r = validateStep({ id: 's1', type: 'instruction', on_fail: 'skip_to:nonexistent' }, 0, ids);
    assert.ok(errors(r).some(e => /does not exist/i.test(e.message)));
  });

  it('passes on_fail referencing valid step', () => {
    const r = validateStep({ id: 's1', type: 'instruction', on_fail: 'skip_to:s2' }, 0, ids);
    assert.equal(errors(r).length, 0);
  });
});

// ── threshold validation ────────────────────────────────────────────────────

describe('validateThreshold', () => {
  it('accepts valid simple threshold', () => {
    assert.equal(errors(validateThreshold('accel.magnitude > 2.5g', 's1')).length, 0);
  });

  it('accepts valid compound threshold', () => {
    assert.equal(errors(validateThreshold('accel.total > 1.0 AND steady > 1.5s', 's1')).length, 0);
  });

  it('accepts freefall duration', () => {
    assert.equal(errors(validateThreshold('freefall > 0.4s', 's1')).length, 0);
  });

  it('rejects OR operator', () => {
    const r = validateThreshold('accel.x > 1 OR gyro.y > 2', 's1');
    assert.ok(errors(r).some(e => /OR/i.test(e.message)));
  });

  it('rejects parentheses', () => {
    const r = validateThreshold('(accel.x > 1) AND (gyro.y > 2)', 's1');
    assert.ok(errors(r).some(e => /parentheses/i.test(e.message)));
  });

  it('rejects NOT operator', () => {
    const r = validateThreshold('NOT accel.x > 1', 's1');
    assert.ok(errors(r).some(e => /NOT/i.test(e.message)));
  });

  it('rejects arithmetic in threshold', () => {
    const r = validateThreshold('accel.x+accel.y > 5', 's1');
    assert.ok(errors(r).some(e => /arithmetic/i.test(e.message)));
  });

  it('warns on unknown sensor in threshold', () => {
    const r = validateThreshold('proximity > 5', 's1');
    assert.ok(warnings(r).some(w => /unknown sensor/i.test(w.message)));
  });

  it('warns on multiple steady conditions', () => {
    const r = validateThreshold('steady > 1s AND steady > 2s', 's1');
    assert.ok(warnings(r).some(w => /multiple.*steady/i.test(w.message)));
  });

  it('rejects invalid operator', () => {
    const r = validateThreshold('accel.x ~= 5', 's1');
    assert.ok(errors(r).some(e => /operator/i.test(e.message)));
  });
});

// ── SVG spec validation ─────────────────────────────────────────────────────

describe('validateSvgSpec', () => {
  it('accepts valid factory with known opts', () => {
    const r = validateSvgSpec({ factory: 'barGraph', opts: { title: 'Test', data: [] } }, 's1');
    assert.equal(errors(r).length, 0);
  });

  it('rejects unknown factory', () => {
    const r = validateSvgSpec({ factory: 'heatmap3d', opts: {} }, 's1');
    assert.ok(errors(r).some(e => /unknown svg factory/i.test(e.message)));
  });

  it('rejects unknown opts for factory', () => {
    const r = validateSvgSpec({ factory: 'barGraph', opts: { onClick: 'handleClick' } }, 's1');
    assert.ok(errors(r).some(e => /does not accept opt.*onClick/i.test(e.message)));
  });

  it('validates compose layers', () => {
    const r = validateSvgSpec({
      compose: true,
      layers: [
        { factory: 'cartesianGrid', opts: { xMin: -5, xMax: 5 } },
        { factory: 'polygonDynamic', opts: { sides: 6 } }
      ]
    }, 's1');
    assert.equal(errors(r).length, 0);
  });

  it('rejects compose with empty layers', () => {
    const r = validateSvgSpec({ compose: true, layers: [] }, 's1');
    assert.ok(errors(r).some(e => /no layers/i.test(e.message)));
  });

  it('rejects compose layer with unknown factory', () => {
    const r = validateSvgSpec({
      compose: true,
      layers: [{ factory: 'nonexistent', opts: {} }]
    }, 's1');
    assert.ok(errors(r).some(e => /unknown svg factory/i.test(e.message)));
  });

  it('warns on external background URL', () => {
    const r = validateSvgSpec({
      factory: 'arrowMap',
      opts: { background: 'https://example.com/map.png', arrows: [] }
    }, 's1');
    assert.ok(warnings(r).some(w => /external url/i.test(w.message)));
  });

  it('warns on unknown sensor in sensor-capable opt', () => {
    const r = validateSvgSpec({
      factory: 'polygonDynamic',
      opts: { sides: 6, rotateSensor: 'proximity.near' }
    }, 's1');
    assert.ok(warnings(r).some(w => /unknown sensor/i.test(w.message)));
  });

  it('rejects prohibited fn expressions', () => {
    const r = validateSvgSpec({
      factory: 'axis',
      opts: { fn: 'fetch("/api/data").then(r=>r.json())' }
    }, 's1');
    assert.ok(errors(r).some(e => /prohibited/i.test(e.message)));
  });
});

// ── gate validation ─────────────────────────────────────────────────────────

describe('validateGate', () => {
  it('accepts valid gate', () => {
    assert.equal(errors(validateGate({ type: 'quiz', passing_score: 0.8 })).length, 0);
  });

  it('rejects unknown gate type', () => {
    const r = validateGate({ type: 'essay' });
    assert.ok(errors(r).some(e => /unknown gate type/i.test(e.message)));
  });

  it('rejects passing_score out of range', () => {
    const r = validateGate({ type: 'quiz', passing_score: 1.5 });
    assert.ok(errors(r).some(e => /passing_score/i.test(e.message)));
  });
});

// ── integration: full lesson with multiple issue types ──────────────────────

describe('full lesson validation', () => {
  it('catches all issue types in one pass', () => {
    const lesson = {
      version: '1.8.0',
      meta: {
        title: 'Bad Lesson',
        utu: { class: 'MAC-1', band: 8, protocol: 0 },
        declared_features: { blooms_level: 'memorize' }
      },
      gate: { type: 'oral_exam', passing_score: 2.0 },
      steps: [
        { id: 'a', type: 'hardware_trigger', sensor: 'proximity', threshold: 'proximity > 5 OR light < 100' },
        { id: 'a', type: 'instruction', gesture_mode: 'swipe' },
        { id: 'b', type: 'quiz', answer_options: ['Only one'], correct_index: 3 },
        { id: 'c', type: 'ordering', items: ['x', 'y'], correct_order: [0] },
        {
          id: 'd', type: 'instruction',
          svg_spec: { factory: 'interactive3d', opts: { onClick: 'handler' } }
        },
        { id: 'e', type: 'instruction', on_fail: 'skip_to:missing_step' }
      ]
    };

    const r = validateLesson(lesson);
    const errs = errors(r);
    const warns = warnings(r);

    assert.ok(errs.some(e => /band/i.test(e.message)));
    assert.ok(errs.some(e => /protocol/i.test(e.message)));
    assert.ok(errs.some(e => /blooms/i.test(e.message)));
    assert.ok(errs.some(e => /gate type/i.test(e.message)));
    assert.ok(errs.some(e => /passing_score/i.test(e.message)));
    assert.ok(errs.some(e => /OR/i.test(e.message)));
    assert.ok(errs.some(e => /duplicate/i.test(e.message)));
    assert.ok(errs.some(e => /gesture_mode/i.test(e.message)));
    assert.ok(errs.some(e => /at least 2/i.test(e.message)));
    assert.ok(errs.some(e => /out of bounds/i.test(e.message)));
    assert.ok(errs.some(e => /length.*does not match/i.test(e.message)));
    assert.ok(errs.some(e => /unknown svg factory/i.test(e.message)));
    assert.ok(errs.some(e => /does not exist/i.test(e.message)));
    assert.ok(warns.some(w => /on_fail/i.test(w.message)));
    assert.ok(warns.some(w => /unknown sensor.*proximity/i.test(w.message)));
  });
});
