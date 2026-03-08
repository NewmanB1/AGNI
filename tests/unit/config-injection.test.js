'use strict';

/**
 * Regression test: config injection (Phase 5).
 * Accounts and lesson-chain accept { dataDir } for isolated test runs.
 * Break-it: remove opts support from createAccounts/createLessonChain → this test fails.
 */

const { describe, it, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { tempDir } = require('../helpers/fixtures');
const { minimalLesson } = require('../helpers/fixtures');

const accountsMod = require('@agni/services/accounts');
const chainMod = require('@agni/services/lesson-chain');

const createAccounts = accountsMod.createAccounts;
const createLessonChain = chainMod.createLessonChain;

const tmpA = tempDir('config-inject-a');
const tmpB = tempDir('config-inject-b');

after(() => {
  tmpA.cleanup();
  tmpB.cleanup();
});

describe('config injection', () => {
  it('createAccounts({ dataDir }) isolates data between instances', async () => {
    const accountsA = createAccounts({ dataDir: tmpA.dir });
    const accountsB = createAccounts({ dataDir: tmpB.dir });

    const r = await accountsA.registerCreator({ name: 'Alice', email: 'alice@test.com', password: 'secret123' });
    assert.ok(r.ok, 'accountsA.registerCreator should succeed');

    const creatorsA = await accountsA.listCreators();
    assert.ok(Array.isArray(creatorsA), 'accountsA.listCreators returns array');
    assert.ok(creatorsA.length >= 1, 'accountsA sees the creator');

    const creatorsB = await accountsB.listCreators();
    assert.ok(Array.isArray(creatorsB), 'accountsB.listCreators returns array');
    assert.equal(creatorsB.length, 0, 'accountsB uses different dataDir — sees no creators');
  });

  it('createLessonChain({ dataDir }) isolates chain data between instances', async () => {
    const chainA = createLessonChain({ dataDir: tmpA.dir });
    const chainB = createLessonChain({ dataDir: tmpB.dir });

    const slug = 'config-inject-test-slug';
    const hash = chainMod.computeContentHash(minimalLesson({ meta: { title: 'Config inject test' } }));

    await chainA.appendVersion(slug, {
      contentHash: hash,
      parentHash: null,
      creatorId: null,
      uri: null,
      timestamp: new Date().toISOString()
    });

    const latestA = await chainA.getLatestVersion(slug);
    assert.ok(latestA, 'chainA sees the appended version');
    assert.equal(latestA.contentHash, hash);

    const latestB = await chainB.getLatestVersion(slug);
    assert.equal(latestB, null, 'chainB uses different dataDir — sees no versions');
  });
});
