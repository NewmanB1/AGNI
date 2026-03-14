'use strict';

const envConfig = require('@agni/utils/env-config');

const PORT = envConfig.thetaPort;
const STUDENT_SESSION_TTL_MS = envConfig.studentSessionTtlMs;
const MIN_RESIDUAL = 0.15;
const MIN_MLC = 0.001;  // Floor for MLC; prevents negative values from BaseCost - CohortDiscount
const MASTERY_THRESHOLD = envConfig.masteryThreshold;
const MIN_CONFIDENCE = 0.5;
const MIN_LOCAL_SAMPLE_SIZE = envConfig.minLocalSample;
const MIN_LOCAL_EDGE_COUNT = envConfig.minLocalEdges;

module.exports = {
  PORT, STUDENT_SESSION_TTL_MS, MIN_RESIDUAL, MIN_MLC, MASTERY_THRESHOLD, MIN_CONFIDENCE,
  MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT
};
