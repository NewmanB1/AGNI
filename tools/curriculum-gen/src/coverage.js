'use strict';

const fs = require('fs');
const path = require('path');
const plugins = require('@agni/plugins');

const PROGRESS_PATH = path.join(__dirname, '..', 'output', 'progress.json');
const REPORT_PATH = path.join(__dirname, '..', 'output', 'reports', 'coverage.json');

const ALL_FACTORIES = Array.from(plugins.getFactoryIds());
const ALL_SENSORS = Array.from(plugins.getKnownSensorIds());
const ALL_STEP_TYPES = Array.from(plugins.getValidStepTypes());

const _arcData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../data/archetypes.json'), 'utf8')
);
const ARCHETYPES = _arcData.archetypes || _arcData;

function main() {
  if (!fs.existsSync(PROGRESS_PATH)) {
    console.error('No progress file. Run the generator first.');
    process.exit(1);
  }

  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  const completed = progress.completed || {};

  const coverage = {
    factories: {},
    sensors: {},
    stepTypes: {},
    archetypes: {},
    features: {
      gateCount: 0,
      branchingCount: 0,
      audioDescriptionCount: 0,
      svgDescriptionCount: 0
    }
  };

  ALL_FACTORIES.forEach(function (f) { coverage.factories[f] = { count: 0, lessons: [] }; });
  ALL_SENSORS.forEach(function (s) { coverage.sensors[s] = { count: 0, lessons: [] }; });
  ALL_STEP_TYPES.forEach(function (t) { coverage.stepTypes[t] = { count: 0, lessons: [] }; });
  ARCHETYPES.forEach(function (a) { coverage.archetypes[a.id] = { count: 0, lessons: [] }; });

  for (const [id, data] of Object.entries(completed)) {
    const features = data.features || {};

    const archetypeId = id.split('--').pop();
    if (coverage.archetypes[archetypeId]) {
      coverage.archetypes[archetypeId].count++;
      coverage.archetypes[archetypeId].lessons.push(id);
    }

    (features.factories || []).forEach(function (f) {
      if (coverage.factories[f]) {
        coverage.factories[f].count++;
        coverage.factories[f].lessons.push(id);
      }
    });

    (features.sensors || []).forEach(function (s) {
      if (coverage.sensors[s]) {
        coverage.sensors[s].count++;
        coverage.sensors[s].lessons.push(id);
      }
    });

    (features.stepTypes || []).forEach(function (t) {
      if (coverage.stepTypes[t]) {
        coverage.stepTypes[t].count++;
        coverage.stepTypes[t].lessons.push(id);
      }
    });

    if (features.hasGate) coverage.features.gateCount++;
    if (features.hasBranching) coverage.features.branchingCount++;
    if (features.hasAudioDescription) coverage.features.audioDescriptionCount++;
    if (features.hasSvgDescription) coverage.features.svgDescriptionCount++;
  }

  // Summary
  const totalCompleted = Object.keys(completed).length;
  const uncoveredFactories = ALL_FACTORIES.filter(function (f) { return coverage.factories[f].count === 0; });
  const uncoveredSensors = ALL_SENSORS.filter(function (s) { return coverage.sensors[s].count === 0; });
  const uncoveredStepTypes = ALL_STEP_TYPES.filter(function (t) { return coverage.stepTypes[t].count === 0; });
  const uncoveredArchetypes = ARCHETYPES.filter(function (a) { return coverage.archetypes[a.id].count === 0; }).map(function (a) { return a.id; });

  const report = {
    generated: new Date().toISOString(),
    totalCompleted: totalCompleted,
    totalFailed: Object.keys(progress.failed || {}).length,
    coverage: coverage,
    uncovered: {
      factories: uncoveredFactories,
      sensors: uncoveredSensors,
      stepTypes: uncoveredStepTypes,
      archetypes: uncoveredArchetypes
    },
    coveragePercent: {
      factories: Math.round(((ALL_FACTORIES.length - uncoveredFactories.length) / ALL_FACTORIES.length) * 100),
      sensors: Math.round(((ALL_SENSORS.length - uncoveredSensors.length) / ALL_SENSORS.length) * 100),
      stepTypes: Math.round(((ALL_STEP_TYPES.length - uncoveredStepTypes.length) / ALL_STEP_TYPES.length) * 100),
      archetypes: Math.round(((ARCHETYPES.length - uncoveredArchetypes.length) / ARCHETYPES.length) * 100)
    }
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('Coverage Report');
  console.log('===============');
  console.log('Completed lessons: ' + totalCompleted);
  console.log('Failed lessons:    ' + report.totalFailed);
  console.log('');
  console.log('Factories:  ' + report.coveragePercent.factories + '% (' + (ALL_FACTORIES.length - uncoveredFactories.length) + '/' + ALL_FACTORIES.length + ')');
  console.log('Sensors:    ' + report.coveragePercent.sensors + '% (' + (ALL_SENSORS.length - uncoveredSensors.length) + '/' + ALL_SENSORS.length + ')');
  console.log('Step types: ' + report.coveragePercent.stepTypes + '% (' + (ALL_STEP_TYPES.length - uncoveredStepTypes.length) + '/' + ALL_STEP_TYPES.length + ')');
  console.log('Archetypes: ' + report.coveragePercent.archetypes + '% (' + (ARCHETYPES.length - uncoveredArchetypes.length) + '/' + ARCHETYPES.length + ')');
  console.log('');
  console.log('Features: gates=' + coverage.features.gateCount +
    ', branching=' + coverage.features.branchingCount +
    ', audioDesc=' + coverage.features.audioDescriptionCount +
    ', svgDesc=' + coverage.features.svgDescriptionCount);

  if (uncoveredFactories.length > 0) console.log('\nUncovered factories: ' + uncoveredFactories.join(', '));
  if (uncoveredSensors.length > 0) console.log('Uncovered sensors: ' + uncoveredSensors.join(', '));
  if (uncoveredArchetypes.length > 0) console.log('Uncovered archetypes: ' + uncoveredArchetypes.join(', '));
}

main();
