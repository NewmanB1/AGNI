'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { loadJSON, saveJSON, getFileMtime } = require('../../src/utils/json-store');
const { computeStreaks, collectReviewDates } = require('../../src/utils/streak');
const { createRateLimiter } = require('../../src/utils/rate-limiter');
const { createLogger } = require('../../src/utils/logger');
const { safeErrorMessage } = require('../../src/utils/http-helpers');

function tempDir() {
  const dir = path.join(os.tmpdir(), 'agni-utils-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('json-store', () => {
  it('loadJSON returns fallback for missing file', () => {
    const result = loadJSON('/nonexistent/path.json', { default: true });
    assert.deepEqual(result, { default: true });
  });

  it('saveJSON writes and loadJSON reads', () => {
    const dir = tempDir();
    const filePath = path.join(dir, 'test.json');
    const data = { hello: 'world', count: 42 };
    saveJSON(filePath, data);
    const loaded = loadJSON(filePath);
    assert.deepEqual(loaded, data);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saveJSON creates parent directories', () => {
    const dir = tempDir();
    const filePath = path.join(dir, 'nested', 'deep', 'test.json');
    saveJSON(filePath, { nested: true });
    assert.ok(fs.existsSync(filePath));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getFileMtime returns 0 for missing file', () => {
    assert.equal(getFileMtime('/nonexistent/file.json'), 0);
  });

  it('getFileMtime returns positive for existing file', () => {
    const dir = tempDir();
    const filePath = path.join(dir, 'mtime.json');
    fs.writeFileSync(filePath, '{}');
    assert.ok(getFileMtime(filePath) > 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('streak', () => {
  it('computeStreaks returns zeros for empty dates', () => {
    const result = computeStreaks([]);
    assert.equal(result.currentStreak, 0);
    assert.equal(result.longestStreak, 0);
  });

  it('computeStreaks calculates current streak correctly', () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    dates.sort();
    const result = computeStreaks(dates);
    assert.equal(result.currentStreak, 3);
    assert.ok(result.longestStreak >= 3);
  });

  it('collectReviewDates extracts unique dates', () => {
    const reviews = {
      'lesson-1': { lastReviewAt: new Date('2025-01-15').getTime() },
      'lesson-2': { lastReviewAt: new Date('2025-01-15').getTime() },
      'lesson-3': { lastReviewAt: new Date('2025-01-16').getTime() }
    };
    const dates = collectReviewDates(reviews);
    assert.equal(dates.length, 2);
    assert.ok(dates.includes('2025-01-15'));
    assert.ok(dates.includes('2025-01-16'));
  });
});

describe('rate-limiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
    const result = limiter.check('test-key');
    assert.ok(result.allowed);
    assert.equal(result.remaining, 4);
  });

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
    limiter.check('block-key');
    limiter.check('block-key');
    const result = limiter.check('block-key');
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
  });

  it('tracks different keys independently', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    limiter.check('key-a');
    const result = limiter.check('key-b');
    assert.ok(result.allowed);
  });
});

describe('logger', () => {
  it('creates a logger with component tag', () => {
    const log = createLogger('test-component');
    assert.ok(typeof log.info === 'function');
    assert.ok(typeof log.warn === 'function');
    assert.ok(typeof log.error === 'function');
    assert.ok(typeof log.debug === 'function');
  });
});

describe('safeErrorMessage', () => {
  it('returns message for simple errors', () => {
    assert.equal(safeErrorMessage(new Error('Something failed')), 'Something failed');
  });

  it('hides file paths in error messages', () => {
    assert.equal(
      safeErrorMessage(new Error('ENOENT: no such file /usr/data/test.json')),
      'Internal server error'
    );
  });

  it('handles string errors', () => {
    assert.equal(safeErrorMessage('string error'), 'string error');
  });
});
