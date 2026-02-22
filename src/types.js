// src/types.js
// AGNI LMS Engine — type documentation
//
// TypeScript interfaces replaced with JSDoc @typedef for IDE autocomplete
// and inline documentation. No runtime behaviour — this file is a reference
// only and does not need to be require()'d by other modules.
//
// Target: Node.js 14+. CommonJS. No ES6+ beyond what Node 14 supports.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * @typedef {number[]} Vector
 */

/**
 * @typedef {number[][]} Matrix
 */

/**
 * Student ability state (Rasch model)
 * @typedef {object} StudentRasch
 * @property {number}  ability   logit-scale ability estimate
 * @property {number}  variance  approximate posterior variance
 * @property {string}  [lastSeen] ISO 8601 timestamp (optional)
 */

/**
 * Calibration probe / item
 * @typedef {object} Probe
 * @property {number} difficulty
 * @property {string} skill
 */

/**
 * Embedding vector entity (student or lesson)
 * @typedef {object} EmbeddingEntity
 * @property {Vector}  vector
 * @property {string}  [authorId]  for future reputation-based shrinkage
 */

/**
 * Sufficient statistics for linear Thompson Sampling
 * @typedef {object} BanditState
 * @property {Matrix} A                design matrix (X'X form)
 * @property {Vector} b                X'y form
 * @property {number} featureDim
 * @property {number} forgetting
 * @property {number} observationCount
 */

/**
 * Full persisted engine state (JSON-serializable)
 * @typedef {object} LMSState
 * @property {{ students: Object.<string,StudentRasch>, probes: Object.<string,Probe>, globalAnchor: {meanAbility:number,stdAbility:number} }} rasch
 * @property {{ dim:number, lr:number, reg:number, forgetting:number, students:Object.<string,EmbeddingEntity>, lessons:Object.<string,EmbeddingEntity> }} embedding
 * @property {BanditState} bandit
 */

/**
 * Exported summary for federation sync
 * @typedef {object} BanditSummary
 * @property {Vector} mean
 * @property {Matrix} precision  inverse covariance (Σ⁻¹)
 * @property {number} sampleSize
 */

module.exports = {};
