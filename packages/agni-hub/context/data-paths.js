'use strict';

const path = require('path');
const envConfig = require('@agni/utils/env-config');

const DATA_DIR             = envConfig.dataDir;
const SERVE_DIR            = envConfig.serveDir;
const MASTERY_SUMMARY      = path.join(DATA_DIR, 'mastery-summary.json');
const BASE_COSTS           = path.join(DATA_DIR, 'base-costs.json');
const LESSON_INDEX         = path.join(DATA_DIR, 'lesson-index.json');
const SCHEDULES            = path.join(DATA_DIR, 'schedules.json');
const CURRICULUM_GRAPH     = path.join(DATA_DIR, 'curriculum.json');
const OVERRIDES_PATH       = path.join(DATA_DIR, 'recommendation-overrides.json');
const GROUPS_PATH          = path.join(DATA_DIR, 'groups.json');
const PARENT_LINKS_PATH    = path.join(DATA_DIR, 'parent-links.json');
const REVIEW_SCHEDULE_PATH = path.join(DATA_DIR, 'review-schedule.json');
const LEARNING_PATHS_PATH  = path.join(DATA_DIR, 'learning-paths.json');
const CHECKPOINTS_DIR      = path.join(DATA_DIR, 'checkpoints');
const APPROVED_CATALOG     = envConfig.approvedCatalog;
const GRAPH_WEIGHTS_LOCAL    = path.join(DATA_DIR, 'graph-weights.json');
const GRAPH_WEIGHTS_REGIONAL = path.join(DATA_DIR, 'graph-weights-regional.json');
const GRAPH_WEIGHTS_MESH     = path.join(DATA_DIR, 'graph-weights-mesh.json');
const COHORT_ASSIGNMENTS     = path.join(DATA_DIR, 'cohort-assignments.json');
const TELEMETRY_PATH       = path.join(DATA_DIR, 'telemetry-events.json');
const SKILL_GRAPH_CYCLES   = path.join(DATA_DIR, 'skill-graph-cycles.json');
const COLLAB_SESSIONS_PATH = path.join(DATA_DIR, 'collab-sessions.json');
const LEADERBOARD_METRICS_PATH = path.join(DATA_DIR, 'leaderboard-metrics.json');

module.exports = {
  DATA_DIR, SERVE_DIR,
  MASTERY_SUMMARY, BASE_COSTS, LESSON_INDEX, SCHEDULES, CURRICULUM_GRAPH,
  OVERRIDES_PATH, GROUPS_PATH, PARENT_LINKS_PATH, REVIEW_SCHEDULE_PATH,
  LEARNING_PATHS_PATH, CHECKPOINTS_DIR, APPROVED_CATALOG,
  GRAPH_WEIGHTS_LOCAL, GRAPH_WEIGHTS_REGIONAL, GRAPH_WEIGHTS_MESH, COHORT_ASSIGNMENTS,
  TELEMETRY_PATH, SKILL_GRAPH_CYCLES, COLLAB_SESSIONS_PATH, LEADERBOARD_METRICS_PATH
};
