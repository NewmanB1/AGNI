'use strict';

/**
 * Factory for building clean LMSState objects for engine tests.
 * Avoids coupling test setup to the full engine/index.js boot path.
 */

/**
 * Create a minimal valid LMSState.
 * @param {object} [overrides]
 * @param {number} [overrides.dim=4] embedding dimension (small for fast tests)
 */
function createState(overrides) {
  overrides = overrides || {};
  const dim = overrides.dim || 4;
  const featureDim = dim * 2;

  return {
    rasch: {
      students: {},
      probes: {},
      globalAnchor: { meanAbility: 0, stdAbility: 1 }
    },
    embedding: {
      dim: dim,
      lr: 0.01,
      reg: 0.001,
      forgetting: 0.98,
      students: {},
      lessons: {}
    },
    bandit: {
      A: null,
      b: null,
      featureDim: featureDim,
      forgetting: 0.98,
      observationCount: 0
    },
    markov: {
      transitions: {},
      studentHistory: {}
    }
  };
}

/**
 * Seed some probes (lessons with known difficulties) into a state.
 */
function seedProbes(state, probes) {
  for (const [id, difficulty, skill] of probes) {
    state.rasch.probes[id] = { difficulty, skill: skill || '' };
    state.embedding.lessons[id] = { vector: null };
  }
}

module.exports = { createState, seedProbes };
