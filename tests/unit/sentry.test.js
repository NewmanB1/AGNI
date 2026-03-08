'use strict';

/**
 * Unit tests for Sentry analysis logic (packages/agni-hub/sentry-analysis.js).
 * Covers validation, contingency logic, chi-squared, cohort discovery, and output shape.
 */

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');

const sentryAnalysis = require('../../packages/agni-hub/sentry-analysis');

describe('Sentry analysis', function () {

  // ── validateEvent ─────────────────────────────────────────────────────────
  describe('validateEvent', function () {
    const baseEvent = {
      lessonId: 'gravity',
      completedAt: '2026-01-15T10:00:00Z',
      mastery: 0.8,
      steps: []
    };

    it('accepts valid event with object skillsProvided', function () {
      const raw = Object.assign({}, baseEvent, {
        skillsProvided: [{ skill: 'ols:physics:gravity', evidencedLevel: 0.8 }]
      });
      const out = sentryAnalysis.validateEvent(raw, { randomBytes: () => 'abcd', now: () => 12345 });
      assert.ok(out);
      assert.strictEqual(out.lessonId, 'gravity');
      assert.strictEqual(out.mastery, 0.8);
      assert.strictEqual(out.skillsProvided.length, 1);
      assert.strictEqual(out.skillsProvided[0].skill, 'ols:physics:gravity');
      assert.strictEqual(out.skillsProvided[0].evidencedLevel, 0.8);
    });

    it('accepts valid event with string skillsProvided', function () {
      const raw = Object.assign({}, baseEvent, {
        skillsProvided: ['ols:math:add', 'ols:math:subtract']
      });
      const out = sentryAnalysis.validateEvent(raw, { randomBytes: () => 'abcd', now: () => 12345 });
      assert.ok(out);
      assert.strictEqual(out.skillsProvided.length, 2);
      assert.strictEqual(out.skillsProvided[0].skill, 'ols:math:add');
      assert.strictEqual(out.skillsProvided[0].evidencedLevel, 0.8);
    });

    it('rejects missing lessonId', function () {
      const raw = Object.assign({}, baseEvent, { lessonId: undefined });
      assert.strictEqual(sentryAnalysis.validateEvent(raw), null);
    });

    it('rejects invalid mastery (out of range)', function () {
      assert.strictEqual(sentryAnalysis.validateEvent(Object.assign({}, baseEvent, { mastery: -0.1 })), null);
      assert.strictEqual(sentryAnalysis.validateEvent(Object.assign({}, baseEvent, { mastery: 1.5 })), null);
    });

    it('rejects path traversal in lessonId', function () {
      assert.strictEqual(sentryAnalysis.validateEvent(Object.assign({}, baseEvent, { lessonId: '../evil' })), null);
      assert.strictEqual(sentryAnalysis.validateEvent(Object.assign({}, baseEvent, { lessonId: 'foo/bar' })), null);
    });

    it('rejects invalid completedAt', function () {
      assert.strictEqual(sentryAnalysis.validateEvent(Object.assign({}, baseEvent, { completedAt: 'not-a-date' })), null);
    });

    it('rejects steps not array when provided', function () {
      assert.strictEqual(sentryAnalysis.validateEvent(Object.assign({}, baseEvent, { steps: 'x' })), null);
    });

    it('accepts event without steps (steps optional)', function () {
      const raw = Object.assign({}, baseEvent);
      delete raw.steps;
      const out = sentryAnalysis.validateEvent(raw, { randomBytes: () => 'ab', now: () => 1 });
      assert.ok(out);
      assert.ok(Array.isArray(out.steps));
      assert.strictEqual(out.steps.length, 0);
    });
  });

  // ── normalizeSkillsProvided ───────────────────────────────────────────────
  describe('normalizeSkillsProvided', function () {
    it('handles string array', function () {
      const out = sentryAnalysis.normalizeSkillsProvided(['ols:math:a', 'ols:math:b'], 0.7);
      assert.strictEqual(out.length, 2);
      assert.strictEqual(out[0].skill, 'ols:math:a');
      assert.strictEqual(out[0].evidencedLevel, 0.7);
    });

    it('handles object array with evidencedLevel', function () {
      const out = sentryAnalysis.normalizeSkillsProvided(
        [{ skill: 'x', evidencedLevel: 0.9 }], 0.5);
      assert.strictEqual(out[0].skill, 'x');
      assert.strictEqual(out[0].evidencedLevel, 0.9);
    });
  });

  // ── jaccardSimilarity ─────────────────────────────────────────────────────
  describe('jaccardSimilarity', function () {
    it('returns 1 for identical vectors', function () {
      const v = [1, 0, 1, 1];
      assert.strictEqual(sentryAnalysis.jaccardSimilarity(v, v), 1);
    });

    it('returns 0 for disjoint vectors', function () {
      assert.strictEqual(sentryAnalysis.jaccardSimilarity([1, 1, 0, 0], [0, 0, 1, 1]), 0);
    });

    it('returns intersection/union for partial overlap', function () {
      const a = [1, 1, 0];
      const c = [1, 0, 1];
      const sim = sentryAnalysis.jaccardSimilarity(a, c);
      assert.ok(sim > 0 && sim < 1);
    });

    it('returns 1 for empty union (both all zeros)', function () {
      assert.strictEqual(sentryAnalysis.jaccardSimilarity([0, 0], [0, 0]), 1);
    });
  });

  // ── computeConfidence ─────────────────────────────────────────────────────
  describe('computeConfidence', function () {
    it('returns 0 when chi2 below threshold', function () {
      assert.strictEqual(sentryAnalysis.computeConfidence(2, 50, 20), 0);
    });

    it('returns positive when chi2 above threshold', function () {
      const c = sentryAnalysis.computeConfidence(10, 50, 20);
      assert.ok(c > 0);
      assert.ok(c <= 1);
    });
  });

  // ── computeEdgesFromGlobalPairs ───────────────────────────────────────────
  describe('computeEdgesFromGlobalPairs', function () {
    it('produces edges with from, to, weight, confidence, sample_size', function () {
      const pairs = {
        'ols:math:a\x00ols:math:b': { a: 30, b: 5, c: 10, d: 55 }
      };
      const edges = sentryAnalysis.computeEdgesFromGlobalPairs(pairs);
      assert.ok(Array.isArray(edges));
      assert.ok(edges.length >= 1);
      const e = edges[0];
      assert.strictEqual(e.from, 'ols:math:a');
      assert.strictEqual(e.to, 'ols:math:b');
      assert.ok(typeof e.weight === 'number');
      assert.ok(typeof e.confidence === 'number');
      assert.strictEqual(e.sample_size, 100);
    });

    it('skips pairs with n < minSample', function () {
      const pairs = { 'a\x00b': { a: 5, b: 5, c: 5, d: 0 } };
      const edges = sentryAnalysis.computeEdgesFromGlobalPairs(pairs, { minSample: 20 });
      assert.strictEqual(edges.length, 0);
    });
  });

  // ── processOneEvent ───────────────────────────────────────────────────────
  describe('processOneEvent', function () {
    it('updates mastery and contingency counts', function () {
      const mastery = { students: {} };
      const contingencies = {};
      const ev = {
        pseudoId: 'p1',
        mastery: 0.9,
        skillsProvided: [
          { skill: 'ols:math:add', evidencedLevel: 0.9 },
          { skill: 'ols:math:mul', evidencedLevel: 0.9 }
        ]
      };
      sentryAnalysis.processOneEvent(ev, mastery, contingencies);
      assert.ok(mastery.students.p1);
      assert.strictEqual(mastery.students.p1['ols:math:add'], 0.9);
      assert.strictEqual(mastery.students.p1['ols:math:mul'], 0.9);
    });

    it('accumulates contingency when prior skill exists', function () {
      const mastery = { students: { p1: { 'ols:math:add': 0.8 } } };
      const contingencies = {};
      const ev = {
        pseudoId: 'p1',
        mastery: 0.9,
        skillsProvided: [{ skill: 'ols:math:mul', evidencedLevel: 0.9 }]
      };
      sentryAnalysis.processOneEvent(ev, mastery, contingencies);
      const pair = 'ols:math:add\x00ols:math:mul';
      assert.ok(contingencies.p1[pair]);
      assert.ok(contingencies.p1[pair].a + contingencies.p1[pair].b + contingencies.p1[pair].c + contingencies.p1[pair].d >= 1);
    });
  });

  // ── discoverCohort ────────────────────────────────────────────────────────
  describe('discoverCohort', function () {
    it('returns null when too few students', function () {
      const mastery = { students: {} };
      for (let i = 0; i < 10; i++) mastery.students['p' + i] = { 's1': 0.8 };
      assert.strictEqual(sentryAnalysis.discoverCohort(mastery), null);
    });

    it('returns largest cluster when enough students', function () {
      const mastery = { students: {} };
      for (let i = 0; i < 25; i++) {
        mastery.students['p' + i] = { 'ols:math:a': 0.8, 'ols:math:b': 0.7 };
      }
      const result = sentryAnalysis.discoverCohort(mastery, { minVectors: 20, minClusterSize: 20 });
      assert.ok(result);
      assert.ok(result.largest);
      assert.ok(result.largest.members.length >= 20);
    });
  });

  // ── graph output shape (conforms to schema) ──────────────────────────────────
  describe('graph output shape', function () {
    it('computeEdgesFromGlobalPairs produces schema-conformant edges', function () {
      const pairs = {
        'ols:math:fractions\x00ols:math:ratios': { a: 30, b: 5, c: 10, d: 55 }
      };
      const edges = sentryAnalysis.computeEdgesFromGlobalPairs(pairs);
      assert.ok(Array.isArray(edges));
      assert.ok(edges.length >= 1);
      const e = edges[0];
      assert.ok(typeof e.from === 'string' && /^[a-z0-9_.-]+(:[a-z0-9_.-]+)+$/.test(e.from));
      assert.ok(typeof e.to === 'string' && /^[a-z0-9_.-]+(:[a-z0-9_.-]+)+$/.test(e.to));
      assert.ok(typeof e.weight === 'number' && e.weight >= 0 && e.weight <= 1);
      assert.ok(typeof e.confidence === 'number' && e.confidence >= 0 && e.confidence <= 1);
      assert.ok(typeof e.sample_size === 'number' && e.sample_size >= 20);
    });

    it('full graph_weights object has required schema fields', function () {
      const pairs = {
        'ols:physics:gravity\x00ols:physics:acceleration': { a: 25, b: 5, c: 8, d: 62 }
      };
      const edges = sentryAnalysis.computeEdgesFromGlobalPairs(pairs);
      const gw = {
        version: '1.7.0',
        discovered_cohort: 'c_47f9a2b1',
        level: 'village',
        sample_size: 25,
        created_date: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        default_weight: 1.0,
        weight_estimation_method: 'correlation_based',
        clustering_method: 'jaccard_similarity',
        edges,
        metadata: { computation_date: new Date().toISOString(), software_version: 'sentry-agent v1.8.0' }
      };
      assert.ok(gw.version && gw.discovered_cohort && gw.level && gw.sample_size);
      assert.ok(gw.created_date && gw.last_updated);
      assert.ok(gw.weight_estimation_method && gw.clustering_method);
      assert.ok(Array.isArray(gw.edges));
      assert.ok(gw.edges.every(x => x.from && x.to && typeof x.weight === 'number' && typeof x.confidence === 'number' && typeof x.sample_size === 'number'));
    });
  });
});
