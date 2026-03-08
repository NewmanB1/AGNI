'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { inferFeatures, buildKatexAssetList, collectSpecFactoryIds } = require('../../src/utils/feature-inference');
const { minimalLesson, mathLesson, sensorLesson, svgLesson } = require('../helpers/fixtures');

// ── inferFeatures: basic structure ───────────────────────────────────────────

describe('inferFeatures: result shape', () => {
  it('returns inferredFeatures and metadata_source', () => {
    const result = inferFeatures(minimalLesson());
    assert.ok(result.inferredFeatures);
    assert.ok(typeof result.metadata_source === 'string');
  });

  it('default metadata_source is "inferred"', () => {
    assert.equal(inferFeatures(minimalLesson()).metadata_source, 'inferred');
  });

  it('preserves explicitly set metadata_source', () => {
    const lesson = minimalLesson();
    lesson.metadata_source = 'declared';
    assert.equal(inferFeatures(lesson).metadata_source, 'declared');
  });

  it('includes flags, vark, blooms, difficulty, stepTypeCounts', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.ok(f.flags);
    assert.ok(f.vark);
    assert.ok(typeof f.bloomsCeiling === 'number');
    assert.ok(typeof f.difficulty === 'number');
    assert.ok(f.stepTypeCounts);
  });
});

// ── equation detection ───────────────────────────────────────────────────────

describe('inferFeatures: equations', () => {
  it('detects equations in step content', () => {
    const f = inferFeatures(mathLesson()).inferredFeatures;
    assert.ok(f.flags.has_equations);
  });

  it('detects trig equations', () => {
    const f = inferFeatures(mathLesson()).inferredFeatures;
    assert.ok(f.flags.equation_types.trig, 'Expected trig detection for \\sin');
  });

  it('defaults to algebra when no specific type matches', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction', content: 'Solve $x + 1 = 2$' }]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.ok(f.flags.has_equations);
    assert.ok(f.flags.equation_types.algebra);
  });

  it('does not detect equations in plain text', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.ok(!f.flags.has_equations);
  });
});

// ── sensor detection ─────────────────────────────────────────────────────────

describe('inferFeatures: sensors', () => {
  it('detects hardware_trigger steps', () => {
    const f = inferFeatures(sensorLesson()).inferredFeatures;
    assert.ok(f.flags.has_sensors);
  });

  it('detects sensor keywords in content', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction', content: 'Shake your phone using the accelerometer.' }]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.ok(f.flags.has_sensors);
  });

  it('returns false for non-sensor lessons', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.ok(!f.flags.has_sensors);
  });
});

// ── visual detection ─────────────────────────────────────────────────────────

describe('inferFeatures: visuals', () => {
  it('detects SVG spec factories', () => {
    const f = inferFeatures(svgLesson()).inferredFeatures;
    assert.ok(f.flags.has_visuals || f.flags.has_static_visuals);
  });

  it('does not detect visuals in plain text lesson', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.ok(!f.flags.has_visuals);
  });
});

// ── step type counting ───────────────────────────────────────────────────────

describe('inferFeatures: stepTypeCounts', () => {
  it('counts instruction steps', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.equal(f.stepTypeCounts.instruction, 1);
  });

  it('counts quiz steps', () => {
    const lesson = minimalLesson({
      steps: [
        { id: 'q1', type: 'quiz' },
        { id: 'q2', type: 'quiz' },
        { id: 'i1', type: 'instruction' }
      ]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.equal(f.stepTypeCounts.quiz, 2);
    assert.equal(f.stepTypeCounts.instruction, 1);
  });
});

// ── VARK profile ─────────────────────────────────────────────────────────────

describe('inferFeatures: VARK', () => {
  it('returns numeric vark scores', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.equal(typeof f.vark.visual, 'number');
    assert.equal(typeof f.vark.auditory, 'number');
    assert.equal(typeof f.vark.readWrite, 'number');
    assert.equal(typeof f.vark.kinesthetic, 'number');
  });

  it('detects visual keywords', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction', content: 'Draw a diagram and show the chart and graph.' }]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.ok(f.vark.visual > 0);
  });

  it('detects kinesthetic keywords', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction', content: 'Pick up the object, shake it, and drop it.' }]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.ok(f.vark.kinesthetic > 0);
  });
});

// ── Bloom's taxonomy ─────────────────────────────────────────────────────────

describe('inferFeatures: Blooms', () => {
  it('defaults to level 1 (remember)', () => {
    const lesson = minimalLesson({ steps: [{ id: 's1', type: 'instruction', content: 'Plain text.' }] });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.equal(f.bloomsCeiling, 1);
    assert.equal(f.bloomsLabel, 'remember');
  });

  it('detects higher-order verbs (analyse)', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction', content: 'Compare and contrast the two approaches.' }]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.ok(f.bloomsCeiling >= 4);
  });

  it('detects create level', () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction', content: 'Design and construct your own experiment.' }]
    });
    const f = inferFeatures(lesson).inferredFeatures;
    assert.equal(f.bloomsCeiling, 6);
    assert.equal(f.bloomsLabel, 'create');
  });
});

// ── difficulty ───────────────────────────────────────────────────────────────

describe('inferFeatures: difficulty', () => {
  it('respects explicit difficulty', () => {
    const lesson = minimalLesson();
    lesson.difficulty = 4;
    const f = inferFeatures(lesson).inferredFeatures;
    assert.equal(f.difficulty, 4);
  });

  it('infers difficulty from Blooms ceiling when not explicit', () => {
    const f = inferFeatures(minimalLesson()).inferredFeatures;
    assert.ok(f.difficulty >= 1 && f.difficulty <= 5);
  });
});

// ── buildKatexAssetList ──────────────────────────────────────────────────────

describe('buildKatexAssetList', () => {
  it('starts with katex-core.css and ends with katex-fonts.css', () => {
    const assets = buildKatexAssetList({ algebra: true });
    assert.equal(assets[0], 'katex-core.css');
    assert.equal(assets[assets.length - 1], 'katex-fonts.css');
  });

  it('includes domain-specific CSS for active types', () => {
    const assets = buildKatexAssetList({ trig: true, calculus: true });
    assert.ok(assets.includes('katex-symbols-trig.css'));
    assert.ok(assets.includes('katex-symbols-calculus.css'));
  });

  it('excludes inactive domain CSS', () => {
    const assets = buildKatexAssetList({ algebra: true, trig: false });
    assert.ok(!assets.includes('katex-symbols-trig.css'));
  });
});

// ── collectSpecFactoryIds ────────────────────────────────────────────────────

describe('collectSpecFactoryIds', () => {
  it('extracts factory ids from svg_spec', () => {
    const steps = [
      { id: 's1', type: 'svg', svg_spec: { factory: 'barGraph', opts: {} } },
      { id: 's2', type: 'svg', svg_spec: { factory: 'pieChart', opts: {} } }
    ];
    const ids = collectSpecFactoryIds(steps);
    assert.ok(ids.includes('barGraph'));
    assert.ok(ids.includes('pieChart'));
  });

  it('deduplicates factory ids', () => {
    const steps = [
      { id: 's1', type: 'svg', svg_spec: { factory: 'barGraph' } },
      { id: 's2', type: 'svg', svg_spec: { factory: 'barGraph' } }
    ];
    const ids = collectSpecFactoryIds(steps);
    assert.equal(ids.filter(id => id === 'barGraph').length, 1);
  });

  it('returns empty array for lessons with no specs', () => {
    assert.deepEqual(collectSpecFactoryIds([{ id: 's1', type: 'instruction' }]), []);
  });

  it('handles compose layers', () => {
    const steps = [{
      id: 's1', type: 'svg',
      svg_spec: { compose: true, layers: [{ factory: 'barGraph' }, { factory: 'numberLine' }] }
    }];
    const ids = collectSpecFactoryIds(steps);
    assert.ok(ids.includes('barGraph'));
    assert.ok(ids.includes('numberLine'));
  });
});
