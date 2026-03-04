'use strict';

const fs = require('fs');
const path = require('path');
const { buildPrompt } = require('./prompt-builder');

const PLAN_PATH = path.join(__dirname, '..', 'output', 'lesson-plan.json');
const PREVIEW_DIR = path.join(__dirname, '..', 'output', 'previews');

/**
 * Dry-run mode: generates prompts for a sample of lessons and writes
 * them to output/previews/ so you can inspect before burning API credits.
 *
 * Usage:
 *   node src/preview.js              — preview first 5 lessons
 *   node src/preview.js 10           — preview first 10
 *   node src/preview.js 0 3          — preview indices 0..2
 *   node src/preview.js --random 5   — preview 5 random lessons
 *   node src/preview.js --id math--3--multiplication-facts--procedural-intake
 */

function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    console.error('No lesson plan found. Run: node src/planner.js first');
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const lessons = plan.lessons;

  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const args = process.argv.slice(2);
  let selected = [];

  if (args.includes('--id')) {
    const targetId = args[args.indexOf('--id') + 1];
    const match = lessons.find(function (l) { return l.lessonId === targetId; });
    if (!match) {
      console.error('Lesson not found: ' + targetId);
      console.log('Try: node src/preview.js --search ' + targetId.split('--').slice(0, 2).join('--'));
      process.exit(1);
    }
    selected = [match];
  } else if (args.includes('--search')) {
    const term = args[args.indexOf('--search') + 1] || '';
    selected = lessons.filter(function (l) {
      return l.lessonId.includes(term) || l.unitTitle.toLowerCase().includes(term.toLowerCase());
    }).slice(0, 10);
    if (selected.length === 0) {
      console.error('No matches for: ' + term);
      process.exit(1);
    }
  } else if (args.includes('--random')) {
    const count = parseInt(args[args.indexOf('--random') + 1]) || 5;
    const shuffled = lessons.slice().sort(function () { return Math.random() - 0.5; });
    selected = shuffled.slice(0, count);
  } else if (args.includes('--subjects')) {
    const seen = {};
    for (const l of lessons) {
      const key = l.subject + '--' + l.grade;
      if (!seen[key]) {
        seen[key] = true;
        selected.push(l);
      }
    }
    selected = selected.slice(0, 20);
  } else {
    const start = parseInt(args[0]) || 0;
    const count = parseInt(args[1]) || 5;
    selected = lessons.slice(start, start + count);
  }

  console.log('Previewing ' + selected.length + ' lesson prompt(s)...\n');

  for (let i = 0; i < selected.length; i++) {
    const spec = selected[i];
    const prompt = buildPrompt(spec);

    const filename = spec.lessonId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.md';
    const filepath = path.join(PREVIEW_DIR, filename);

    const content = [
      '# Prompt Preview: ' + spec.lessonId,
      '',
      '**Subject:** ' + spec.subjectLabel + ' | **Grade:** ' + spec.grade +
        ' | **Archetype:** ' + spec.archetype,
      '**Unit:** ' + spec.unitTitle,
      '**Topics:** ' + spec.topics.join(', '),
      '**SVG factories:** ' + (spec.svgFactories.join(', ') || 'none'),
      '**Sensors:** ' + (spec.sensors.join(', ') || 'none'),
      '',
      '---',
      '',
      '## System Prompt (' + prompt.system.length + ' chars)',
      '',
      prompt.system,
      '',
      '---',
      '',
      '## User Prompt (' + prompt.user.length + ' chars)',
      '',
      prompt.user,
      '',
      '---',
      '',
      'Total prompt size: ~' + Math.round((prompt.system.length + prompt.user.length) / 4) + ' tokens (estimated)'
    ].join('\n');

    fs.writeFileSync(filepath, content);
    console.log('[' + (i + 1) + '] ' + spec.lessonId);
    console.log('    → ' + filepath);
    console.log('    System: ' + prompt.system.length + ' chars, User: ' + prompt.user.length + ' chars');
    console.log('');
  }

  console.log('Previews written to: ' + PREVIEW_DIR);

  // Print lesson plan stats
  const subjects = {};
  const grades = {};
  const archetypes = {};
  for (const l of lessons) {
    subjects[l.subject] = (subjects[l.subject] || 0) + 1;
    grades[l.grade] = (grades[l.grade] || 0) + 1;
    archetypes[l.archetype] = (archetypes[l.archetype] || 0) + 1;
  }
  console.log('\nLesson plan: ' + lessons.length + ' total');
  console.log('By subject: ' + Object.entries(subjects).map(function (e) { return e[0] + '=' + e[1]; }).join(', '));
  console.log('By grade: ' + Object.entries(grades).sort(function (a, b) {
    return (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0);
  }).map(function (e) { return e[0] + '=' + e[1]; }).join(', '));
}

main();
