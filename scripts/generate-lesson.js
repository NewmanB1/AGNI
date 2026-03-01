#!/usr/bin/env node
'use strict';

/**
 * AGNI Lesson Generator
 *
 * Drives an LLM through the 10-prompt design stack to produce a validated
 * OLS v1.8.0 lesson from a single skill description.
 *
 * Usage:
 *   node scripts/generate-lesson.js "Estimate acceleration magnitude from free-fall"
 *   node scripts/generate-lesson.js --file skill-brief.txt
 *   node scripts/generate-lesson.js --file skill-brief.txt --out lessons/freefall.yaml
 *
 * Environment:
 *   AGNI_LLM_API_URL    Base URL (default: https://api.openai.com/v1)
 *   AGNI_LLM_API_KEY    API key (required)
 *   AGNI_LLM_MODEL      Model name (default: gpt-4o)
 *   AGNI_LLM_PROVIDER   "openai" | "anthropic" (default: openai)
 *   AGNI_LLM_TEMP        Temperature 0.0–1.0 (default: 0.4)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const { validateLesson } = require('../src/utils/lesson-validator');

// ── Config ──────────────────────────────────────────────────────────────────

const API_URL     = process.env.AGNI_LLM_API_URL || 'https://api.openai.com/v1';
const API_KEY     = process.env.AGNI_LLM_API_KEY || '';
const MODEL       = process.env.AGNI_LLM_MODEL   || 'gpt-4o';
const PROVIDER    = process.env.AGNI_LLM_PROVIDER || 'openai';
const TEMPERATURE = parseFloat(process.env.AGNI_LLM_TEMP || '0.4');

// ── Prompt stack ────────────────────────────────────────────────────────────

const PROMPTS_PATH = path.join(__dirname, '..', 'docs', 'prompts', 'lesson-design-stack.md');

function loadPromptStack() {
  const raw = fs.readFileSync(PROMPTS_PATH, 'utf8');
  const blocks = [];
  const codeBlockRe = /^## (.*?)$[\s\S]*?```\n([\s\S]*?)```/gm;
  let match;
  while ((match = codeBlockRe.exec(raw)) !== null) {
    blocks.push({ heading: match[1].trim(), prompt: match[2].trim() });
  }
  return blocks;
}

// ── LLM client ──────────────────────────────────────────────────────────────

function buildOpenAIPayload(messages) {
  return JSON.stringify({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: messages
  });
}

function buildAnthropicPayload(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = messages.filter(m => m.role !== 'system');
  return JSON.stringify({
    model: MODEL,
    max_tokens: 8192,
    temperature: TEMPERATURE,
    system: system || undefined,
    messages: turns
  });
}

function callLLM(messages) {
  return new Promise((resolve, reject) => {
    const isAnthropic = PROVIDER === 'anthropic';
    const urlStr = isAnthropic
      ? (API_URL.replace(/\/v1\/?$/, '') + '/v1/messages')
      : (API_URL.replace(/\/$/, '') + '/chat/completions');
    const url = new URL(urlStr);
    const payload = isAnthropic ? buildAnthropicPayload(messages) : buildOpenAIPayload(messages);

    const headers = { 'Content-Type': 'application/json' };
    if (isAnthropic) {
      headers['x-api-key'] = API_KEY;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = 'Bearer ' + API_KEY;
    }

    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: headers
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(opts, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('LLM API error ' + res.statusCode + ': ' + body.slice(0, 500)));
        }
        try {
          const parsed = JSON.parse(body);
          let text;
          if (isAnthropic) {
            text = (parsed.content && parsed.content[0] && parsed.content[0].text) || '';
          } else {
            text = (parsed.choices && parsed.choices[0] && parsed.choices[0].message &&
                    parsed.choices[0].message.content) || '';
          }
          resolve(text);
        } catch (e) {
          reject(new Error('Failed to parse LLM response: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── YAML extraction ─────────────────────────────────────────────────────────

function extractYamlBlock(text) {
  const yamlBlockRe = /```ya?ml\s*\n([\s\S]*?)```/;
  const match = text.match(yamlBlockRe);
  if (match) return match[1].trim();

  const fenceRe = /```\s*\n([\s\S]*?)```/;
  const fenceMatch = text.match(fenceRe);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    if (candidate.startsWith('version:') || candidate.startsWith('meta:') ||
        candidate.startsWith('steps:') || candidate.startsWith('ontology:')) {
      return candidate;
    }
  }

  if (text.includes('version:') && text.includes('steps:')) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => /^version:\s/.test(l));
    if (start >= 0) return lines.slice(start).join('\n').trim();
  }

  return null;
}

function mergeYamlFragments(fragments) {
  const merged = {
    version: '1.8.0',
    meta: {},
    steps: [],
    ontology: { requires: [], provides: [] }
  };

  for (const frag of fragments) {
    if (!frag) continue;
    if (frag.version) merged.version = frag.version;
    if (frag.meta) Object.assign(merged.meta, frag.meta);
    if (Array.isArray(frag.steps) && frag.steps.length) {
      for (const step of frag.steps) {
        const existing = merged.steps.findIndex(s => s.id === step.id);
        if (existing >= 0) merged.steps[existing] = step;
        else merged.steps.push(step);
      }
    }
    if (frag.ontology) {
      if (Array.isArray(frag.ontology.requires))
        merged.ontology.requires = frag.ontology.requires;
      if (Array.isArray(frag.ontology.provides))
        merged.ontology.provides = frag.ontology.provides;
    }
    if (frag.gate) merged.gate = frag.gate;
    if (frag.fork) merged.fork = frag.fork;
  }

  if (!merged.meta.license) merged.meta.license = 'CC-BY-SA-4.0';
  if (!merged.meta.language) merged.meta.language = 'en';

  return merged;
}

// ── Generator pipeline ──────────────────────────────────────────────────────

async function generateLesson(skillDescription, opts) {
  const { verbose, maxRetries } = Object.assign({ verbose: true, maxRetries: 2 }, opts);

  if (!API_KEY) {
    throw new Error(
      'Set AGNI_LLM_API_KEY environment variable.\n' +
      'Supported providers: openai (default), anthropic.\n' +
      'Set AGNI_LLM_PROVIDER and AGNI_LLM_API_URL as needed.'
    );
  }

  const stack = loadPromptStack();
  if (stack.length < 2) {
    throw new Error('Could not parse prompt stack from ' + PROMPTS_PATH);
  }

  const systemPrompt = stack[0].prompt;
  const designPrompts = stack.slice(1);

  if (verbose) {
    console.log('Model:    ' + MODEL);
    console.log('Provider: ' + PROVIDER);
    console.log('Prompts:  ' + designPrompts.length + ' design phases');
    console.log('Skill:    ' + skillDescription);
    console.log('');
  }

  const conversation = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content:
      'I need you to design a complete OLS v1.8.0 lesson for the following skill:\n\n' +
      skillDescription + '\n\n' +
      'I will walk you through the design prompts one at a time. ' +
      'For each prompt, produce the specified output. When a prompt asks for YAML, ' +
      'wrap it in a ```yaml code block. Build on your previous answers — the lesson ' +
      'must be internally consistent across all prompts.' }
  ];

  const fragments = [];

  for (let i = 0; i < designPrompts.length; i++) {
    const phase = designPrompts[i];
    const phaseLabel = 'Phase ' + (i + 1) + '/' + designPrompts.length;

    if (verbose) process.stdout.write(phaseLabel + ': ' + phase.heading + '... ');

    conversation.push({ role: 'user', content: phase.prompt });

    let response;
    try {
      response = await callLLM(conversation);
    } catch (err) {
      if (verbose) console.log('FAILED');
      throw new Error(phaseLabel + ' LLM call failed: ' + err.message);
    }

    if (verbose) console.log('done (' + response.length + ' chars)');

    conversation.push({ role: 'assistant', content: response });

    const yamlStr = extractYamlBlock(response);
    if (yamlStr) {
      try {
        const parsed = yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA });
        if (parsed && typeof parsed === 'object') fragments.push(parsed);
      } catch (e) {
        if (verbose) console.log('  (YAML parse warning: ' + e.message + ')');
      }
    }
  }

  // ── Assembly prompt ─────────────────────────────────────────────────────

  if (verbose) process.stdout.write('Assembly: generating final YAML... ');

  conversation.push({ role: 'user', content:
    'Now assemble everything into a single, complete OLS v1.8.0 YAML file.\n\n' +
    'Include ALL of:\n' +
    '- version, meta (with utu, declared_features, all fields)\n' +
    '- ontology (requires + provides)\n' +
    '- gate (if applicable)\n' +
    '- ALL steps from prompts 3–7 (observe, measure, fallback, explore, infer, assess)\n' +
    '- fork envelope as a YAML comment block\n\n' +
    'Output ONLY the YAML in a ```yaml block. No prose before or after.'
  });

  let finalResponse;
  try {
    finalResponse = await callLLM(conversation);
  } catch (err) {
    if (verbose) console.log('FAILED');
    throw new Error('Assembly LLM call failed: ' + err.message);
  }
  if (verbose) console.log('done');

  let finalYaml = extractYamlBlock(finalResponse);
  if (!finalYaml) {
    if (verbose) console.log('  (No YAML block in assembly — merging fragments)');
    const merged = mergeYamlFragments(fragments);
    finalYaml = yaml.dump(merged, { lineWidth: 120, noRefs: true, sortKeys: false });
  }

  let lesson;
  try {
    lesson = yaml.load(finalYaml, { schema: yaml.JSON_SCHEMA });
  } catch (e) {
    throw new Error('Final YAML parse failed: ' + e.message);
  }

  // ── Validation ──────────────────────────────────────────────────────────

  if (verbose) console.log('');
  const issues = validateLesson(lesson);
  const errs = issues.filter(i => i.severity === 'error');
  const warns = issues.filter(i => i.severity === 'warning');

  if (errs.length && maxRetries > 0) {
    if (verbose) {
      console.log('Validation found ' + errs.length + ' error(s). Asking LLM to fix...');
    }

    conversation.push({ role: 'assistant', content: finalResponse });
    conversation.push({ role: 'user', content:
      'The lesson has validation errors:\n\n' +
      errs.map(e => '- ' + (e.step ? '[' + e.step + '] ' : '') + e.message).join('\n') + '\n\n' +
      'Fix these errors and output the corrected complete YAML in a ```yaml block.'
    });

    try {
      const fixResponse = await callLLM(conversation);
      const fixYaml = extractYamlBlock(fixResponse);
      if (fixYaml) {
        const fixLesson = yaml.load(fixYaml, { schema: yaml.JSON_SCHEMA });
        const fixIssues = validateLesson(fixLesson);
        const fixErrs = fixIssues.filter(i => i.severity === 'error');

        if (fixErrs.length < errs.length) {
          if (verbose) console.log('Fix reduced errors from ' + errs.length + ' to ' + fixErrs.length);
          lesson = fixLesson;
          finalYaml = fixYaml;
          issues.length = 0;
          issues.push(...fixIssues);
        } else if (verbose) {
          console.log('Fix did not reduce errors — keeping original.');
        }
      }
    } catch (e) {
      if (verbose) console.log('Fix attempt failed: ' + e.message);
    }
  }

  const finalIssues = validateLesson(lesson);
  const finalErrs = finalIssues.filter(i => i.severity === 'error');
  const finalWarns = finalIssues.filter(i => i.severity === 'warning');

  if (verbose) {
    if (finalErrs.length === 0 && finalWarns.length === 0) {
      console.log('✓ Lesson passes all validation checks.');
    } else {
      if (finalErrs.length) {
        console.log('✗ ' + finalErrs.length + ' error(s) remain:');
        finalErrs.forEach(e => console.log('  ERROR ' + (e.step ? '[' + e.step + '] ' : '') + e.message));
      }
      if (finalWarns.length) {
        console.log('⚠ ' + finalWarns.length + ' warning(s):');
        finalWarns.forEach(w => console.log('  WARN  ' + (w.step ? '[' + w.step + '] ' : '') + w.message));
      }
    }
  }

  return {
    yaml: yaml.dump(lesson, { lineWidth: 120, noRefs: true, sortKeys: false }),
    lesson: lesson,
    issues: finalIssues,
    conversation: conversation
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let skillText = '';
  let outPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      skillText = fs.readFileSync(path.resolve(args[++i]), 'utf8').trim();
    } else if (args[i] === '--out' && args[i + 1]) {
      outPath = path.resolve(args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log([
        'AGNI Lesson Generator — LLM-powered lesson authoring',
        '',
        'Usage:',
        '  node scripts/generate-lesson.js "skill description"',
        '  node scripts/generate-lesson.js --file brief.txt --out lesson.yaml',
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

    if (outPath) {
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outPath, result.yaml, 'utf8');
      console.log('\n→ Lesson written to: ' + outPath);
    } else {
      console.log('\n─── Generated Lesson (OLS v1.8.0) ───\n');
      console.log(result.yaml);
    }

    const errs = result.issues.filter(i => i.severity === 'error');
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
