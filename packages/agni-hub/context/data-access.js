'use strict';

const { loadJSONAsync, saveJSONAsync, getFileMtimeAsync } = require('@agni/utils/json-store');
const paths = require('./data-paths');

function createDataAccessors(filePath, defaults, normalize) {
  const loadAsync = async () => {
    const data = await loadJSONAsync(filePath, defaults);
    return normalize ? normalize(data) : data;
  };
  const saveAsync = (data) => saveJSONAsync(filePath, data);
  return { loadAsync, saveAsync };
}

const _mastery     = createDataAccessors(paths.MASTERY_SUMMARY, { students: {} });
const _baseCosts   = createDataAccessors(paths.BASE_COSTS, {});
const _lessonIdx   = createDataAccessors(paths.LESSON_INDEX, []);
const _schedules   = createDataAccessors(paths.SCHEDULES, { students: {} });
const _curriculum  = createDataAccessors(paths.CURRICULUM_GRAPH, { graph: {} });
const _overrides   = createDataAccessors(paths.OVERRIDES_PATH, {});
const _groups      = createDataAccessors(paths.GROUPS_PATH, { groups: [] }, d => Array.isArray(d.groups) ? d : { groups: [] });
const _parentLinks = createDataAccessors(paths.PARENT_LINKS_PATH, { links: [], invites: [] }, d => ({
  links: Array.isArray(d.links) ? d.links : [],
  invites: Array.isArray(d.invites) ? d.invites : []
}));

const governanceService = require('./services').governanceService;

const loadMasterySummaryAsync  = _mastery.loadAsync;
const loadBaseCostsAsync       = _baseCosts.loadAsync;
const loadLessonIndexAsync     = _lessonIdx.loadAsync;
const loadSchedulesAsync       = _schedules.loadAsync;
const loadCurriculumAsync      = _curriculum.loadAsync;
const loadApprovedCatalogAsync = () => governanceService.loadCatalog ? governanceService.loadCatalog() : loadJSONAsync(paths.APPROVED_CATALOG, { lessonIds: [] });

const loadOverridesAsync  = _overrides.loadAsync;
const saveOverridesAsync  = _overrides.saveAsync;

const loadGroupsAsync     = _groups.loadAsync;
const saveGroupsAsync     = async (data) => { const payload = { groups: Array.isArray(data.groups) ? data.groups : [] }; return saveJSONAsync(paths.GROUPS_PATH, payload); };

const loadParentLinksAsync = _parentLinks.loadAsync;
const saveParentLinksAsync = _parentLinks.saveAsync;

async function loadTelemetryEventsAsync() {
  return loadJSONAsync(paths.TELEMETRY_PATH, { events: [] });
}

async function getStudentSkills(pseudoId) {
  const mastery = await loadJSONAsync(paths.MASTERY_SUMMARY, { students: {} });
  return (mastery.students && mastery.students[pseudoId]) || {};
}

module.exports = {
  loadJSONAsync, saveJSONAsync, getFileMtimeAsync,
  loadMasterySummaryAsync, loadBaseCostsAsync, loadLessonIndexAsync,
  loadSchedulesAsync, loadCurriculumAsync, loadApprovedCatalogAsync,
  loadOverridesAsync, saveOverridesAsync,
  loadGroupsAsync, saveGroupsAsync,
  loadParentLinksAsync, saveParentLinksAsync,
  loadTelemetryEventsAsync, getStudentSkills
};
