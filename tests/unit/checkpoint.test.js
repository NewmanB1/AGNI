'use strict';

const { describe, it, before, after, beforeEach } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const browserGlobals = require('../helpers/browser-globals');
const { setupGlobals, teardownGlobals } = browserGlobals;

let ckpt;

before(() => {
  setupGlobals();
  delete require.cache[require.resolve('@agni/runtime/telemetry/checkpoint')];
  require('@agni/runtime/telemetry/checkpoint');
  ckpt = globalThis.AGNI_CHECKPOINT;
  globalThis.localStorage = storage();
});

after(() => teardownGlobals());

function storage() { return browserGlobals.storage; }

// ── save ────────────────────────────────────────────────────────────────────

describe('save', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.localStorage = storage();
  });

  it('stores JSON in localStorage under agni_ckpt_<lessonId>', () => {
    const data = { stepIndex: 3, stepId: 's3', stepOutcomes: [1], probeResults: [] };
    ckpt.save('abc', data, false);

    const raw = storage().getItem('agni_ckpt_abc');
    assert.ok(raw);
    const obj = JSON.parse(raw);
    assert.equal(obj.stepIndex, 3);
    assert.equal(obj.stepId, 's3');
    assert.deepStrictEqual(obj.stepOutcomes, [1]);
    assert.deepStrictEqual(obj.probeResults, []);
    assert.equal(typeof obj.savedAt, 'number');
  });

  it('includes version field in saved payload', () => {
    ckpt.save('ver', { stepIndex: 0, stepId: 's0', stepOutcomes: [], probeResults: [] }, false);
    const obj = JSON.parse(storage().getItem('agni_ckpt_ver'));
    assert.equal(obj.version, ckpt.VERSION);
  });
});

// ── load ────────────────────────────────────────────────────────────────────

describe('load', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.localStorage = storage();
  });

  it('returns saved data correctly', () => {
    const data = { stepIndex: 5, stepId: 's5', stepOutcomes: [], probeResults: [true] };
    ckpt.save('L1', data, false);

    const loaded = ckpt.load('L1', false);
    assert.equal(loaded.stepIndex, 5);
    assert.equal(loaded.stepId, 's5');
    assert.deepStrictEqual(loaded.probeResults, [true]);
  });

  it('returns null for non-existent checkpoint', () => {
    assert.equal(ckpt.load('nonexistent', false), null);
  });

  it('returns null and clears when checkpoint is expired (7-day default)', () => {
    const data = { stepIndex: 1, stepId: 's1', stepOutcomes: [], probeResults: [] };
    ckpt.save('exp', data, false);

    const raw = JSON.parse(storage().getItem('agni_ckpt_exp'));
    const origNow = Date.now;
    try {
      Date.now = function () { return raw.savedAt + ckpt.DEFAULT_EXPIRY_MS + 1; };

      const result = ckpt.load('exp', false);
      assert.equal(result, null);
      assert.equal(storage().getItem('agni_ckpt_exp'), null);
    } finally {
      Date.now = origNow;
    }
  });

  it('does NOT expire within the 7-day window', () => {
    const data = { stepIndex: 2, stepId: 's2', stepOutcomes: [], probeResults: [] };
    ckpt.save('fresh', data, false);

    const raw = JSON.parse(storage().getItem('agni_ckpt_fresh'));
    const origNow = Date.now;
    try {
      Date.now = function () { return raw.savedAt + 86400000 * 3; };

      const result = ckpt.load('fresh', false);
      assert.ok(result);
      assert.equal(result.stepIndex, 2);
    } finally {
      Date.now = origNow;
    }
  });
});

// ── clear ───────────────────────────────────────────────────────────────────

describe('clear', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.localStorage = storage();
  });

  it('removes the checkpoint from localStorage', () => {
    const data = { stepIndex: 0, stepId: 's0', stepOutcomes: [], probeResults: [] };
    ckpt.save('rm', data, false);
    assert.ok(storage().getItem('agni_ckpt_rm'));

    ckpt.clear('rm', false);
    assert.equal(storage().getItem('agni_ckpt_rm'), null);
  });
});

// ── sync ────────────────────────────────────────────────────────────────────

describe('sync', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.localStorage = storage();
  });

  it('is a function on the module', () => {
    assert.equal(typeof ckpt.sync, 'function');
  });

  it('does nothing when hubUrl is falsy', () => {
    ckpt.sync('', 'student1', 'L1', false);
  });

  it('does nothing when no checkpoint is saved', () => {
    ckpt.sync('http://hub:8082', 'student1', 'nodata', false);
  });
});

// ── loadRemote ──────────────────────────────────────────────────────────────

describe('loadRemote', () => {
  it('is a function on the module', () => {
    assert.equal(typeof ckpt.loadRemote, 'function');
  });

  it('resolves to null when hubUrl is falsy', () => {
    const p = ckpt.loadRemote('', 'student1', 'L1', false);
    p.then((val) => {
      assert.equal(val, null);
    });
  });
});

// ── error handling ──────────────────────────────────────────────────────────

describe('error handling', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.localStorage = storage();
  });

  it('save handles localStorage errors gracefully', () => {
    const origSetItem = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error('quota exceeded'); };

    ckpt.save('err', { stepIndex: 0, stepId: 'x', stepOutcomes: [], probeResults: [] }, false);

    globalThis.localStorage.setItem = origSetItem;
  });

  it('load handles localStorage errors gracefully', () => {
    const origGetItem = globalThis.localStorage.getItem;
    globalThis.localStorage.getItem = () => { throw new Error('read error'); };

    const result = ckpt.load('err', false);
    assert.equal(result, null);

    globalThis.localStorage.getItem = origGetItem;
  });
});
