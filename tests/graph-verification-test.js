#!/usr/bin/env node
// tests/graph-verification-test.js
// Phase 1 / Sprint D: Graph verification test — proves θ behaviour.
// Simulates "Weaver Cohort" vs "Farmer Cohort": different mastery inputs
// produce different lesson order (cultural adaptation / skill collapse).
// See docs/SPRINT-NEXT.md and ROADMAP Day 91–95.

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const DATA_DIR = process.env.AGNI_DATA_DIR || path.join(__dirname, '../data');

// Lesson index: two lessons, one benefits from weaving mastery, one from farming.
const LESSON_INDEX = [
  {
    lessonId:       'lesson-loops',
    slug:           'loops',
    title:          'Introduction to Loops',
    difficulty:     2,
    skillsProvided: [{ skill: 'ols.coding:loops', declaredLevel: 1 }],
    skillsRequired: []
  },
  {
    lessonId:       'lesson-modulo',
    slug:           'modulo',
    title:          'Modulo Arithmetic',
    difficulty:     2,
    skillsProvided: [{ skill: 'ols.math:modulo', declaredLevel: 1 }],
    skillsRequired: []
  }
];

// Graph: weaving mastery reduces cost for loops; farming mastery reduces cost for modulo.
const GRAPH_WEIGHTS = {
  version:              '1.0',
  discovered_cohort:    'c_test',
  level:                'village',
  sample_size:          42,
  default_weight:       1,
  weight_estimation_method: 'correlation_based',
  clustering_method:   'jaccard_similarity',
  edges: [
    { from: 'ols.weaving:patterns', to: 'ols.coding:loops', weight: 0.15, confidence: 0.92, sample_size: 40 },
    { from: 'ols.farming:seasons',   to: 'ols.math:modulo',  weight: 0.3,  confidence: 0.75, sample_size: 25 }
  ]
};

const BASE_COSTS = {};
const SCHEDULES = { students: {} };
const CURRICULUM = { graph: {} };

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function runTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-theta-test-'));
  const originalDataDir = process.env.AGNI_DATA_DIR;

  process.env.AGNI_DATA_DIR = tmpDir;
  process.env.AGNI_MIN_LOCAL_EDGES = '1';
  process.env.AGNI_MIN_LOCAL_SAMPLE_SIZE = '1';

  try {
    writeJson(path.join(tmpDir, 'lesson_index.json'), LESSON_INDEX);
    writeJson(path.join(tmpDir, 'graph_weights.json'), GRAPH_WEIGHTS);
    writeJson(path.join(tmpDir, 'base_costs.json'), BASE_COSTS);
    writeJson(path.join(tmpDir, 'schedules.json'), SCHEDULES);
    writeJson(path.join(tmpDir, 'curriculum.json'), CURRICULUM);

    const theta = require('../hub-tools/theta.js');

    // Weaver: high weaving:patterns, low farming:seasons → loops should be cheaper (first).
    writeJson(path.join(tmpDir, 'mastery_summary.json'), {
      students: {
        weaver: {
          'ols.weaving:patterns': 0.9,
          'ols.farming:seasons':  0.2
        }
      }
    });
    const weaverLessons = theta.getLessonsSortedByTheta('weaver');
    const weaverFirst = weaverLessons && weaverLessons.length > 0 ? weaverLessons[0].lessonId : null;

    // Farmer: high farming:seasons, low weaving:patterns → modulo should be cheaper (first).
    writeJson(path.join(tmpDir, 'mastery_summary.json'), {
      students: {
        farmer: {
          'ols.weaving:patterns': 0.2,
          'ols.farming:seasons':  0.9
        }
      }
    });
    const farmerLessons = theta.getLessonsSortedByTheta('farmer');
    const farmerFirst = farmerLessons && farmerLessons.length > 0 ? farmerLessons[0].lessonId : null;

    if (weaverFirst !== 'lesson-loops' || farmerFirst !== 'lesson-modulo') {
      console.error('Graph verification test failed.');
      console.error('Weaver cohort first lesson:', weaverFirst, '(expected lesson-loops)');
      console.error('Farmer cohort first lesson:', farmerFirst, '(expected lesson-modulo)');
      console.error('Weaver thetas:', weaverLessons?.map(l => ({ id: l.lessonId, theta: l.theta })));
      console.error('Farmer thetas:', farmerLessons?.map(l => ({ id: l.lessonId, theta: l.theta })));
      process.exit(1);
    }

    console.log('Graph verification test passed: Weaver first = loops, Farmer first = modulo.');
  } finally {
    process.env.AGNI_DATA_DIR = originalDataDir;
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

runTest();
