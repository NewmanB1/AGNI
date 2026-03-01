'use strict';

/**
 * Feature flag system for AGNI hub.
 * Stores flags in data/feature_flags.json via loadJSONAsync/saveJSONAsync.
 * Supports rollout percentages with deterministic student assignment.
 *
 * Schema: { flags: { [name]: { enabled, rollout, description, metric? } } }
 */

const path = require('path');
const crypto = require('crypto');
const { loadJSONAsync, saveJSONAsync } = require('./json-store');
const envConfig = require('./env-config');

const FLAGS_PATH = path.join(envConfig.dataDir, 'feature_flags.json');
const DEFAULTS = { flags: {} };

async function loadFlags() {
  return loadJSONAsync(FLAGS_PATH, DEFAULTS);
}

async function saveFlags(data) {
  return saveJSONAsync(FLAGS_PATH, data);
}

async function getFlag(flagName) {
  const data = await loadFlags();
  return (data.flags && data.flags[flagName]) || null;
}

async function setFlag(flagName, flagDef) {
  const data = await loadFlags();
  if (!data.flags) data.flags = {};
  data.flags[flagName] = {
    enabled: !!flagDef.enabled,
    rollout: typeof flagDef.rollout === 'number' ? Math.max(0, Math.min(100, flagDef.rollout)) : 100,
    description: flagDef.description || '',
    metric: flagDef.metric || null
  };
  await saveFlags(data);
  return data.flags[flagName];
}

/**
 * Check if a flag is enabled for a given student.
 * If rollout < 100, uses a deterministic hash of studentId to assign to
 * treatment (returns true) or control (returns false) group.
 */
function isEnabled(flag, studentId) {
  if (!flag || !flag.enabled) return false;
  if (flag.rollout >= 100) return true;
  if (flag.rollout <= 0) return false;
  if (!studentId) return flag.rollout >= 50;

  var hash = crypto.createHash('md5').update(studentId).digest();
  var bucket = hash[0] % 100;
  return bucket < flag.rollout;
}

/**
 * Get all flags that are active for a student, suitable for embedding into LESSON_DATA.
 */
async function getActiveFlagsForStudent(studentId) {
  var data = await loadFlags();
  var active = {};
  var flags = data.flags || {};
  for (var name in flags) {
    if (Object.prototype.hasOwnProperty.call(flags, name)) {
      active[name] = isEnabled(flags[name], studentId);
    }
  }
  return active;
}

/**
 * Register feature flag API endpoints on a router.
 */
function registerRoutes(router, ctx) {
  var adminOnly = ctx.adminOnly;
  var handleJsonBody = ctx.handleJsonBody;
  var loadTelemetryEventsAsync = ctx.loadTelemetryEventsAsync;

  router.get('/api/flags', async function (req, res, opts) {
    var data = await loadFlags();
    return opts.sendResponse(200, data);
  });

  router.put('/api/flags/:name', adminOnly(function (req, res, opts) {
    handleJsonBody(req, opts.sendResponse, async function (payload) {
      var flag = await setFlag(opts.params.name, payload);
      return opts.sendResponse(200, { ok: true, flag: flag });
    });
  }));

  router.get('/api/flags/:name/results', adminOnly(async function (req, res, opts) {
    var flagName = opts.params.name;
    var flag = await getFlag(flagName);
    if (!flag) return opts.sendResponse(404, { error: 'Flag not found' });

    var metric = flag.metric || 'mastery';
    var telData = await loadTelemetryEventsAsync();
    var events = telData.events || [];

    var treatment = { count: 0, total: 0 };
    var control = { count: 0, total: 0 };

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var inTreatment = isEnabled(flag, ev.pseudoId);
      var value = 0;
      if (metric === 'mastery') value = ev.mastery || 0;
      else if (metric === 'completion_rate') value = 1;
      else if (metric === 'frustration_score') value = ev.frustrationTotal || 0;

      if (inTreatment) {
        treatment.count++;
        treatment.total += value;
      } else {
        control.count++;
        control.total += value;
      }
    }

    return opts.sendResponse(200, {
      flag: flagName,
      metric: metric,
      treatment: {
        count: treatment.count,
        avg: treatment.count > 0 ? Math.round((treatment.total / treatment.count) * 1000) / 1000 : 0
      },
      control: {
        count: control.count,
        avg: control.count > 0 ? Math.round((control.total / control.count) * 1000) / 1000 : 0
      }
    });
  }));
}

module.exports = {
  loadFlags:               loadFlags,
  saveFlags:               saveFlags,
  getFlag:                 getFlag,
  setFlag:                 setFlag,
  isEnabled:               isEnabled,
  getActiveFlagsForStudent: getActiveFlagsForStudent,
  registerRoutes:          registerRoutes
};
