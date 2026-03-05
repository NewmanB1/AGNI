#!/usr/bin/env node
'use strict';

/**
 * AGNI Lesson Generator — CLI entry point.
 * Delegates to @agni/lesson-gen.
 */

const fs = require('fs');
const path = require('path');

const { generateLesson, loadPromptStack, extractYamlBlock, mergeYamlFragments } = require('@agni/lesson-gen');

async function main() {
  const args = process.argv.slice(2);
  let skillText = '';
  let outPath = '';
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      skillText = fs.readFileSync(path.resolve(args[++i]), 'utf8').trim();
    } else if (args[i] === '--out' && args[i + 1]) {
      outPath = path.resolve(args[++i]);
    } else if (args[i] === '--json' || args[i] === '--portal') {
      jsonOutput = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log([
        'AGNI Lesson Generator - LLM-powered lesson authoring',
        '',
        'Usage:',
        '  node scripts/generate-lesson.js "skill description"',
        '  node scripts/generate-lesson.js --file brief.txt --out lesson.yaml',
        '  node scripts/generate-lesson.js "skill" --json   # Output JSON for portal Import',
        '',
        'Environment:',
        '  AGNI_LLM_API_KEY     API key (required)',
        '  AGNI_LLM_MODEL       Model name (default: gpt-4o)',
        '  AGNI_LLM_PROVIDER    openai | anthropic (default: openai)',
        '  AGNI_LLM_API_URL     Base URL (default: https://api.openai.com/v1)',
        '  AGNI_LLM_TEMP        Temperature 0.0-1.0 (default: 0.4)',
        '',
        'Options:',
        '  --file <path>   Read skill description from file',
        '  --out <path>    Write generated YAML to file (default: stdout)',
        '  --json, --portal Output JSON for paste into portal Import',
        '  --help          Show this help'
      ].join('\n'));
      process.exit(0);
    } else if (!args[i].startsWith('--')) {
      skillText = args[i];
    }
  }

  if (!skillText) {
    console.error('Error: provide a skill description as an argument or via --file.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('  AGNI Lesson Generator');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  try {
    const result = await generateLesson(skillText);

    if (jsonOutput) {
      const json = JSON.stringify(result.lesson, null, 2);
      if (outPath) {
        const dir = path.dirname(outPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outPath, json, 'utf8');
        console.log('\n-> JSON written to: ' + outPath + ' (paste into portal Import)');
      } else {
        console.log('\n--- Paste into portal: Author -> New -> Import paste ---\n');
        console.log(json);
      }
    } else if (outPath) {
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outPath, result.yaml, 'utf8');
      console.log('\n-> Lesson written to: ' + outPath);
    } else {
      console.log('\n--- Generated Lesson (OLS v1.8.0) ---\n');
      console.log(result.yaml);
    }

    const errs = result.issues.filter(function (i) { return i.severity === 'error'; });
    process.exit(errs.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('\nFatal: ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateLesson, loadPromptStack, extractYamlBlock, mergeYamlFragments };
