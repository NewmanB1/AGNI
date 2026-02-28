'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { loadJSON, saveJSON, getFileMtime, loadJSONAsync, saveJSONAsync, getFileMtimeAsync } = require('../src/utils/json-store');
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

const loadMasterySummary  = () => loadJSON(MASTERY_SUMMARY, { students: {} });
const loadBaseCosts       = () => loadJSON(BASE_COSTS, {});
const loadLessonIndex     = () => loadJSON(LESSON_INDEX, []);
const loadSchedules       = () => loadJSON(SCHEDULES, { students: {} });
const loadCurriculum      = () => loadJSON(CURRICULUM_GRAPH, { graph: {} });
const loadApprovedCatalog = () => governanceService.loadCatalog ? governanceService.loadCatalog() : loadJSON(APPROVED_CATALOG, { lessonIds: [] });

const loadMasterySummaryAsync  = () => loadJSONAsync(MASTERY_SUMMARY, { students: {} });
const loadBaseCostsAsync       = () => loadJSONAsync(BASE_COSTS, {});
const loadLessonIndexAsync     = () => loadJSONAsync(LESSON_INDEX, []);
const loadSchedulesAsync       = () => loadJSONAsync(SCHEDULES, { students: {} });
const loadCurriculumAsync      = () => loadJSONAsync(CURRICULUM_GRAPH, { graph: {} });
const loadApprovedCatalogAsync = () => governanceService.loadCatalog ? governanceService.loadCatalog() : loadJSONAsync(APPROVED_CATALOG, { lessonIds: [] });

function loadOverrides() {
  return loadJSON(OVERRIDES_PATH, {});
}
function saveOverrides(overrides) {
  saveJSON(OVERRIDES_PATH, overrides);
}
async function loadOverridesAsync() {
  return loadJSONAsync(OVERRIDES_PATH, {});
}
async function saveOverridesAsync(overrides) {
  return saveJSONAsync(OVERRIDES_PATH, overrides);
}

function loadGroups() {
  const data = loadJSON(GROUPS_PATH, { groups: [] });
  return Array.isArray(data.groups) ? data : { groups: [] };
}
function saveGroups(data) {
  const payload = { groups: Array.isArray(data.groups) ? data.groups : [] };
  saveJSON(GROUPS_PATH, payload);
}
async function loadGroupsAsync() {
  const data = await loadJSONAsync(GROUPS_PATH, { groups: [] });
  return Array.isArray(data.groups) ? data : { groups: [] };
}
async function saveGroupsAsync(data) {
  const payload = { groups: Array.isArray(data.groups) ? data.groups : [] };
  return saveJSONAsync(GROUPS_PATH, payload);
}

function loadParentLinks() {
  const data = loadJSON(PARENT_LINKS_PATH, { links: [], invites: [] });
  return {
    links: Array.isArray(data.links) ? data.links : [],
    invites: Array.isArray(data.invites) ? data.invites : []
  };
}
function saveParentLinks(data) {
  saveJSON(PARENT_LINKS_PATH, data);
}
async function loadParentLinksAsync() {
  const data = await loadJSONAsync(PARENT_LINKS_PATH, { links: [], invites: [] });
  return {
    links: Array.isArray(data.links) ? data.links : [],
    invites: Array.isArray(data.invites) ? data.invites : []
  };
}
async function saveParentLinksAsync(data) {
  return saveJSONAsync(PARENT_LINKS_PATH, data);
}

function generateGroupId() {
  return 'group-' + Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex');
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

function requireAdmin(req, qs, sendResponse) {
  const token = extractBearerToken(req, qs);
  const creator = accountsService.validateSession(token);
  if (!creator) {
    sendResponse(401, { error: 'Authentication required' });
    return null;
  }
  return creator;
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
  loadJSON, saveJSON, getFileMtime,
  loadJSONAsync, saveJSONAsync, getFileMtimeAsync,
  log,
  readBody, handleJsonBody, createResponseSender, extractBearerToken,
  safeErrorMessage, checkAuthRateLimit, generateRequestId,
  computeStreaks, collectReviewDates,
  lmsService, governanceService, authorService, accountsService, lessonChain,
  DATA_DIR, SERVE_DIR, PORT,
  MASTERY_SUMMARY, BASE_COSTS, LESSON_INDEX, SCHEDULES, CURRICULUM_GRAPH,
  OVERRIDES_PATH, GROUPS_PATH, PARENT_LINKS_PATH, REVIEW_SCHEDULE_PATH,
  LEARNING_PATHS_PATH, APPROVED_CATALOG,
  GRAPH_WEIGHTS_LOCAL, GRAPH_WEIGHTS_REGIONAL,
  MIN_RESIDUAL, MASTERY_THRESHOLD, MIN_CONFIDENCE,
  MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT,
  loadMasterySummary, loadBaseCosts, loadLessonIndex, loadSchedules,
  loadCurriculum, loadApprovedCatalog,
  loadMasterySummaryAsync, loadBaseCostsAsync, loadLessonIndexAsync,
  loadSchedulesAsync, loadCurriculumAsync, loadApprovedCatalogAsync,
  loadOverrides, saveOverrides,
  loadOverridesAsync, saveOverridesAsync,
  loadGroups, saveGroups,
  loadGroupsAsync, saveGroupsAsync,
  loadParentLinks, saveParentLinks,
  loadParentLinksAsync, saveParentLinksAsync,
  generateGroupId, generateInviteCode,
  requireAdmin, paginate,
  thetaCache
};
