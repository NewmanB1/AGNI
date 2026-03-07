#!/usr/bin/env node
'use strict';

/**
 * Compile-time DAG validation for the OLS skill prerequisite graph.
 * Detects cycles that would make lessons permanently ineligible at runtime.
 * Use after reboot or when validating data integrity.
 *
 * Reads lesson-index.json and curriculum.json from data dir (or --data-dir).
 * Exit 0 if DAG is valid, 1 if cycles found or error.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadJSON(filePath, fallback) {
  if (fallback === undefined) fallback = null;
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('check-skill-dag: failed to parse', filePath, e.message);
    process.exit(1);
  }
}

function parseArgs() {
  let dataDir = process.env.AGNI_DATA_DIR || path.join(ROOT, 'data');
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--data-dir' && process.argv[i + 1]) {
      dataDir = path.resolve(process.argv[i + 1]);
      i += 1;
    }
  }
  return { dataDir };
}

function main() {
  const { dataDir } = parseArgs();
  const lessonIndexPath = path.join(dataDir, 'lesson-index.json');
  const curriculumPath = path.join(dataDir, 'curriculum.json');

  if (!fs.existsSync(lessonIndexPath)) {
    console.log('check-skill-dag: no lesson-index.json — skipping (nothing to validate)');
    process.exit(0);
  }

  const lessonIndex = loadJSON(lessonIndexPath, []);
  const curriculum = loadJSON(curriculumPath, null);

  if (!Array.isArray(lessonIndex)) {
    console.error('check-skill-dag: lesson-index.json must be an array');
    process.exit(1);
  }

  const { validateSkillDag } = require('@agni/utils/skill-dag-validate');
  const result = validateSkillDag(lessonIndex, curriculum);

  if (result.ok) {
    const skillCount = Object.keys(
      require('@agni/utils/skill-dag-validate').buildSkillGraph(lessonIndex, curriculum)
    ).length;
    console.log('check-skill-dag: OK — skill graph is acyclic (' + skillCount + ' skills)');
    process.exit(0);
  }

  console.error('check-skill-dag: FAIL —', result.message);
  if (result.cycles && result.cycles.length > 0) {
    result.cycles.forEach(function (cycle, i) {
      console.error('  Cycle ' + (i + 1) + ':', cycle.join(' → '));
    });
  }
  process.exit(1);
}

main();
