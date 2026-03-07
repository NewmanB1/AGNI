'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSkillGraph,
  findCycle,
  validateSkillDag
} = require('../../packages/agni-utils/skill-dag-validate');

describe('skill-dag-validate', () => {
  describe('buildSkillGraph', () => {
    it('builds graph from lesson index', () => {
      const index = [
        { skillsProvided: [{ skill: 'A' }], skillsRequired: [] },
        { skillsProvided: [{ skill: 'B' }], skillsRequired: ['A'] }
      ];
      const g = buildSkillGraph(index, null);
      assert.deepEqual([...g.A], []);
      assert.deepEqual([...g.B], ['A']);
    });

    it('uses curriculum.graph when provided', () => {
      const index = [];
      const curriculum = { graph: { X: ['Y'], Y: [] } };
      const g = buildSkillGraph(index, curriculum);
      assert.deepEqual([...g.X], ['Y']);
      assert.deepEqual([...g.Y], []);
    });
  });

  describe('findCycle', () => {
    it('returns null for acyclic graph', () => {
      const g = { A: new Set(), B: new Set(['A']), C: new Set(['B']) };
      assert.equal(findCycle(g), null);
    });

    it('returns cycle when present', () => {
      const g = { A: new Set(['C']), B: new Set(['A']), C: new Set(['B']) };
      const cycle = findCycle(g);
      assert.ok(Array.isArray(cycle));
      assert.ok(cycle.length >= 3);
      assert.ok(cycle.includes('A') && cycle.includes('B') && cycle.includes('C'));
    });
  });

  describe('validateSkillDag', () => {
    it('returns ok for empty index', () => {
      const r = validateSkillDag([], null);
      assert.equal(r.ok, true);
      assert.deepEqual(r.cycles, []);
    });

    it('returns ok for acyclic graph', () => {
      const index = [
        { skillsProvided: [{ skill: 'A' }], skillsRequired: [] },
        { skillsProvided: [{ skill: 'B' }], skillsRequired: ['A'] }
      ];
      const r = validateSkillDag(index, null);
      assert.equal(r.ok, true);
      assert.deepEqual(r.cycles, []);
    });

    it('returns not ok with message for cycle', () => {
      const index = [
        { skillsProvided: [{ skill: 'A' }], skillsRequired: ['C'] },
        { skillsProvided: [{ skill: 'B' }], skillsRequired: ['A'] },
        { skillsProvided: [{ skill: 'C' }], skillsRequired: ['B'] }
      ];
      const r = validateSkillDag(index, null);
      assert.equal(r.ok, false);
      assert.ok(Array.isArray(r.cycles) && r.cycles.length === 1);
      assert.ok(r.message.includes('cycle'));
    });
  });
});
