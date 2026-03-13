'use strict';

const { describe, it, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-sbl-'));
process.env.AGNI_DATA_DIR = TMP_DIR;

const engine = require('@agni/engine');

describe('selectBestLesson integration', () => {
  after(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('returns null for empty candidates', () => {
    const result = engine.selectBestLesson('s1', []);
    assert.equal(result, null);
  });

  it('returns null for undefined candidates', () => {
    const result = engine.selectBestLesson('s1', undefined);
    assert.equal(result, null);
  });

  it('returns a valid candidate from seeded lessons', async () => {
    await engine.seedLessons([
      { lessonId: 'L1', difficulty: 2, skill: 'algebra' },
      { lessonId: 'L2', difficulty: 3, skill: 'geometry' },
      { lessonId: 'L3', difficulty: 4, skill: 'calculus' },
    ]);

    const candidates = ['L1', 'L2', 'L3'];
    const result = engine.selectBestLesson('s-valid', candidates);

    assert.ok(result !== null, 'Should return a lesson');
    assert.ok(candidates.includes(result),
      `Expected one of ${candidates.join(', ')}, got: ${result}`);
  });

  it('respects candidate filtering — only returns from the supplied subset', async () => {
    await engine.seedLessons([
      { lessonId: 'F1', difficulty: 1, skill: 'reading' },
      { lessonId: 'F2', difficulty: 2, skill: 'reading' },
      { lessonId: 'F3', difficulty: 3, skill: 'writing' },
      { lessonId: 'F4', difficulty: 4, skill: 'writing' },
      { lessonId: 'F5', difficulty: 5, skill: 'grammar' },
    ]);

    const allowed = ['F2', 'F4'];

    for (let i = 0; i < 20; i++) {
      const result = engine.selectBestLesson('s-filter', allowed);
      assert.ok(result !== null, 'Should return a lesson');
      assert.ok(allowed.includes(result),
        `Trial ${i}: expected one of ${allowed.join(', ')}, got: ${result}`);
    }
  });

  it('observations shift selection toward higher-gain lessons', async () => {
    const easy = 'OBS-EASY';
    const hard = 'OBS-HARD';
    const student = 's-obs';

    await engine.seedLessons([
      { lessonId: easy, difficulty: 2, skill: 'obs-skill' },
      { lessonId: hard, difficulty: 4, skill: 'obs-skill' },
    ]);

    for (let i = 0; i < 30; i++) {
      await engine.recordObservation(student, easy, [
        { probeId: easy, correct: true },
      ]);
      await engine.recordObservation(student, hard, [
        { probeId: hard, correct: false },
      ]);
    }

    const counts = { [easy]: 0, [hard]: 0 };
    const TRIALS = 50;
    for (let t = 0; t < TRIALS; t++) {
      const pick = engine.selectBestLesson(student, [easy, hard]);
      if (pick) counts[pick]++;
    }

    const total = counts[easy] + counts[hard];
    assert.equal(total, TRIALS, 'Every trial should pick a lesson');

    const dominant = counts[easy] > counts[hard] ? easy : hard;
    const dominantPct = (Math.max(counts[easy], counts[hard]) / TRIALS) * 100;
    assert.ok(dominantPct >= 60,
      `Expected one lesson to dominate (>=60%%), but ${dominant} only got ${dominantPct.toFixed(0)}%% ` +
      `(easy=${counts[easy]}, hard=${counts[hard]}). ` +
      `The model should develop a preference after 60 observations.`);
  });

  it('handles unknown student gracefully', async () => {
    await engine.seedLessons([
      { lessonId: 'UK1', difficulty: 3, skill: 'unknown-test' },
      { lessonId: 'UK2', difficulty: 3, skill: 'unknown-test' },
    ]);

    const result = engine.selectBestLesson('never-seen-student', ['UK1', 'UK2']);
    assert.ok(result !== null, 'Should return a lesson for an unknown student');
    assert.ok(['UK1', 'UK2'].includes(result),
      `Expected UK1 or UK2, got: ${result}`);
  });

  it('works with an ontologyMap providing requires/provides', async () => {
    await engine.seedLessons([
      { lessonId: 'ONT-A', difficulty: 2, skill: 'ont-prereq' },
      { lessonId: 'ONT-B', difficulty: 3, skill: 'ont-mid' },
      { lessonId: 'ONT-C', difficulty: 4, skill: 'ont-advanced' },
    ]);

    const ontologyMap = {
      'ONT-A': { requires: [],              provides: ['ont-prereq'] },
      'ONT-B': { requires: ['ont-prereq'],  provides: ['ont-mid'] },
      'ONT-C': { requires: ['ont-mid'],     provides: ['ont-advanced'] },
    };

    const candidates = ['ONT-A', 'ONT-B', 'ONT-C'];
    const result = engine.selectBestLesson('s-ont', candidates, ontologyMap);

    assert.ok(result !== null, 'Should return a lesson with ontologyMap');
    assert.ok(candidates.includes(result),
      `Expected one of ${candidates.join(', ')}, got: ${result}`);
  });

  it('getStatus reflects seeded lessons and observations', () => {
    const status = engine.getStatus();
    assert.ok(status.lessons > 0, 'Should have seeded lessons');
    assert.ok(status.observations > 0, 'Should have recorded observations');
    assert.ok(typeof status.embeddingDim === 'number');
    assert.ok(typeof status.featureDim === 'number');
    assert.ok(typeof status.topKCandidates === 'number', 'topKCandidates should be in status');
    assert.ok(status.topKCandidates >= 1 && status.topKCandidates <= 2000, 'topKCandidates should be in valid range');
  });

  it('caps candidates to topK — selection only from first 500', async () => {
    const topK = 500;
    const totalCandidates = 550;
    const seedEntries = Array.from({ length: totalCandidates }, (_, i) => ({
      lessonId: 'TK-' + i,
      difficulty: 2,
      skill: 'topk-skill'
    }));
    await engine.seedLessons(seedEntries);
    const candidates = seedEntries.map(e => e.lessonId);
    const firstKSet = new Set(candidates.slice(0, topK));
    for (let t = 0; t < 15; t++) {
      const pick = engine.selectBestLesson('s-topk', candidates);
      assert.ok(firstKSet.has(pick), `Pick ${pick} must be in first ${topK} (topK cap)`);
    }
  });

  it('R1: mergeRemoteSummary is idempotent — duplicate sync skipped', async () => {
    await engine.seedLessons([{ lessonId: 'R1-L', difficulty: 2, skill: 'r1' }]);
    const math = require('../../packages/agni-engine/math');
    const federation = require('../../packages/agni-engine/federation');
    const dim = engine.getStatus().embeddingDim;
    const featureDim = dim * 2;
    const remote = {
      embeddingDim: dim,
      mean: Array(featureDim).fill(0).map((_, i) => i * 0.1),
      precision: math.scaleMat(math.identity(featureDim), 5),
      sampleSize: 10
    };
    federation.addSyncId(remote);
    await engine.mergeRemoteSummary(remote);
    const obsAfterFirst = engine.getStatus().observations;
    await engine.mergeRemoteSummary(remote);
    const obsAfterSecond = engine.getStatus().observations;
    assert.equal(obsAfterFirst, obsAfterSecond,
      'Duplicate merge should skip — observations must not double');
  });

  it('E1: exportBanditSummary throws on invalid state — logs and re-throws (no silent crash)', async () => {
    await engine.seedLessons([{ lessonId: 'E1-L', difficulty: 2, skill: 'e1' }]);
    await engine.recordObservation('s-e1', 'E1-L', [{ probeId: 'E1-L', correct: true }]);
    const status = engine.getStatus();
    const statePath = status.statePath;
    assert.ok(fs.existsSync(statePath), 'State file must exist');
    const raw = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(raw);
    assert.ok(state.bandit.observationCount > 0, 'Need observationCount>0 to skip ensureBanditInitialized');
    const dim = state.bandit.A.length;
    state.bandit.A = state.bandit.A.map(() => Array(dim).fill(0));
    delete state._checksum;  /* omit checksum so loadState skips verification and uses corrupt A */
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    engine.reloadState();
    assert.throws(
      () => engine.exportBanditSummary(),
      /\[FEDERATION\]|\[MATH\].*SPD|Cholesky|not SPD/,
      'exportBanditSummary must throw (and re-throw after logging) on bad state'
    );
  });
});
