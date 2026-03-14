#!/usr/bin/env node
'use strict';

/**
 * CI gate: R8 Phase 2 LMS integration structure.
 * Ensures Kolibri Ricecooker chef and Moodle mod_ols scaffold exist and retain
 * key structure. See docs/playbooks/lms-plugins.md.
 *
 * Exit 0 on pass, 1 on failure.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failed = false;

function fail(msg) {
  console.error('FAIL  ' + msg);
  failed = true;
}

function pass(msg) {
  console.log('OK    ' + msg);
}

// ── Kolibri integration ──────────────────────────────────────────────────────
const kolibriDir = path.join(ROOT, 'integrations', 'kolibri');
const kolibriFiles = [
  'sushichef_ols.py',
  'requirements.txt',
  'build-lessons.sh',
  'README.md'
];

for (const f of kolibriFiles) {
  const p = path.join(kolibriDir, f);
  if (!fs.existsSync(p)) {
    fail('integrations/kolibri/' + f + ' must exist');
  } else {
    pass('integrations/kolibri/' + f);
  }
}

const chefPath = path.join(kolibriDir, 'sushichef_ols.py');
if (fs.existsSync(chefPath)) {
  const chefSrc = fs.readFileSync(chefPath, 'utf8');
  if (!chefSrc.includes('HTML5AppNode')) {
    fail('sushichef_ols.py must use HTML5AppNode');
  } else if (!chefSrc.includes('HTMLZipFile')) {
    fail('sushichef_ols.py must use HTMLZipFile');
  } else if (!chefSrc.includes('create_predictable_zip')) {
    fail('sushichef_ols.py must use create_predictable_zip');
  } else {
    pass('sushichef_ols.py uses HTML5AppNode, HTMLZipFile, create_predictable_zip');
  }
}

// ── Moodle mod_ols ───────────────────────────────────────────────────────────
const modOlsDir = path.join(ROOT, 'integrations', 'moodle-mod_ols');
const modOlsFiles = [
  'version.php',
  'lib.php',
  'view.php',
  'mod_form.php',
  'index.php',
  'db/install.xml',
  'db/access.php',
  'db/services.php',
  'lang/en/ols.php',
  'amd/src/grade_listener.js',
  'classes/external/submit_grade.php'
];

for (const f of modOlsFiles) {
  const p = path.join(modOlsDir, f);
  if (!fs.existsSync(p)) {
    fail('integrations/moodle-mod_ols/' + f + ' must exist');
  } else {
    pass('integrations/moodle-mod_ols/' + f);
  }
}

const gradeListenerPath = path.join(modOlsDir, 'amd', 'src', 'grade_listener.js');
if (fs.existsSync(gradeListenerPath)) {
  const src = fs.readFileSync(gradeListenerPath, 'utf8');
  if (!src.includes('ols.lessonComplete')) {
    fail('grade_listener.js must listen for ols.lessonComplete postMessage');
  } else if (!src.includes('mod_ols_external_submit_grade')) {
    fail('grade_listener.js must call mod_ols_external_submit_grade');
  } else {
    pass('grade_listener.js listens for ols.lessonComplete and submits grade');
  }
}

// ── Docs ─────────────────────────────────────────────────────────────────────
const kolibriGuidePath = path.join(ROOT, 'docs', 'integrations', 'KOLIBRI-PLUGIN-GUIDE.md');
const modOlsGuidePath = path.join(ROOT, 'docs', 'integrations', 'MOODLE-MOD-OLS-GUIDE.md');
if (!fs.existsSync(kolibriGuidePath)) {
  fail('docs/integrations/KOLIBRI-PLUGIN-GUIDE.md must exist');
} else {
  pass('docs/integrations/KOLIBRI-PLUGIN-GUIDE.md');
}
if (!fs.existsSync(modOlsGuidePath)) {
  fail('docs/integrations/MOODLE-MOD-OLS-GUIDE.md must exist');
} else {
  pass('docs/integrations/MOODLE-MOD-OLS-GUIDE.md');
}

if (failed) {
  process.exit(1);
}
process.exit(0);
