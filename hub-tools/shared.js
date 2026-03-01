'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { loadJSONAsync, saveJSONAsync, getFileMtimeAsync } = require('../src/utils/json-store');
const { createLogger }    = require('../src/utils/logger');
const { readBody, handleJsonBody, createResponseSender, extractBearerToken, safeErrorMessage, checkAuthRateLimit, generateRequestId } = require('../src/utils/http-helpers');
const { computeStreaks, collectReviewDates } = require('../src/utils/streak');

const lmsService       = require('../src/services/lms');
const governanceService = require('../src/services/governance');
const authorService    = require('../src/services/author');
const accountsService  = require('../src/services/accounts');
const lessonChain      = require('../src/services/lessonChain');

const DATA_DIR          = process.env.AGNI_DATA_DIR  || path.join(__dirname, '../data');
const SERVE_DIR         = process.env.AGNI_SERVE_DIR || path.join(__dirname, '../serve');
const MASTERY_SUMMARY   = path.join(DATA_DIR, 'mastery_summary.json');
const BASE_COSTS        = path.join(DATA_DIR, 'base_costs.json');
const LESSON_INDEX      = path.join(DATA_DIR, 'lesson_index.json');
const SCHEDULES         = path.join(DATA_DIR, 'schedules.json');
const CURRICULUM_GRAPH  = path.join(DATA_DIR, 'curriculum.json');
const OVERRIDES_PATH    = path.join(DATA_DIR, 'recommendation_overrides.json');
const GROUPS_PATH       = path.join(DATA_DIR, 'groups.json');
const PARENT_LINKS_PATH = path.join(DATA_DIR, 'parent-links.json');
const REVIEW_SCHEDULE_PATH = path.join(DATA_DIR, 'review_schedule.json');
const LEARNING_PATHS_PATH  = path.join(DATA_DIR, 'learning_paths.json');
const CHECKPOINTS_DIR      = path.join(DATA_DIR, 'checkpoints');
const APPROVED_CATALOG  = process.env.AGNI_APPROVED_CATALOG || path.join(DATA_DIR, 'approved_catalog.json');
const GRAPH_WEIGHTS_LOCAL   = path.join(DATA_DIR, 'graph_weights.json');
const GRAPH_WEIGHTS_REGIONAL = path.join(DATA_DIR, 'graph_weights_regional.json');

const PORT = parseInt(process.env.AGNI_THETA_PORT || '8082', 10);

const MIN_RESIDUAL         = 0.15;
const MASTERY_THRESHOLD    = 0.6;
const MIN_CONFIDENCE       = 0.5;
const MIN_LOCAL_SAMPLE_SIZE = parseInt(process.env.AGNI_MIN_LOCAL_SAMPLE || '40', 10);
const MIN_LOCAL_EDGE_COUNT  = parseInt(process.env.AGNI_MIN_LOCAL_EDGES  || '5', 10);

const log = createLogger('theta');

function createDataAccessors(filePath, defaults, normalize) {
  const loadAsync = async () => {
    const data = await loadJSONAsync(filePath, defaults);
    return normalize ? normalize(data) : data;
  };
  const saveAsync = (data) => saveJSONAsync(filePath, data);
  return { loadAsync, saveAsync };
}

const _mastery    = createDataAccessors(MASTERY_SUMMARY, { students: {} });
const _baseCosts  = createDataAccessors(BASE_COSTS, {});
const _lessonIdx  = createDataAccessors(LESSON_INDEX, []);
const _schedules  = createDataAccessors(SCHEDULES, { students: {} });
const _curriculum = createDataAccessors(CURRICULUM_GRAPH, { graph: {} });
const _overrides  = createDataAccessors(OVERRIDES_PATH, {});
const _groups     = createDataAccessors(GROUPS_PATH, { groups: [] }, d => Array.isArray(d.groups) ? d : { groups: [] });
const _parentLinks = createDataAccessors(PARENT_LINKS_PATH, { links: [], invites: [] }, d => ({
  links: Array.isArray(d.links) ? d.links : [],
  invites: Array.isArray(d.invites) ? d.invites : []
}));

const loadMasterySummaryAsync  = _mastery.loadAsync;
const loadBaseCostsAsync       = _baseCosts.loadAsync;
const loadLessonIndexAsync     = _lessonIdx.loadAsync;
const loadSchedulesAsync       = _schedules.loadAsync;
const loadCurriculumAsync      = _curriculum.loadAsync;
const loadApprovedCatalogAsync = () => governanceService.loadCatalog ? governanceService.loadCatalog() : loadJSONAsync(APPROVED_CATALOG, { lessonIds: [] });

const loadOverridesAsync  = _overrides.loadAsync;
const saveOverridesAsync  = _overrides.saveAsync;

const loadGroupsAsync     = _groups.loadAsync;
const saveGroupsAsync     = async (data) => { const payload = { groups: Array.isArray(data.groups) ? data.groups : [] }; return saveJSONAsync(GROUPS_PATH, payload); };

const loadParentLinksAsync = _parentLinks.loadAsync;
const saveParentLinksAsync = _parentLinks.saveAsync;

function generateGroupId() {
  return 'group-' + Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex');
}

function generateInviteCode() {
  return accountsService.generateCode ? accountsService.generateCode(6) : _randomCode(6);
}

function _randomCode(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const max = Math.floor(256 / chars.length) * chars.length;
  const bytes = crypto.randomBytes(len * 2);
  let result = '';
  for (let i = 0; i < bytes.length && result.length < len; i++) {
    if (bytes[i] < max) result += chars[bytes[i] % chars.length];
  }
  while (result.length < len) {
    const extra = crypto.randomBytes(1);
    if (extra[0] < max) result += chars[extra[0] % chars.length];
  }
  return result;
}

async function requireAdmin(req, qs, sendResponse) {
  const token = extractBearerToken(req, qs);
  const creator = await accountsService.validateSession(token);
  if (!creator) {
    sendResponse(401, { error: 'Authentication required' });
    return null;
  }
  if (!creator.approved && creator.role !== 'admin') {
    sendResponse(403, { error: 'Admin privileges required' });
    return null;
  }
  return creator;
}

/**
 * Middleware: wraps a handler to require admin auth.
 * Injects `creator` into the handler's opts.
 */
function adminOnly(handler) {
  return async (req, res, opts) => {
    const creator = await requireAdmin(req, opts.qs, opts.sendResponse);
    if (!creator) return;
    return handler(req, res, { ...opts, creator });
  };
}

/**
 * Middleware: wraps a handler to require LMS engine availability.
 */
function requireLms(handler) {
  return (req, res, opts) => {
    if (!lmsService.isAvailable || !lmsService.isAvailable()) {
      return opts.sendResponse(503, { error: 'LMS engine not available' });
    }
    return handler(req, res, opts);
  };
}

/**
 * Middleware: wraps a handler with rate limiting keyed by prefix + client IP.
 */
function withRateLimit(keyPrefix, handler) {
  return (req, res, opts) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (checkAuthRateLimit(keyPrefix + ':' + clientIp, opts.sendResponse)) return;
    return handler(req, res, opts);
  };
}

/**
 * Guard: returns the query param value or sends 400 and returns null.
 */
function requireParam(qs, name, sendResponse) {
  if (!qs[name]) {
    sendResponse(400, { error: name + ' required' });
    return null;
  }
  return qs[name];
}

/**
 * Load student skills from mastery summary for a given pseudoId.
 */
async function getStudentSkills(pseudoId) {
  const mastery = await loadJSONAsync(MASTERY_SUMMARY, { students: {} });
  return (mastery.students && mastery.students[pseudoId]) || {};
}

const TELEMETRY_PATH = path.join(DATA_DIR, 'telemetry_events.json');

async function loadTelemetryEventsAsync() {
  return loadJSONAsync(TELEMETRY_PATH, { events: [] });
}

const thetaCache = new Map();

function paginate(items, qs) {
  const total = items.length;
  const limit = Math.max(1, Math.min(1000, parseInt(qs.limit, 10) || total));
  const offset = Math.max(0, parseInt(qs.offset, 10) || 0);
  return { items: items.slice(offset, offset + limit), total, limit, offset };
}

module.exports = {
  fs, path, crypto,
  loadJSONAsync, saveJSONAsync, getFileMtimeAsync,
  log,
  readBody, handleJsonBody, createResponseSender, extractBearerToken,
  safeErrorMessage, checkAuthRateLimit, generateRequestId,
  computeStreaks, collectReviewDates,
  lmsService, governanceService, authorService, accountsService, lessonChain,
  DATA_DIR, SERVE_DIR, PORT,
  MASTERY_SUMMARY, BASE_COSTS, LESSON_INDEX, SCHEDULES, CURRICULUM_GRAPH,
  OVERRIDES_PATH, GROUPS_PATH, PARENT_LINKS_PATH, REVIEW_SCHEDULE_PATH,
  LEARNING_PATHS_PATH, CHECKPOINTS_DIR, APPROVED_CATALOG,
  GRAPH_WEIGHTS_LOCAL, GRAPH_WEIGHTS_REGIONAL,
  MIN_RESIDUAL, MASTERY_THRESHOLD, MIN_CONFIDENCE,
  MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT,
  loadMasterySummaryAsync, loadBaseCostsAsync, loadLessonIndexAsync,
  loadSchedulesAsync, loadCurriculumAsync, loadApprovedCatalogAsync,
  loadOverridesAsync, saveOverridesAsync,
  loadGroupsAsync, saveGroupsAsync,
  loadParentLinksAsync, saveParentLinksAsync,
  generateGroupId, generateInviteCode,
  requireAdmin, adminOnly, requireLms, withRateLimit, requireParam,
  getStudentSkills, TELEMETRY_PATH, loadTelemetryEventsAsync,
  paginate,
  thetaCache
};
