'use strict';

/**
 * @agni/lesson-gen — LLM-powered OLS lesson generation.
 * Uses prompt stack from docs/prompts/lesson-design-stack.md (relative to monorepo root).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const yaml = require('js-yaml');
const { validateLesson } = require('@ols/schema/lesson-validator');

const API_URL = process.env.AGNI_LLM_API_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.AGNI_LLM_API_KEY || '';
const MODEL = process.env.AGNI_LLM_MODEL || 'gpt-4o';
const PROVIDER = process.env.AGNI_LLM_PROVIDER || 'openai';
const TEMPERATURE = parseFloat(process.env.AGNI_LLM_TEMP || '0.4');

const PROMPTS_PATH = path.join(__dirname, '..', '..', 'docs', 'prompts', 'lesson-design-stack.md');

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

function buildOpenAIPayload(messages) {
  return JSON.stringify({
    model: MODEL,
    temperature: TEMPERATURE,
    messages: messages
  });
}

function buildAnthropicPayload(messages) {
  const system = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n\n');
  const turns = messages.filter(function (m) { return m.role !== 'system'; });
  return JSON.stringify({
    model: MODEL,
    max_tokens: 8192,
    temperature: TEMPERATURE,
    system: system || undefined,
    messages: turns
  });
}

function callLLM(messages) {
  return new Promise(function (resolve, reject) {
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
    const req = transport.request(opts, function (res) {
      let body = '';
      res.on('data', function (d) { body += d; });
      res.on('end', function () {
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

  if (text.indexOf('version:') !== -1 && text.indexOf('steps:') !== -1) {
    const lines = text.split('\n');
    const start = lines.findIndex(function (l) { return /^version:\s/.test(l); });
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

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    if (!frag) continue;
    if (frag.version) merged.version = frag.version;
    if (frag.meta) Object.assign(merged.meta, frag.meta);
    if (Array.isArray(frag.steps) && frag.steps.length) {
      for (let j = 0; j < frag.steps.length; j++) {
        const step = frag.steps[j];
        const existing = merged.steps.findIndex(function (s) { return s.id === step.id; });
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

async function generateLesson(skillDescription, opts) {
  opts = opts || {};
  const verbose = opts.verbose !== false;
  const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : 2;

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

  let issues = validateLesson(lesson);
  let errs = issues.filter(function (i) { return i.severity === 'error'; });
  const warns = issues.filter(function (i) { return i.severity === 'warning'; });

  if (errs.length && maxRetries > 0) {
    if (verbose) {
      console.log('Validation found ' + errs.length + ' error(s). Asking LLM to fix...');
    }

    conversation.push({ role: 'assistant', content: finalResponse });
    conversation.push({ role: 'user', content:
      'The lesson has validation errors:\n\n' +
      errs.map(function (e) { return '- ' + (e.step ? '[' + e.step + '] ' : '') + e.message; }).join('\n') + '\n\n' +
      'Fix these errors and output the corrected complete YAML in a ```yaml block.'
    });

    try {
      const fixResponse = await callLLM(conversation);
      const fixYaml = extractYamlBlock(fixResponse);
      if (fixYaml) {
        const fixLesson = yaml.load(fixYaml, { schema: yaml.JSON_SCHEMA });
        const fixIssues = validateLesson(fixLesson);
        const fixErrs = fixIssues.filter(function (i) { return i.severity === 'error'; });

        if (fixErrs.length < errs.length) {
          if (verbose) console.log('Fix reduced errors from ' + errs.length + ' to ' + fixErrs.length);
          lesson = fixLesson;
          finalYaml = fixYaml;
          issues = fixIssues;
        } else if (verbose) {
          console.log('Fix did not reduce errors — keeping original.');
        }
      }
    } catch (e) {
      if (verbose) console.log('Fix attempt failed: ' + e.message);
    }
  }

  const finalIssues = validateLesson(lesson);
  const finalErrs = finalIssues.filter(function (i) { return i.severity === 'error'; });
  const finalWarns = finalIssues.filter(function (i) { return i.severity === 'warning'; });

  if (verbose) {
    if (finalErrs.length === 0 && finalWarns.length === 0) {
      console.log('✓ Lesson passes all validation checks.');
    } else {
      if (finalErrs.length) {
        console.log('✗ ' + finalErrs.length + ' error(s) remain:');
        finalErrs.forEach(function (e) {
          console.log('  ERROR ' + (e.step ? '[' + e.step + '] ' : '') + e.message);
        });
      }
      if (finalWarns.length) {
        console.log('⚠ ' + finalWarns.length + ' warning(s):');
        finalWarns.forEach(function (w) {
          console.log('  WARN  ' + (w.step ? '[' + w.step + '] ' : '') + w.message);
        });
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

module.exports = {
  generateLesson: generateLesson,
  loadPromptStack: loadPromptStack,
  extractYamlBlock: extractYamlBlock,
  mergeYamlFragments: mergeYamlFragments
};
