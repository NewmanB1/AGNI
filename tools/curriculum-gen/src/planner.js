'use strict';

const fs = require('fs');
const path = require('path');
const plugins = require('@agni/plugins');
const taxonomy = require('../taxonomy.json');

const OUT = path.join(__dirname, '..', 'output', 'lesson-plan.json');

const _arcData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../data/archetypes.json'), 'utf8')
);
const ARCHETYPES = _arcData.archetypes || _arcData;

const ALL_FACTORIES = Array.from(plugins.getFactoryIds());
const ALL_SENSORS = Array.from(plugins.getKnownSensorIds());
const ALL_STEP_TYPES = Array.from(plugins.getValidStepTypes());

// ── Assign archetypes to each unit based on grade band ───────────────────────

function archetypesForBand(band) {
  return ARCHETYPES.filter(function (a) {
    return band >= a.bandRange[0] && band <= a.bandRange[1];
  });
}

function pickArchetypes(unit, band) {
  const eligible = archetypesForBand(band);
  if (eligible.length === 0) return [ARCHETYPES[0]];

  const hasSensors = unit.sensorHints && unit.sensorHints.length > 0;

  const preferred = [];
  const others = [];

  for (const a of eligible) {
    const needsSensors = a.stepPattern.some(function (s) { return s.includes('hardware_trigger'); });
    if (hasSensors && needsSensors) preferred.push(a);
    else if (!hasSensors && !needsSensors) preferred.push(a);
    else others.push(a);
  }

  const pool = preferred.length > 0 ? preferred : others.length > 0 ? others : eligible;

  const picked = [];
  const usedIds = new Set();
  const target = Math.min(3, pool.length);
  for (let i = 0; i < target; i++) {
    const a = pool[i % pool.length];
    if (!usedIds.has(a.id)) {
      picked.push(a);
      usedIds.add(a.id);
    }
  }
  return picked;
}

// ── Build the full lesson plan ───────────────────────────────────────────────

const lessons = [];
const coverageTracker = {
  archetypes: {},
  factories: {},
  sensors: {},
  stepTypes: {}
};

ALL_FACTORIES.forEach(function (f) { coverageTracker.factories[f] = 0; });
ALL_SENSORS.forEach(function (s) { coverageTracker.sensors[s] = 0; });
ALL_STEP_TYPES.forEach(function (t) { coverageTracker.stepTypes[t] = 0; });
ARCHETYPES.forEach(function (a) { coverageTracker.archetypes[a.id] = 0; });

for (const [subjectKey, subject] of Object.entries(taxonomy.subjects)) {
  for (const [gradeKey, gradeData] of Object.entries(subject.grades)) {
    for (const unit of gradeData.units) {
      const archetypes = pickArchetypes(unit, gradeData.band);

      for (const archetype of archetypes) {
        const lessonId = [subjectKey, gradeKey, unit.id, archetype.id].join('--');

        const svgFactories = (unit.svgHints || []).filter(function (f) {
          return ALL_FACTORIES.includes(f);
        });
        const sensors = (unit.sensorHints || []).filter(function (s) {
          return ALL_SENSORS.includes(s);
        });

        const lesson = {
          lessonId: lessonId,
          subject: subjectKey,
          subjectLabel: subject.label,
          spinePrefix: subject.spinePrefix,
          grade: gradeKey,
          ageRange: gradeData.ageRange,
          band: gradeData.band,
          unit: unit.id,
          unitTitle: unit.title,
          topics: unit.topics,
          archetype: archetype.id,
          archetypeLabel: archetype.label || archetype.id,
          stepPattern: archetype.stepPattern,
          blooms: archetype.blooms,
          protocols: archetype.protocols,
          thetaModifier: archetype.thetaModifier,
          teachingMode: archetype.teachingMode || 'guided_discovery',
          branchingModel: archetype.branchingModel || 'linear',
          svgFactories: svgFactories,
          sensors: sensors,
          status: 'planned'
        };

        lessons.push(lesson);

        coverageTracker.archetypes[archetype.id] = (coverageTracker.archetypes[archetype.id] || 0) + 1;
        svgFactories.forEach(function (f) { coverageTracker.factories[f]++; });
        sensors.forEach(function (s) { coverageTracker.sensors[s]++; });
        archetype.stepPattern.forEach(function (st) {
          st.split('|').forEach(function (t) {
            if (coverageTracker.stepTypes[t] !== undefined) coverageTracker.stepTypes[t]++;
          });
        });
      }
    }
  }
}

// ── Gap fill: ensure every archetype, factory, and sensor appears ─────────────

const uncoveredArchetypes = ARCHETYPES.filter(function (a) {
  return (coverageTracker.archetypes[a.id] || 0) < 3;
});

for (const arch of uncoveredArchetypes) {
  const band = Math.floor((arch.bandRange[0] + arch.bandRange[1]) / 2);
  const needsSensors = arch.stepPattern.some(function (s) { return s.includes('hardware_trigger'); });

  let bestUnit = null;
  let bestSubject = null;
  let bestGrade = null;

  outer:
  for (const [subjectKey, subject] of Object.entries(taxonomy.subjects)) {
    for (const [gradeKey, gradeData] of Object.entries(subject.grades)) {
      if (gradeData.band !== band && gradeData.band !== band - 1 && gradeData.band !== band + 1) continue;
      for (const unit of gradeData.units) {
        const unitHasSensors = unit.sensorHints && unit.sensorHints.length > 0;
        if (needsSensors && !unitHasSensors) continue;
        bestUnit = unit;
        bestSubject = subjectKey;
        bestGrade = gradeKey;
        break outer;
      }
    }
  }

  if (!bestUnit) continue;

  const target = 3 - (coverageTracker.archetypes[arch.id] || 0);
  for (let n = 0; n < target; n++) {
    const gradeData = taxonomy.subjects[bestSubject].grades[bestGrade];
    const unitIdx = n % gradeData.units.length;
    const unit = gradeData.units[unitIdx];
    const lessonId = [bestSubject, bestGrade, unit.id, arch.id, 'fill' + n].join('--');

    lessons.push({
      lessonId: lessonId,
      subject: bestSubject,
      subjectLabel: taxonomy.subjects[bestSubject].label,
      spinePrefix: taxonomy.subjects[bestSubject].spinePrefix,
      grade: bestGrade,
      ageRange: gradeData.ageRange,
      band: gradeData.band,
      unit: unit.id,
      unitTitle: unit.title,
      topics: unit.topics,
      archetype: arch.id,
      archetypeLabel: arch.name || arch.id,
      stepPattern: arch.stepPattern,
      blooms: arch.blooms,
      protocols: arch.protocols,
      thetaModifier: arch.thetaModifier,
      teachingMode: arch.teachingMode || 'guided_discovery',
      branchingModel: arch.branchingModel || 'linear',
      svgFactories: (unit.svgHints || []).filter(function (f) { return ALL_FACTORIES.includes(f); }),
      sensors: (unit.sensorHints || []).filter(function (s) { return ALL_SENSORS.includes(s); }),
      status: 'planned'
    });

    coverageTracker.archetypes[arch.id] = (coverageTracker.archetypes[arch.id] || 0) + 1;
  }
}

// Fill uncovered factories by adding them to existing lessons' svgHints
const missingFactories = ALL_FACTORIES.filter(function (f) { return (coverageTracker.factories[f] || 0) === 0; });
for (const f of missingFactories) {
  for (let i = lessons.length - 1; i >= 0; i--) {
    if (!lessons[i].svgFactories.includes(f)) {
      lessons[i].svgFactories.push(f);
      coverageTracker.factories[f] = 1;
      break;
    }
  }
}

// Fill uncovered sensors similarly
const missingSensors = ALL_SENSORS.filter(function (s) { return (coverageTracker.sensors[s] || 0) === 0; });
for (const s of missingSensors) {
  for (let i = lessons.length - 1; i >= 0; i--) {
    if (lessons[i].sensors.length > 0 && !lessons[i].sensors.includes(s)) {
      lessons[i].sensors.push(s);
      coverageTracker.sensors[s] = 1;
      break;
    }
  }
}

// ── Gap check: ensure uncovered capabilities get dedicated lessons ────────────

const gaps = {
  uncoveredFactories: [],
  uncoveredSensors: [],
  lowCoverageArchetypes: []
};

for (const [f, count] of Object.entries(coverageTracker.factories)) {
  if (count === 0) gaps.uncoveredFactories.push(f);
}
for (const [s, count] of Object.entries(coverageTracker.sensors)) {
  if (count === 0) gaps.uncoveredSensors.push(s);
}
for (const [a, count] of Object.entries(coverageTracker.archetypes)) {
  if (count < 3) gaps.lowCoverageArchetypes.push({ id: a, count: count });
}

const plan = {
  generated: new Date().toISOString(),
  totalLessons: lessons.length,
  coverage: coverageTracker,
  gaps: gaps,
  lessons: lessons
};

fs.writeFileSync(OUT, JSON.stringify(plan, null, 2));
console.log('Lesson plan generated: ' + lessons.length + ' lessons');
console.log('Output: ' + OUT);
console.log('');
console.log('Coverage summary:');
console.log('  Archetypes: ' + Object.values(coverageTracker.archetypes).filter(function (c) { return c > 0; }).length + '/' + ARCHETYPES.length);
console.log('  Factories:  ' + Object.values(coverageTracker.factories).filter(function (c) { return c > 0; }).length + '/' + ALL_FACTORIES.length);
console.log('  Sensors:    ' + Object.values(coverageTracker.sensors).filter(function (c) { return c > 0; }).length + '/' + ALL_SENSORS.length);
console.log('  Step types: ' + Object.values(coverageTracker.stepTypes).filter(function (c) { return c > 0; }).length + '/' + ALL_STEP_TYPES.length);

if (gaps.uncoveredFactories.length > 0) {
  console.log('\n⚠ Uncovered factories: ' + gaps.uncoveredFactories.join(', '));
}
if (gaps.uncoveredSensors.length > 0) {
  console.log('⚠ Uncovered sensors: ' + gaps.uncoveredSensors.join(', '));
}
if (gaps.lowCoverageArchetypes.length > 0) {
  console.log('⚠ Low-coverage archetypes (<3 lessons): ' + gaps.lowCoverageArchetypes.map(function (a) { return a.id + '(' + a.count + ')'; }).join(', '));
}
