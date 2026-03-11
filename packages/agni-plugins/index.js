'use strict';

// @agni/plugins — Plugin registry
//
// The single source of truth for what factories, step types, and sensors exist.
// Consumers (validator, portal, browser registry) read from here instead of
// maintaining their own hardcoded copies.
//
// To add a new SVG factory:   require('@agni/plugins').registerFactory({ ... })
// To add a new step type:     require('@agni/plugins').registerStepType({ ... })
// To add a new sensor:        require('@agni/plugins').registerSensor({ ... })

const store = require('./registry');

// ── Load builtins (populates the registry) ──────────────────────────────────

require('./builtins/factories');
require('./builtins/step-types');
require('./builtins/sensors');

// ── Query helpers ───────────────────────────────────────────────────────────

function getFactories() { return store._factories.slice(); }

function getFactory(id) {
  return store._factories.find(function (f) { return f.id === id; }) || null;
}

function getFactoryIds() {
  return new Set(store._factories.map(function (f) { return f.id; }));
}

function getFactoryOpts() {
  const map = {};
  store._factories.forEach(function (f) {
    if (f.opts) map[f.id] = new Set(f.opts);
  });
  return map;
}

function getFactoryCategories() {
  const cats = [], seen = {};
  store._factories.forEach(function (f) {
    if (f.category && !seen[f.category]) { cats.push(f.category); seen[f.category] = true; }
  });
  return cats;
}

function getStepTypes()      { return store._stepTypes.slice(); }
function getValidStepTypes() { return new Set(store._stepTypes.map(function (s) { return s.type; })); }

function getStepType(type) {
  return store._stepTypes.find(function (s) { return s.type === type; }) || null;
}

function getValidStepFields() {
  const fields = new Set();
  store._stepTypes.forEach(function (s) {
    if (s.fields) s.fields.forEach(function (f) { fields.add(f); });
  });
  return fields;
}

function getSensors()        { return store._sensors.slice(); }
function getKnownSensorIds() { return new Set(store._sensors.map(function (s) { return s.id; })); }

function getSensor(id) {
  return store._sensors.find(function (s) { return s.id === id; }) || null;
}

function getSensorGroups() {
  const groups = [], groupMap = {};
  store._sensors.forEach(function (s) {
    const g = s.group || 'Other';
    if (!groupMap[g]) { groupMap[g] = { label: g, sensors: [] }; groups.push(groupMap[g]); }
    groupMap[g].sensors.push(s);
  });
  return groups;
}

// ── Public API ──────────────────────────────────────────────────────────────

module.exports = {
  registerFactory:      store.registerFactory,
  getFactories:         getFactories,
  getFactory:           getFactory,
  getFactoryIds:        getFactoryIds,
  getFactoryOpts:       getFactoryOpts,
  getFactoryCategories: getFactoryCategories,

  registerStepType:     store.registerStepType,
  getStepTypes:         getStepTypes,
  getStepType:          getStepType,
  getValidStepTypes:    getValidStepTypes,
  getValidStepFields:   getValidStepFields,

  registerSensor:       store.registerSensor,
  getSensors:           getSensors,
  getSensor:            getSensor,
  getKnownSensorIds:    getKnownSensorIds,
  getSensorGroups:      getSensorGroups
};
