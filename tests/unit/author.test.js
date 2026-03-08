'use strict';

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const path = require('path');

const { minimalLesson, tempDir: makeTempDir } = require('../helpers/fixtures');

const tmp = makeTempDir('author');
process.env.AGNI_DATA_DIR = tmp.dir;

const author = require('@agni/services/author');

after(() => {
  tmp.cleanup();
  delete process.env.AGNI_DATA_DIR;
});

// ── deriveSlug ───────────────────────────────────────────────────────────────

describe('deriveSlug', () => {
  it('derives slug from explicit slug field', () => {
    assert.equal(author.deriveSlug({ slug: 'my-lesson' }), 'my-lesson');
  });

  it('sanitizes slug field', () => {
    assert.equal(author.deriveSlug({ slug: 'My Lesson!!' }), 'My-Lesson');
  });

  it('derives slug from meta.title', () => {
    const slug = author.deriveSlug({ meta: { title: 'Intro to Fractions' } });
    assert.equal(slug, 'intro-to-fractions');
  });

  it('falls back to meta.identifier', () => {
    const slug = author.deriveSlug({ meta: { identifier: 'ols:math:fractions_v1' } });
    assert.equal(slug, 'ols-math-fractions-v1');
  });

  it('falls back to top-level title', () => {
    const slug = author.deriveSlug({ title: 'Top Level Title' });
    assert.equal(slug, 'top-level-title');
  });

  it('falls back to "untitled" when nothing is available', () => {
    assert.equal(author.deriveSlug({}), 'untitled');
  });

  it('collapses multiple dashes', () => {
    assert.equal(author.deriveSlug({ meta: { title: 'A  ---  B' } }), 'a-b');
  });

  it('strips leading/trailing dashes', () => {
    assert.equal(author.deriveSlug({ meta: { title: '-Hello-' } }), 'hello');
  });
});

// ── parseAuthorBody ──────────────────────────────────────────────────────────

describe('parseAuthorBody', () => {
  it('parses a JSON object directly', () => {
    const result = author.parseAuthorBody({ meta: { title: 'X' } });
    assert.ok(result.lessonData);
    assert.equal(result.lessonData.meta.title, 'X');
  });

  it('parses a JSON string', () => {
    const result = author.parseAuthorBody('{"meta":{"title":"Y"}}');
    assert.ok(result.lessonData);
    assert.equal(result.lessonData.meta.title, 'Y');
  });

  it('parses a YAML string', () => {
    const result = author.parseAuthorBody('meta:\n  title: Z');
    assert.ok(result.lessonData);
    assert.equal(result.lessonData.meta.title, 'Z');
  });

  it('returns error for empty body', () => {
    const result = author.parseAuthorBody(null);
    assert.ok(result.error);
  });

  it('returns error for invalid JSON', () => {
    const result = author.parseAuthorBody('{bad json');
    assert.ok(result.error);
  });
});

// ── validateForAuthor ────────────────────────────────────────────────────────

describe('validateForAuthor', () => {
  it('passes a valid lesson', () => {
    const result = author.validateForAuthor(minimalLesson());
    assert.ok(result.valid, 'Errors: ' + (result.errors || []).join('; '));
  });

  it('fails an invalid lesson', () => {
    const result = author.validateForAuthor({ not: 'a lesson' });
    assert.ok(!result.valid);
  });
});

// ── saveLesson / loadLesson / deleteLesson ───────────────────────────────────

describe('saveLesson', () => {
  const yamlDir = path.join(tmp.dir, 'yaml');

  it('saves a valid lesson to disk', async () => {
    const result = await author.saveLesson(minimalLesson(), yamlDir);
    assert.ok(result.ok, 'Save failed: ' + (result.error || ''));
    assert.equal(result.slug, 'test-lesson');
    assert.ok(result.path);
    assert.ok(result.contentHash, 'Expected contentHash in result');
  });

  it('attaches content_hash and parent_hash to saved lesson', async () => {
    const result = await author.saveLesson(minimalLesson(), yamlDir);
    const loaded = author.loadLesson(result.slug, yamlDir);
    assert.ok(loaded.lessonData.meta.content_hash);
    assert.ok(loaded.lessonData.meta.content_hash.startsWith('sha256:'));
  });

  it('rejects an invalid lesson', async () => {
    const result = await author.saveLesson({ bad: true }, yamlDir);
    assert.ok(result.error);
  });

  it('rejects null input', async () => {
    const result = await author.saveLesson(null, yamlDir);
    assert.ok(result.error);
  });
});

describe('loadLesson', () => {
  const yamlDir = path.join(tmp.dir, 'yaml');

  it('loads a previously saved lesson', () => {
    const result = author.loadLesson('test-lesson', yamlDir);
    assert.ok(result.lessonData, 'Load failed: ' + (result.error || ''));
    assert.equal(result.lessonData.meta.title, 'Test Lesson');
  });

  it('returns error for nonexistent slug', () => {
    const result = author.loadLesson('nonexistent', yamlDir);
    assert.ok(result.error);
  });

  it('sanitizes slug to prevent path traversal', () => {
    const result = author.loadLesson('../../../etc/passwd', yamlDir);
    assert.ok(result.error);
  });
});

describe('deleteLesson', () => {
  const yamlDir = path.join(tmp.dir, 'yaml_del');

  before(async () => {
    await author.saveLesson(minimalLesson({ meta: { ...minimalLesson().meta, title: 'To Delete' } }), yamlDir);
  });

  it('deletes a saved lesson', () => {
    const result = author.deleteLesson('to-delete', yamlDir);
    assert.ok(result.ok);
    assert.ok(result.deleted.length > 0);
  });

  it('returns error for nonexistent lesson', () => {
    const result = author.deleteLesson('already-gone', yamlDir);
    assert.ok(result.error);
  });
});

describe('slugExists', () => {
  const yamlDir = path.join(tmp.dir, 'yaml');

  it('returns true for existing slug', () => {
    assert.ok(author.slugExists('test-lesson', yamlDir));
  });

  it('returns false for nonexistent slug', () => {
    assert.ok(!author.slugExists('nope', yamlDir));
  });
});

describe('generateForAuthor (services improvement S1)', () => {
  it('returns error when generateLesson is not passed', async () => {
    const result = await author.generateForAuthor({ skillDescription: 'test', archetypeId: null });
    assert.ok(result.error);
    assert.ok(result.error.indexOf('generateLesson') !== -1);
  });

  it('returns error for empty skill description', async () => {
    const mockGen = async () => ({ lesson: {}, issues: [] });
    const result = await author.generateForAuthor({ skillDescription: '', generateLesson: mockGen });
    assert.ok(result.error);
    assert.equal(result.error, 'Skill description is required');
  });
});
