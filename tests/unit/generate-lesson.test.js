'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadPromptStack, extractYamlBlock, mergeYamlFragments } = require('../../scripts/generate-lesson');

describe('loadPromptStack', () => {
  it('loads all prompts from the markdown file', () => {
    const stack = loadPromptStack();
    assert.ok(stack.length >= 11, 'Expected at least 11 blocks (system + 10 prompts), got ' + stack.length);
    assert.ok(stack[0].heading.includes('MASTER'), 'First block should be Master System Prompt');
    assert.ok(stack[0].prompt.includes('AGNI'), 'System prompt should mention AGNI');
  });

  it('each prompt has heading and non-empty content', () => {
    const stack = loadPromptStack();
    for (const block of stack) {
      assert.ok(block.heading.length > 0, 'Heading should not be empty');
      assert.ok(block.prompt.length > 50, 'Prompt should be substantial: ' + block.heading);
    }
  });
});

describe('extractYamlBlock', () => {
  it('extracts from ```yaml fenced block', () => {
    const text = 'Here is the lesson:\n\n```yaml\nversion: "1.8.0"\nmeta:\n  title: Test\n```\n\nDone.';
    const result = extractYamlBlock(text);
    assert.ok(result.includes('version: "1.8.0"'));
    assert.ok(result.includes('title: Test'));
  });

  it('extracts from ```yml fenced block', () => {
    const text = '```yml\nversion: "1.8.0"\nsteps: []\n```';
    assert.ok(extractYamlBlock(text).includes('version'));
  });

  it('extracts from bare ``` block with yaml-like content', () => {
    const text = 'Output:\n```\nversion: "1.8.0"\nsteps:\n  - id: s1\n    type: instruction\n```';
    assert.ok(extractYamlBlock(text).includes('version'));
  });

  it('falls back to inline version: detection', () => {
    const text = 'Some preamble text.\nversion: "1.8.0"\nmeta:\n  title: Inline\nsteps:\n  - id: a\n    type: instruction';
    const result = extractYamlBlock(text);
    assert.ok(result);
    assert.ok(result.startsWith('version:'));
  });

  it('returns null for non-YAML text', () => {
    assert.equal(extractYamlBlock('Just a plain text response with no YAML.'), null);
  });
});

describe('mergeYamlFragments', () => {
  it('merges meta from multiple fragments', () => {
    const result = mergeYamlFragments([
      { meta: { title: 'Test', difficulty: 3 } },
      { meta: { utu: { class: 'MAC-2', band: 3 } } }
    ]);
    assert.equal(result.meta.title, 'Test');
    assert.equal(result.meta.difficulty, 3);
    assert.equal(result.meta.utu.class, 'MAC-2');
  });

  it('merges steps without duplicating IDs', () => {
    const result = mergeYamlFragments([
      { steps: [{ id: 'a', type: 'instruction', content: 'v1' }] },
      { steps: [{ id: 'a', type: 'instruction', content: 'v2' }, { id: 'b', type: 'quiz' }] }
    ]);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps.find(s => s.id === 'a').content, 'v2');
  });

  it('sets default meta fields', () => {
    const result = mergeYamlFragments([{}]);
    assert.equal(result.meta.license, 'CC-BY-SA-4.0');
    assert.equal(result.meta.language, 'en');
    assert.equal(result.version, '1.8.0');
  });

  it('carries ontology through', () => {
    const result = mergeYamlFragments([
      { ontology: { requires: [{ skill: 'a', level: 1 }], provides: [{ skill: 'b', level: 1 }] } }
    ]);
    assert.equal(result.ontology.requires[0].skill, 'a');
    assert.equal(result.ontology.provides[0].skill, 'b');
  });

  it('carries gate through', () => {
    const result = mergeYamlFragments([
      { gate: { type: 'quiz', passing_score: 0.8 } }
    ]);
    assert.equal(result.gate.type, 'quiz');
  });
});
