'use strict';

const envConfig = require('../../../src/utils/env-config');

const PORT = envConfig.thetaPort;
const MIN_RESIDUAL = 0.15;
const MASTERY_THRESHOLD = envConfig.masteryThreshold;
const MIN_CONFIDENCE = 0.5;
const MIN_LOCAL_SAMPLE_SIZE = envConfig.minLocalSample;
const MIN_LOCAL_EDGE_COUNT = envConfig.minLocalEdges;

module.exports = {
  PORT, MIN_RESIDUAL, MASTERY_THRESHOLD, MIN_CONFIDENCE,
  MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT
};
