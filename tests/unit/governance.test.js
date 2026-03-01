'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { samplePolicy, sampleSidecar, tempDir } = require('../helpers/fixtures');
const policy = require('../../src/governance/policy');
const { evaluateLessonCompliance } = require('../../src/governance/evaluateLessonCompliance');
const { aggregateCohortCoverage, MASTERY_THRESHOLD } = require('../../src/governance/aggregateCohortCoverage');

// ── validatePolicy ───────────────────────────────────────────────────────────

describe('validatePolicy', () => {
  it('rejects null as invalid policy', () => {
    const r = policy.validatePolicy(null);
    assert.equal(r.valid, false);
  });

  it('accepts an empty object', () => {
    const r = policy.validatePolicy({});
    assert.ok(r.valid);
  });

  it('rejects a non-object as invalid policy', () => {
    const r = policy.validatePolicy('not-an-object');
    assert.equal(r.valid, false);
  });
});

// ── loadPolicy / savePolicy ──────────────────────────────────────────────────

describe('loadPolicy / savePolicy', () => {
  let tmp;

  before(() => { tmp = tempDir('gov'); });
  after(() => { tmp.cleanup(); });

  it('loadPolicy returns empty object for missing file', () => {
    const p = policy.loadPolicy('/nonexistent/path/governance.json');
    assert.deepEqual(p, {});
  });

  it('loadPolicy returns empty object for null path', () => {
    assert.deepEqual(policy.loadPolicy(null), {});
  });

  it('round-trips save and load', () => {
    const fp = path.join(tmp.dir, 'policy.json');
    const data = { requireUtu: true, minDifficulty: 2, maxDifficulty: 4 };
    const saveResult = policy.savePolicy(data, fp);
    assert.ok(saveResult.ok, 'Save failed: ' + (saveResult.error || ''));
    const loaded = policy.loadPolicy(fp);
    assert.equal(loaded.requireUtu, true);
    assert.equal(loaded.minDifficulty, 2);
  });

  it('loadPolicy returns empty object for invalid JSON file', () => {
    const fp = path.join(tmp.dir, 'bad.json');
    fs.writeFileSync(fp, 'not valid json!');
    const p = policy.loadPolicy(fp);
    assert.deepEqual(p, {});
  });
});

// ── evaluateLessonCompliance ─────────────────────────────────────────────────

describe('evaluateLessonCompliance', () => {
  it('returns ok for a compliant lesson with no policy', () => {
    const r = evaluateLessonCompliance(sampleSidecar(), {});
    assert.equal(r.status, 'ok');
    assert.equal(r.issues.length, 0);
  });

  it('returns ok when all policy checks pass', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ difficulty: 3, teaching_mode: 'direct' }),
      samplePolicy({ minDifficulty: 1, maxDifficulty: 5, allowedTeachingModes: ['direct', 'socratic'] })
    );
    assert.equal(r.status, 'ok');
  });

  it('flags difficulty below minimum', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ difficulty: 1 }),
      samplePolicy({ minDifficulty: 3 })
    );
    assert.ok(r.issues.some(i => /below policy minimum/.test(i.message)));
    assert.notEqual(r.status, 'ok');
  });

  it('flags difficulty above maximum', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ difficulty: 5 }),
      samplePolicy({ maxDifficulty: 3 })
    );
    assert.ok(r.issues.some(i => /exceeds policy maximum/.test(i.message)));
  });

  it('flags missing UTU when required', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar(),
      samplePolicy({ requireUtu: true })
    );
    assert.ok(r.issues.some(i => /UTU/.test(i.message)));
  });

  it('flags missing teaching_mode when required', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ teaching_mode: undefined }),
      samplePolicy({ requireTeachingMode: true })
    );
    assert.ok(r.issues.some(i => /teaching_mode/.test(i.message)));
  });

  it('flags disallowed teaching mode', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ teaching_mode: 'narrative' }),
      samplePolicy({ allowedTeachingModes: ['direct', 'socratic'] })
    );
    assert.ok(r.issues.some(i => /not in allowed list/.test(i.message)));
  });

  it('flags protocol below minimum', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'A', protocol: 1 } }),
      samplePolicy({ minProtocol: 3 })
    );
    assert.ok(r.issues.some(i => /below policy minimum/.test(i.message)));
  });

  it('flags protocol above maximum', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'A', protocol: 5 } }),
      samplePolicy({ maxProtocol: 3 })
    );
    assert.ok(r.issues.some(i => /exceeds policy maximum/.test(i.message)));
  });

  it('flags protocol not in allowed list', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'A', protocol: 2 } }),
      samplePolicy({ allowedProtocols: [1, 3, 5] })
    );
    assert.ok(r.issues.some(i => /not in allowed protocols/.test(i.message)));
  });

  it('accepts protocol in allowed list', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'A', protocol: 3 } }),
      samplePolicy({ allowedProtocols: [1, 3, 5] })
    );
    assert.ok(!r.issues.some(i => /protocol/.test(i.message)));
  });

  it('flags missing protocol when policy enforces bounds and requireUtu', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar(),
      samplePolicy({ requireUtu: true, minProtocol: 1, maxProtocol: 5 })
    );
    assert.ok(r.issues.some(i => /protocol/.test(i.message)));
  });

  it('adds failureModeHints when enabled and protocol fails', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'A', protocol: 1 } }),
      samplePolicy({ minProtocol: 3, failureModeHints: true })
    );
    assert.ok(r.issues.some(i => /below policy minimum/.test(i.message)));
  });

  it('returns "fail" status for hard violations', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ difficulty: 1 }),
      samplePolicy({ minDifficulty: 3 })
    );
    assert.equal(r.status, 'fail');
  });

  it('distinguishes "warning" from "fail" status', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ teaching_mode: undefined }),
      samplePolicy({ requireTeachingMode: true })
    );
    assert.ok(r.issues.length > 0);
    assert.notEqual(r.status, 'ok');
  });

  it('issues have structured { message, severity } shape', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ difficulty: 1 }),
      samplePolicy({ minDifficulty: 3 })
    );
    assert.ok(r.issues.length > 0);
    for (const iss of r.issues) {
      assert.equal(typeof iss.message, 'string');
      assert.ok(iss.severity === 'fail' || iss.severity === 'warning');
    }
  });

  it('handles no-policy no-utu lesson without errors', () => {
    const r = evaluateLessonCompliance(sampleSidecar(), null);
    assert.equal(r.status, 'ok');
  });

  it('warns on non-canonical Spine ID (portability check)', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'FAKE-99', band: 1, protocol: 1 } }),
      samplePolicy()
    );
    assert.ok(r.issues.some(i => /not in canonical list/.test(i.message)));
  });

  it('no portability warning for canonical Spine ID', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'MAC-2', band: 3, protocol: 2 } }),
      samplePolicy()
    );
    assert.ok(!r.issues.some(i => /canonical/.test(i.message)));
  });

  it('fails when lesson UTU does not match any policy target', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'MAC-2', band: 3, protocol: 2 } }),
      samplePolicy({
        requireUtu: true,
        utuTargets: [{ class: 'SCI-1', band: 1 }]
      })
    );
    assert.ok(r.issues.some(i => /does not match any policy target/.test(i.message)));
    assert.equal(r.status, 'fail');
  });

  it('passes when lesson UTU matches a policy target', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'MAC-2', band: 3, protocol: 2 } }),
      samplePolicy({
        requireUtu: true,
        utuTargets: [{ class: 'MAC-2', band: 3 }]
      })
    );
    assert.ok(!r.issues.some(i => /does not match/.test(i.message)));
  });

  it('fails when lesson protocol does not match per-target protocol', () => {
    const r = evaluateLessonCompliance(
      sampleSidecar({ utu: { class: 'MAC-2', band: 3, protocol: 4 } }),
      samplePolicy({
        requireUtu: true,
        utuTargets: [{ class: 'MAC-2', band: 3, protocol: 2 }]
      })
    );
    assert.ok(r.issues.some(i => /does not match any policy target/.test(i.message)));
  });
});

// ── aggregateCohortCoverage ──────────────────────────────────────────────────

describe('aggregateCohortCoverage', () => {
  const lessonIndex = [
    {
      lessonId: 'L1',
      utu: { class: 'math', band: 1 },
      skillsProvided: [{ skill: 'ols.math:addition', level: 1 }]
    },
    {
      lessonId: 'L2',
      utu: { class: 'math', band: 1 },
      skillsProvided: [{ skill: 'ols.math:addition', level: 2 }, { skill: 'ols.math:subtraction', level: 1 }]
    },
    {
      lessonId: 'L3',
      utu: { class: 'science' },
      skillsProvided: [{ skill: 'ols.science:plants', level: 1 }]
    }
  ];

  const masterySummary = {
    students: {
      'px-001': { 'ols.math:addition': 0.8, 'ols.math:subtraction': 0.3 },
      'px-002': { 'ols.math:addition': 0.4, 'ols.science:plants': 0.9 },
      'px-003': {}
    }
  };

  it('returns correct structure', () => {
    const r = aggregateCohortCoverage(lessonIndex, masterySummary);
    assert.ok(r.byUtu);
    assert.ok(r.bySkill);
    assert.equal(r.studentCount, 3);
    assert.equal(r.lessonCount, 3);
  });

  it('counts lessons per UTU bucket', () => {
    const r = aggregateCohortCoverage(lessonIndex, masterySummary);
    assert.equal(r.byUtu['math-B1'].lessons, 2);
    assert.equal(r.byUtu['science'].lessons, 1);
  });

  it('counts lessons per skill', () => {
    const r = aggregateCohortCoverage(lessonIndex, masterySummary);
    assert.equal(r.bySkill['ols.math:addition'].lessons, 2);
    assert.equal(r.bySkill['ols.math:subtraction'].lessons, 1);
  });

  it('counts students with mastery above threshold', () => {
    const r = aggregateCohortCoverage(lessonIndex, masterySummary);
    assert.equal(r.bySkill['ols.math:addition'].studentMasteryCount, 1); // only px-001 (0.8)
    assert.equal(r.bySkill['ols.science:plants'].studentMasteryCount, 1); // only px-002 (0.9)
    assert.equal(r.bySkill['ols.math:subtraction'].studentMasteryCount, 0); // px-001 has 0.3
  });

  it('counts UTU bucket mastery', () => {
    const r = aggregateCohortCoverage(lessonIndex, masterySummary);
    assert.equal(r.byUtu['math-B1'].studentMasteryCount, 1); // px-001 mastered addition
    assert.equal(r.byUtu['science'].studentMasteryCount, 1); // px-002 mastered plants
  });

  it('deduplicates skills within UTU bucket', () => {
    const r = aggregateCohortCoverage(lessonIndex, masterySummary);
    const skills = r.byUtu['math-B1'].skills;
    assert.equal(skills.filter(s => s === 'ols.math:addition').length, 1);
  });

  it('handles empty lesson index', () => {
    const r = aggregateCohortCoverage([], { students: {} });
    assert.equal(r.lessonCount, 0);
    assert.equal(r.studentCount, 0);
    assert.deepEqual(r.byUtu, {});
  });

  it('handles lessons with no UTU (falls back to _no_utu)', () => {
    const index = [{ lessonId: 'X', skillsProvided: [{ skill: 'test', level: 1 }] }];
    const r = aggregateCohortCoverage(index, { students: {} });
    assert.ok(r.byUtu['_no_utu']);
  });

  it('exports MASTERY_THRESHOLD constant', () => {
    assert.equal(typeof MASTERY_THRESHOLD, 'number');
    assert.equal(MASTERY_THRESHOLD, 0.6);
  });
});
