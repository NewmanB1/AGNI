'use strict';

/**
 * Shared test fixtures for AGNI unit tests.
 * Centralizes lesson factories and common test data to avoid duplication.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Create a minimal valid OLS lesson with sensible defaults.
 * Pass overrides to customize any field.
 */
function minimalLesson(overrides) {
  return {
    version: '1.7.0',
    meta: {
      identifier: 'test-lesson',
      title: 'Test Lesson',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: '2026-01-01T00:00:00.000Z'
    },
    steps: [
      { id: 'step_1', type: 'instruction', content: 'Hello world.' }
    ],
    ...overrides
  };
}

/**
 * Build a lesson with quiz steps for testing quiz validation.
 */
function quizLesson(opts) {
  opts = opts || {};
  return minimalLesson({
    meta: {
      identifier: 'quiz-lesson',
      title: 'Quiz Lesson',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: '2026-01-01T00:00:00.000Z',
      ...(opts.meta || {})
    },
    steps: opts.steps || [
      { id: 'q1', type: 'quiz', content: 'What is 2+2?', answer_options: ['3', '4', '5'], correct_index: 1 },
      { id: 'q2', type: 'quiz', content: 'Capital of France?', answer_options: ['London', 'Paris'], correct_index: 1 }
    ]
  });
}

/**
 * Build a lesson with sensor/hardware_trigger steps.
 */
function sensorLesson(opts) {
  opts = opts || {};
  return minimalLesson({
    meta: {
      identifier: 'sensor-lesson',
      title: 'Sensor Lesson',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: '2026-01-01T00:00:00.000Z'
    },
    steps: opts.steps || [
      { id: 's1', type: 'instruction', content: 'Tilt your phone to the left.' },
      { id: 's2', type: 'hardware_trigger', sensor: 'accelerometer', threshold: 'accel.total > 2.5g' }
    ]
  });
}

/**
 * Build a lesson with equations for testing KaTeX/math inference.
 */
function mathLesson(opts) {
  opts = opts || {};
  return minimalLesson({
    meta: {
      identifier: 'math-lesson',
      title: 'Math Lesson',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: '2026-01-01T00:00:00.000Z'
    },
    steps: opts.steps || [
      { id: 'm1', type: 'instruction', content: 'Solve: $x^2 + 3x + 2 = 0$' },
      { id: 'm2', type: 'instruction', content: 'Now try: $\\sin(\\theta) = 0.5$' }
    ]
  });
}

/**
 * Build a lesson with SVG visual steps.
 */
function svgLesson(opts) {
  opts = opts || {};
  return minimalLesson({
    meta: {
      identifier: 'svg-lesson',
      title: 'SVG Lesson',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: '2026-01-01T00:00:00.000Z'
    },
    steps: opts.steps || [
      { id: 'v1', type: 'svg', svg_spec: { factory: 'barGraph', opts: { values: [3, 7, 2] } } },
      { id: 'v2', type: 'instruction', content: 'Look at the chart above.' }
    ]
  });
}

/**
 * Create an isolated temp directory for test I/O.
 * Returns { dir, cleanup } where cleanup removes the directory.
 */
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-' + (prefix || 'test') + '-'));
  return {
    dir,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/**
 * Sample governance policy for testing compliance checks.
 */
function samplePolicy(overrides) {
  return {
    requireUtu: false,
    requireTeachingMode: false,
    minDifficulty: 1,
    maxDifficulty: 5,
    ...overrides
  };
}

/**
 * Sample lesson sidecar for testing governance and compliance.
 */
function sampleSidecar(overrides) {
  return {
    identifier: 'test-lesson',
    title: 'Test Lesson',
    language: 'en',
    difficulty: 3,
    teaching_mode: 'direct',
    ...overrides
  };
}

module.exports = {
  minimalLesson,
  quizLesson,
  sensorLesson,
  mathLesson,
  svgLesson,
  tempDir,
  samplePolicy,
  sampleSidecar
};
