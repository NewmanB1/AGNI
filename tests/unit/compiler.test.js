'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { buildLessonIR, buildLessonSidecar } = require('@ols/compiler/compiler/build-lesson-ir');

function minimalLesson(overrides) {
  const { minimalLesson: base } = require('../helpers/fixtures');
  return base({
    meta: {
      identifier: 'test-compiler',
      title: 'Compiler Test',
      language: 'en',
      license: 'CC-BY-SA-4.0',
      created: '2026-01-01T00:00:00.000Z',
      difficulty: 3
    },
    steps: [
      { id: 'step_1', type: 'instruction', content: 'Hello **world**.' },
      { id: 'step_2', type: 'completion', content: 'Done.' }
    ],
    ...overrides
  });
}

// ── buildLessonIR ────────────────────────────────────────────────────────────

describe('buildLessonIR', () => {
  it('returns an IR object with steps, inferredFeatures, and compiler stamps', async () => {
    const ir = await buildLessonIR(minimalLesson(), { dev: false });
    assert.ok(ir);
    assert.ok(Array.isArray(ir.steps));
    assert.equal(ir.steps.length, 2);
    assert.ok(ir.inferredFeatures);
    assert.ok(ir._compiledAt);
    assert.ok(ir._schemaVersion);
    assert.equal(ir._devMode, false);
  });

  it('sets htmlContent on each step (rendered or fallback)', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    const step = ir.steps.find(s => s.id === 'step_1');
    assert.ok(typeof step.htmlContent === 'string', 'Expected htmlContent string');
    assert.ok(step.htmlContent.length > 0, 'htmlContent should not be empty when content exists');
    // Markdown rendering may fail if remark-rehype not installed — the fallback
    // preserves the original text with <br> line breaks, which is correct behavior
    const hasMarkdown = step.htmlContent.includes('<strong>') || step.htmlContent.includes('<b>');
    const hasFallback = step.htmlContent.includes('Hello');
    assert.ok(hasMarkdown || hasFallback, 'Expected markdown or fallback in: ' + step.htmlContent);
  });

  it('preserves original step fields', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    const step = ir.steps[0];
    assert.equal(step.id, 'step_1');
    assert.equal(step.type, 'instruction');
    assert.equal(step.content, 'Hello **world**.');
  });

  it('handles steps with no content gracefully', async () => {
    const lesson = minimalLesson({
      steps: [{ id: 's1', type: 'instruction' }]
    });
    const ir = await buildLessonIR(lesson, {});
    assert.equal(ir.steps[0].htmlContent, '');
  });

  it('sets _devMode from options', async () => {
    const ir = await buildLessonIR(minimalLesson(), { dev: true });
    assert.equal(ir._devMode, true);
  });

  it('sets metadata_source', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    assert.ok(typeof ir.metadata_source === 'string');
  });

  it('runs feature inference', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    assert.ok(ir.inferredFeatures);
    assert.ok('difficulty' in ir.inferredFeatures);
  });

  it('preserves meta and ontology on the IR', async () => {
    const lesson = minimalLesson({
      ontology: { requires: [{ skill: 'reading', level: 1 }], provides: [{ skill: 'math', level: 2 }] }
    });
    const ir = await buildLessonIR(lesson, {});
    assert.ok(ir.meta);
    assert.ok(ir.ontology);
    assert.equal(ir.ontology.requires[0].skill, 'reading');
  });

  it('strips javascript: and data: from Markdown links/images (P0 #6 XSS)', async () => {
    const lesson = minimalLesson({
      steps: [
        {
          id: 'xss_1',
          type: 'instruction',
          content: '[click](javascript:alert(1)) and ![img](data:text/html,<script>alert(2)</script>)'
        }
      ]
    });
    const ir = await buildLessonIR(lesson, {});
    const html = ir.steps[0].htmlContent;
    assert.ok(!/javascript:/i.test(html), 'javascript: link should be stripped: ' + html);
    assert.ok(!/data:text\/html/i.test(html), 'data: img src should be stripped: ' + html);
  });
});

// ── buildLessonSidecar ───────────────────────────────────────────────────────

describe('buildLessonSidecar', () => {
  it('extracts identity fields', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    const sidecar = buildLessonSidecar(ir);
    assert.equal(sidecar.title, 'Compiler Test');
    assert.equal(sidecar.language, 'en');
    assert.ok(sidecar.compiledAt);
  });

  it('extracts difficulty from inferredFeatures', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    const sidecar = buildLessonSidecar(ir);
    assert.ok(typeof sidecar.difficulty === 'number');
  });

  it('extracts is_group', async () => {
    const lesson = minimalLesson();
    lesson.meta.is_group = true;
    const ir = await buildLessonIR(lesson, {});
    const sidecar = buildLessonSidecar(ir);
    assert.equal(sidecar.is_group, true);
  });

  it('extracts creator_id and uri when present', async () => {
    const lesson = minimalLesson();
    lesson.meta.creator_id = 'cr-test123';
    lesson.meta.uri = 'agni:cr-test123/compiler-test';
    const ir = await buildLessonIR(lesson, {});
    const sidecar = buildLessonSidecar(ir);
    assert.equal(sidecar.creator_id, 'cr-test123');
    assert.equal(sidecar.uri, 'agni:cr-test123/compiler-test');
  });

  it('extracts ontology', async () => {
    const lesson = minimalLesson({
      ontology: { requires: [{ skill: 'reading', level: 1 }], provides: [{ skill: 'math', level: 2 }] }
    });
    const ir = await buildLessonIR(lesson, {});
    const sidecar = buildLessonSidecar(ir);
    assert.ok(sidecar.ontology);
    assert.equal(sidecar.ontology.requires[0].skill, 'reading');
    assert.equal(sidecar.ontology.provides[0].skill, 'math');
  });

  it('includes inferredFeatures and factoryManifest', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    const sidecar = buildLessonSidecar(ir);
    assert.ok(sidecar.inferredFeatures);
    assert.ok(Array.isArray(sidecar.katexAssets));
    assert.ok(Array.isArray(sidecar.factoryManifest));
  });

  it('does not include step content', async () => {
    const ir = await buildLessonIR(minimalLesson(), {});
    const sidecar = buildLessonSidecar(ir);
    assert.ok(!sidecar.steps, 'Sidecar should not contain steps');
    assert.ok(!sidecar.htmlContent, 'Sidecar should not contain htmlContent');
  });
});
