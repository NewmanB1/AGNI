'use strict';

const fs = require('fs');
const path = require('path');

const PLAN_PATH = path.join(__dirname, '..', 'output', 'lesson-plan.json');
const REPORTS_DIR = path.join(__dirname, '..', 'output', 'reports');
const JSON_PATH = path.join(REPORTS_DIR, 'preliminary-gaps.json');
const MD_PATH = path.join(REPORTS_DIR, 'preliminary-gaps.md');

/**
 * Generate a preliminary gap analysis from the lesson plan (no generated lessons needed).
 * Analyzes intended coverage, identifies low-coverage capabilities, and surfaces potential gaps.
 */
function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    console.error('No lesson plan found. Run: node src/planner.js');
    process.exit(1);
  }

  const plugins = require('@agni/plugins');
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const lessons = plan.lessons || [];
  const coverage = plan.coverage || {};
  const planGaps = plan.gaps || {};

  const ALL_FACTORIES = Array.from(plugins.getFactoryIds());
  const ALL_SENSORS = Array.from(plugins.getKnownSensorIds());
  const ALL_STEP_TYPES = Array.from(plugins.getValidStepTypes());
  const ARC_DATA = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../data/archetypes.json'), 'utf8')
  );
  const ALL_ARCHETYPES = ARC_DATA.archetypes || ARC_DATA;

  // ── Analyze coverage vs platform ───────────────────────────────────────────

  const lowCoverageThreshold = 5;  // flag if used in fewer than N lessons
  const lowFactory = [];
  const lowSensor = [];
  const lowArchetype = [];
  const factoryNotInPlan = [];
  const sensorNotInPlan = [];

  for (const [id, count] of Object.entries(coverage.factories || {})) {
    if (count === 0) factoryNotInPlan.push(id);
    else if (count < lowCoverageThreshold) lowFactory.push({ id, count });
  }
  for (const f of ALL_FACTORIES) {
    if (!(coverage.factories || {}).hasOwnProperty(f)) factoryNotInPlan.push(f);
  }
  const uniqueFactoryNotInPlan = [...new Set(factoryNotInPlan)];

  for (const [id, count] of Object.entries(coverage.sensors || {})) {
    if (count === 0) sensorNotInPlan.push(id);
    else if (count < lowCoverageThreshold) lowSensor.push({ id, count });
  }
  for (const s of ALL_SENSORS) {
    if (!(coverage.sensors || {}).hasOwnProperty(s)) sensorNotInPlan.push(s);
  }
  const uniqueSensorNotInPlan = [...new Set(sensorNotInPlan)];

  for (const [id, count] of Object.entries(coverage.archetypes || {})) {
    if (count < 3) lowArchetype.push({ id, count });
  }

  // ── Subject/grade distribution ─────────────────────────────────────────────

  const bySubject = {};
  const byGrade = {};
  const sensorLessons = lessons.filter(l => l.sensors && l.sensors.length > 0);
  const sensorLessonsBySubject = {};

  for (const l of lessons) {
    bySubject[l.subject] = (bySubject[l.subject] || 0) + 1;
    byGrade[l.grade] = (byGrade[l.grade] || 0) + 1;
  }
  for (const l of sensorLessons) {
    sensorLessonsBySubject[l.subject] = (sensorLessonsBySubject[l.subject] || 0) + 1;
  }

  // ── Build report object ────────────────────────────────────────────────────

  const report = {
    generated: new Date().toISOString(),
    source: 'lesson-plan.json',
    totalLessons: plan.totalLessons || lessons.length,
    bySubject,
    byGrade,
    sensorLessonCount: sensorLessons.length,
    sensorLessonsBySubject,

    coverage: {
      archetypes: { total: ALL_ARCHETYPES.length, covered: Object.keys(coverage.archetypes || {}).filter(k => (coverage.archetypes[k] || 0) > 0).length },
      factories: { total: ALL_FACTORIES.length, covered: Object.keys(coverage.factories || {}).filter(k => (coverage.factories[k] || 0) > 0).length },
      sensors: { total: ALL_SENSORS.length, covered: Object.keys(coverage.sensors || {}).filter(k => (coverage.sensors[k] || 0) > 0).length },
      stepTypes: { total: ALL_STEP_TYPES.length, covered: Object.keys(coverage.stepTypes || {}).filter(k => (coverage.stepTypes[k] || 0) > 0).length }
    },

    gaps: {
      fromPlanner: planGaps,
      lowCoverageFactories: lowFactory.sort((a, b) => a.count - b.count),
      lowCoverageSensors: lowSensor.sort((a, b) => a.count - b.count),
      lowCoverageArchetypes: lowArchetype.sort((a, b) => a.count - b.count),
      factoriesNotInPlan: uniqueFactoryNotInPlan,
      sensorsNotInPlan: uniqueSensorNotInPlan
    },

    topFactories: Object.entries(coverage.factories || {})
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, count })),

    topSensors: Object.entries(coverage.sensors || {})
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, count }))
  };

  // ── Write JSON ─────────────────────────────────────────────────────────────

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(report, null, 2));
  console.log('Wrote: ' + JSON_PATH);

  // ── Write Markdown ─────────────────────────────────────────────────────────

  let md = '# Preliminary Gap Analysis (from Lesson Plan)\n\n';
  md += 'Generated from `lesson-plan.json` without running the LLM generator.\n';
  md += '**Date:** ' + report.generated + '\n\n';

  md += '## Summary\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += '| Total lessons planned | ' + report.totalLessons + ' |\n';
  md += '| Lessons with sensors | ' + report.sensorLessonCount + ' |\n';
  md += '| Archetypes covered | ' + report.coverage.archetypes.covered + '/' + report.coverage.archetypes.total + ' |\n';
  md += '| Factories covered | ' + report.coverage.factories.covered + '/' + report.coverage.factories.total + ' |\n';
  md += '| Sensors covered | ' + report.coverage.sensors.covered + '/' + report.coverage.sensors.total + ' |\n';
  md += '| Step types covered | ' + report.coverage.stepTypes.covered + '/' + report.coverage.stepTypes.total + ' |\n\n';

  md += '## Lessons by Subject\n\n';
  md += '| Subject | Lessons | Sensor lessons |\n|---------|---------|----------------|\n';
  for (const [subj, count] of Object.entries(bySubject)) {
    md += '| ' + subj + ' | ' + count + ' | ' + (sensorLessonsBySubject[subj] || 0) + ' |\n';
  }
  md += '\n';

  md += '## Top Factories (by planned usage)\n\n';
  for (const f of report.topFactories) {
    md += '- **' + f.id + '**: ' + f.count + ' lessons\n';
  }
  md += '\n';

  md += '## Top Sensors (by planned usage)\n\n';
  for (const s of report.topSensors) {
    md += '- **' + s.id + '**: ' + s.count + ' lessons\n';
  }
  md += '\n';

  md += '## Potential Gaps\n\n';

  if (report.gaps.fromPlanner.uncoveredFactories && report.gaps.fromPlanner.uncoveredFactories.length > 0) {
    md += '### Uncovered Factories (from planner)\n\n';
    report.gaps.fromPlanner.uncoveredFactories.forEach(f => { md += '- ' + f + '\n'; });
    md += '\n';
  }
  if (report.gaps.lowCoverageFactories.length > 0) {
    md += '### Low-Coverage Factories (<' + lowCoverageThreshold + ' lessons)\n\n';
    report.gaps.lowCoverageFactories.forEach(f => { md += '- **' + f.id + '**: ' + f.count + ' lessons\n'; });
    md += '\n';
  }
  if (report.gaps.fromPlanner.uncoveredSensors && report.gaps.fromPlanner.uncoveredSensors.length > 0) {
    md += '### Uncovered Sensors (from planner)\n\n';
    report.gaps.fromPlanner.uncoveredSensors.forEach(s => { md += '- ' + s + '\n'; });
    md += '\n';
  }
  if (report.gaps.lowCoverageSensors.length > 0) {
    md += '### Low-Coverage Sensors (<' + lowCoverageThreshold + ' lessons)\n\n';
    report.gaps.lowCoverageSensors.forEach(s => { md += '- **' + s.id + '**: ' + s.count + ' lessons\n'; });
    md += '\n';
  }
  if (report.gaps.lowCoverageArchetypes.length > 0) {
    md += '### Low-Coverage Archetypes (<3 lessons)\n\n';
    report.gaps.lowCoverageArchetypes.forEach(a => { md += '- **' + a.id + '**: ' + a.count + ' lessons\n'; });
    md += '\n';
  }
  if (report.gaps.factoriesNotInPlan.length > 0 || report.gaps.sensorsNotInPlan.length > 0) {
    md += '### Platform Capabilities Not in Plan\n\n';
    if (report.gaps.factoriesNotInPlan.length > 0) {
      md += 'Factories: ' + report.gaps.factoriesNotInPlan.join(', ') + '\n\n';
    }
    if (report.gaps.sensorsNotInPlan.length > 0) {
      md += 'Sensors: ' + report.gaps.sensorsNotInPlan.join(', ') + '\n\n';
    }
  }

  md += '## Next Steps\n\n';
  md += 'This is a **preliminary** analysis. For full gap analysis (LLM-declared wishes, hallucinated features, accessibility gaps):\n';
  md += '1. Run `node src/runner.js` to generate lessons (requires API key)\n';
  md += '2. Run `node src/gap-report.js` to produce the full gap report\n';

  fs.writeFileSync(MD_PATH, md);
  console.log('Wrote: ' + MD_PATH);

  console.log('\nPreliminary gap analysis complete.');
}

main();
