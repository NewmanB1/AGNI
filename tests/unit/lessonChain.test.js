'use strict';

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { tempDir } = require('../helpers/fixtures');

const tmp = tempDir('chain');
process.env.AGNI_DATA_DIR = tmp.dir;

const chain = require('@agni/services/lesson-chain');

after(() => {
  tmp.cleanup();
  delete process.env.AGNI_DATA_DIR;
});

// ── canonicalize ─────────────────────────────────────────────────────────────

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    const a = chain.canonicalize({ z: 1, a: 2, m: 3 });
    const b = chain.canonicalize({ a: 2, m: 3, z: 1 });
    assert.equal(a, b);
  });

  it('strips underscore-prefixed keys', () => {
    const result = chain.canonicalize({ visible: true, _internal: 'hidden' });
    assert.ok(!result.includes('_internal'));
    assert.ok(result.includes('visible'));
  });

  it('strips chain fields (content_hash, parent_hash, uri, chain)', () => {
    const result = chain.canonicalize({
      title: 'Hello',
      content_hash: 'sha256:abc',
      parent_hash: 'sha256:def',
      uri: 'agni:cr/slug',
      chain: []
    });
    assert.ok(!result.includes('content_hash'));
    assert.ok(!result.includes('parent_hash'));
    assert.ok(!result.includes('"uri"'));
    assert.ok(!result.includes('"chain"'));
    assert.ok(result.includes('title'));
  });

  it('handles null and undefined', () => {
    assert.equal(chain.canonicalize(null), 'null');
    assert.equal(chain.canonicalize(undefined), 'null');
  });

  it('handles arrays', () => {
    const result = chain.canonicalize([3, 1, 2]);
    assert.equal(result, '[3,1,2]');
  });

  it('handles nested objects deterministically', () => {
    const a = chain.canonicalize({ outer: { z: 1, a: 2 } });
    const b = chain.canonicalize({ outer: { a: 2, z: 1 } });
    assert.equal(a, b);
  });

  it('handles primitives', () => {
    assert.equal(chain.canonicalize('hello'), '"hello"');
    assert.equal(chain.canonicalize(42), '42');
    assert.equal(chain.canonicalize(true), 'true');
  });
});

// ── computeContentHash ───────────────────────────────────────────────────────

describe('computeContentHash', () => {
  it('returns a sha256: prefixed string', () => {
    const hash = chain.computeContentHash({
      meta: { title: 'Test', language: 'en' },
      steps: [{ id: 's1', type: 'instruction' }]
    });
    assert.ok(hash.startsWith('sha256:'));
    assert.equal(hash.length, 7 + 64); // "sha256:" + 64 hex chars
  });

  it('produces the same hash for the same content', () => {
    const lesson = { meta: { title: 'A' }, steps: [{ id: 's1' }] };
    const h1 = chain.computeContentHash(lesson);
    const h2 = chain.computeContentHash(lesson);
    assert.equal(h1, h2);
  });

  it('produces different hashes for different content', () => {
    const h1 = chain.computeContentHash({ meta: { title: 'A' }, steps: [] });
    const h2 = chain.computeContentHash({ meta: { title: 'B' }, steps: [] });
    assert.notEqual(h1, h2);
  });

  it('ignores chain fields when hashing', () => {
    const base = { meta: { title: 'X' }, steps: [] };
    const withChain = {
      meta: { title: 'X', content_hash: 'sha256:old', parent_hash: 'sha256:older', uri: 'agni:cr/x' },
      steps: []
    };
    assert.equal(chain.computeContentHash(base), chain.computeContentHash(withChain));
  });

  it('ignores underscore-prefixed meta fields', () => {
    const base = { meta: { title: 'X' }, steps: [] };
    const withInternal = { meta: { title: 'X', _compiledAt: '2026-01-01' }, steps: [] };
    assert.equal(chain.computeContentHash(base), chain.computeContentHash(withInternal));
  });
});

// ── shortHash ────────────────────────────────────────────────────────────────

describe('shortHash', () => {
  it('returns first 12 hex chars', () => {
    assert.equal(chain.shortHash('sha256:abcdef123456789000'), 'abcdef123456');
  });

  it('handles empty/null input', () => {
    assert.equal(chain.shortHash(''), '');
    assert.equal(chain.shortHash(null), '');
  });
});

// ── URI functions ────────────────────────────────────────────────────────────

describe('buildUri', () => {
  it('builds agni:<creator>/<slug>', () => {
    assert.equal(chain.buildUri('cr-abc123', 'my-lesson'), 'agni:cr-abc123/my-lesson');
  });

  it('returns empty string when creator or slug is missing', () => {
    assert.equal(chain.buildUri('', 'slug'), '');
    assert.equal(chain.buildUri('cr-1', ''), '');
    assert.equal(chain.buildUri(null, 'slug'), '');
  });
});

describe('buildVersionUri', () => {
  it('appends @shortHash to the base URI', () => {
    const uri = chain.buildVersionUri('cr-1', 'lesson', 'sha256:abcdef123456aaaa');
    assert.equal(uri, 'agni:cr-1/lesson@abcdef123456');
  });

  it('returns base URI when hash is missing', () => {
    assert.equal(chain.buildVersionUri('cr-1', 'lesson', null), 'agni:cr-1/lesson');
  });
});

describe('parseUri', () => {
  it('parses a base URI', () => {
    const parsed = chain.parseUri('agni:cr-abc/my-lesson');
    assert.deepEqual(parsed, { creatorId: 'cr-abc', slug: 'my-lesson', versionHash: undefined });
  });

  it('parses a version URI', () => {
    const parsed = chain.parseUri('agni:cr-abc/my-lesson@a1b2c3d4e5f6');
    assert.deepEqual(parsed, { creatorId: 'cr-abc', slug: 'my-lesson', versionHash: 'a1b2c3d4e5f6' });
  });

  it('returns null for invalid URIs', () => {
    assert.equal(chain.parseUri('not-a-uri'), null);
    assert.equal(chain.parseUri(''), null);
    assert.equal(chain.parseUri(null), null);
    assert.equal(chain.parseUri('http://example.com'), null);
  });

  it('round-trips with buildUri', () => {
    const uri = chain.buildUri('cr-test', 'lesson-slug');
    const parsed = chain.parseUri(uri);
    assert.equal(parsed.creatorId, 'cr-test');
    assert.equal(parsed.slug, 'lesson-slug');
  });
});

// ── Chain management ─────────────────────────────────────────────────────────

describe('chain management', () => {
  const slug = 'test-chain-lesson';

  it('loadChain returns empty chain for nonexistent slug', async () => {
    const c = await chain.loadChain('nonexistent-slug-xyz');
    assert.deepEqual(c.versions, []);
  });

  it('appendVersion creates version 1 with null parent', async () => {
    const result = await chain.appendVersion(slug, {
      contentHash: 'sha256:' + 'a'.repeat(64),
      parentHash: null,
      creatorId: 'cr-1',
      timestamp: '2026-01-01T00:00:00Z'
    });
    assert.ok(result.ok);
    assert.equal(result.version, 1);
  });

  it('appendVersion creates version 2 with parent hash', async () => {
    const result = await chain.appendVersion(slug, {
      contentHash: 'sha256:' + 'b'.repeat(64),
      parentHash: 'sha256:' + 'a'.repeat(64),
      creatorId: 'cr-1',
      timestamp: '2026-01-02T00:00:00Z'
    });
    assert.ok(result.ok);
    assert.equal(result.version, 2);
  });

  it('getLatestVersion returns the most recent entry', async () => {
    const latest = await chain.getLatestVersion(slug);
    assert.equal(latest.version, 2);
    assert.equal(latest.contentHash, 'sha256:' + 'b'.repeat(64));
  });

  it('verifyChain passes for a valid chain', async () => {
    const result = await chain.verifyChain(slug);
    assert.ok(result.valid, 'Expected valid chain, got: ' + result.errors.join('; '));
    assert.equal(result.versions, 2);
  });

  it('verifyChain detects broken parent link', async () => {
    const brokenSlug = 'broken-chain';
    await chain.appendVersion(brokenSlug, { contentHash: 'sha256:' + '1'.repeat(64), parentHash: null });
    await chain.appendVersion(brokenSlug, { contentHash: 'sha256:' + '2'.repeat(64), parentHash: 'sha256:' + 'x'.repeat(64) });
    const result = await chain.verifyChain(brokenSlug);
    assert.ok(!result.valid);
    assert.ok(result.errors[0].includes('mismatch'));
  });
});

// ── verifyContentHash ────────────────────────────────────────────────────────

describe('verifyContentHash', () => {
  it('returns valid when hash matches', () => {
    const lesson = { meta: { title: 'X' }, steps: [] };
    const hash = chain.computeContentHash(lesson);
    lesson.meta.content_hash = hash;
    const result = chain.verifyContentHash(lesson);
    assert.ok(result.valid);
    assert.equal(result.computed, result.claimed);
  });

  it('returns invalid when hash is wrong', () => {
    const lesson = { meta: { title: 'X', content_hash: 'sha256:' + '0'.repeat(64) }, steps: [] };
    const result = chain.verifyContentHash(lesson);
    assert.ok(!result.valid);
    assert.notEqual(result.computed, result.claimed);
  });
});

// ── Fork permissions ─────────────────────────────────────────────────────────

describe('checkForkPermission', () => {
  it('allows CC-BY-SA-4.0', () => {
    const r = chain.checkForkPermission('CC-BY-SA-4.0');
    assert.ok(r.allowed);
  });

  it('allows CC0 (public domain)', () => {
    const r = chain.checkForkPermission('CC0-1.0');
    assert.ok(r.allowed);
  });

  it('allows MIT', () => {
    const r = chain.checkForkPermission('MIT');
    assert.ok(r.allowed);
  });

  it('blocks All-Rights-Reserved', () => {
    const r = chain.checkForkPermission('All-Rights-Reserved');
    assert.ok(!r.allowed);
    assert.ok(r.reason.includes('not permitted'));
  });

  it('flags non-commercial licenses', () => {
    const r = chain.checkForkPermission('CC-BY-NC-4.0');
    assert.ok(r.allowed);
    assert.ok(r.nonCommercial);
  });

  it('rejects unknown licenses', () => {
    const r = chain.checkForkPermission('WTFPL');
    assert.ok(!r.allowed);
    assert.ok(r.reason.includes('Unknown'));
  });

  it('rejects missing license', () => {
    const r = chain.checkForkPermission(null);
    assert.ok(!r.allowed);
  });
});

describe('inheritedForkLicense', () => {
  it('returns the same license for ShareAlike', () => {
    assert.equal(chain.inheritedForkLicense('CC-BY-SA-4.0'), 'CC-BY-SA-4.0');
    assert.equal(chain.inheritedForkLicense('CC-BY-NC-SA-4.0'), 'CC-BY-NC-SA-4.0');
  });

  it('returns null for non-SA licenses (creator can choose)', () => {
    assert.equal(chain.inheritedForkLicense('CC-BY-4.0'), null);
    assert.equal(chain.inheritedForkLicense('MIT'), null);
  });
});
