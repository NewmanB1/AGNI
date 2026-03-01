'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupGlobals, teardownGlobals, makeElement } = require('../helpers/browser-globals');

before(() => setupGlobals());
require('../../src/runtime/ui/frustration');
const frust = globalThis.AGNI_FRUSTRATION;
after(() => teardownGlobals());

// ── shouldShowNudge ──────────────────────────────────────────────────────────

describe('shouldShowNudge', () => {
  beforeEach(() => frust.reset());

  it('is false initially', () => {
    assert.equal(frust.shouldShowNudge(), false);
  });

  it('returns true after 2 consecutive skips', () => {
    frust.trackOutcome(false, true);
    frust.trackOutcome(false, true);
    assert.equal(frust.shouldShowNudge(), true);
  });

  it('returns true after enough consecutive fails (default difficulty 3 = threshold 5)', () => {
    for (let i = 0; i < 5; i++) frust.trackOutcome(false, false);
    assert.equal(frust.shouldShowNudge(), true);
  });

  it('allows more fails on harder steps (difficulty 5 = threshold 7)', () => {
    frust.trackOutcome(false, false, 5);
    for (let i = 0; i < 5; i++) frust.trackOutcome(false, false, 5);
    assert.equal(frust.shouldShowNudge(), false);
    frust.trackOutcome(false, false, 5);
    assert.equal(frust.shouldShowNudge(), true);
  });

  it('triggers sooner on easy steps (difficulty 1 = threshold 3)', () => {
    frust.trackOutcome(false, false, 1);
    frust.trackOutcome(false, false, 1);
    assert.equal(frust.shouldShowNudge(), false);
    frust.trackOutcome(false, false, 1);
    assert.equal(frust.shouldShowNudge(), true);
  });

  it('resets after a pass', () => {
    frust.trackOutcome(false, true);
    frust.trackOutcome(false, true);
    assert.equal(frust.shouldShowNudge(), true);
    frust.trackOutcome(true, false);
    assert.equal(frust.shouldShowNudge(), false);
  });
});

// ── frustration score ────────────────────────────────────────────────────────

describe('getFrustrationScore', () => {
  beforeEach(() => frust.reset());

  it('is 0 initially', () => {
    assert.equal(frust.getFrustrationScore(), 0);
  });

  it('increases with consecutive fails', () => {
    frust.trackOutcome(false, false);
    const s1 = frust.getFrustrationScore();
    frust.trackOutcome(false, false);
    const s2 = frust.getFrustrationScore();
    assert.ok(s2 > s1, 'score should increase');
    assert.ok(s2 <= 1, 'score should be <= 1');
  });

  it('returns a value between 0 and 1', () => {
    for (let i = 0; i < 20; i++) frust.trackOutcome(false, false);
    const score = frust.getFrustrationScore();
    assert.ok(score >= 0 && score <= 1);
  });
});

// ── events tracking ──────────────────────────────────────────────────────────

describe('event tracking', () => {
  beforeEach(() => frust.reset());

  it('getEvents returns empty array initially', () => {
    assert.deepStrictEqual(frust.getEvents(), []);
  });

  it('getTotalEvents returns 0 initially', () => {
    assert.equal(frust.getTotalEvents(), 0);
  });
});

// ── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  beforeEach(() => frust.reset());

  it('clears all state', () => {
    frust.trackOutcome(false, false);
    frust.trackOutcome(false, false);
    frust.trackOutcome(false, false);
    frust.trackOutcome(false, false);
    frust.trackOutcome(false, false);
    assert.equal(frust.shouldShowNudge(), true);
    frust.reset();
    assert.equal(frust.shouldShowNudge(), false);
    assert.deepStrictEqual(frust.getEvents(), []);
    assert.equal(frust.getTotalEvents(), 0);
  });
});

// ── showNudge ────────────────────────────────────────────────────────────────

describe('showNudge', () => {
  beforeEach(() => frust.reset());

  it('appends a .frustration-nudge element to the container', () => {
    const parent = makeElement('div');
    const container = makeElement('div');
    parent.appendChild(container);

    frust.showNudge(container, (k) => k);
    const nudge = container._children.find(c => c.className === 'frustration-nudge');
    assert.ok(nudge, 'expected a .frustration-nudge child');
  });

  it('sets nudgeShown so shouldShowNudge returns false', () => {
    frust.trackOutcome(false, true);
    frust.trackOutcome(false, true);
    assert.equal(frust.shouldShowNudge(), true);

    const parent = makeElement('div');
    const container = makeElement('div');
    parent.appendChild(container);
    frust.showNudge(container);

    assert.equal(frust.shouldShowNudge(), false);
  });

  it('records a frustration event on nudge', () => {
    frust.trackOutcome(false, true);
    frust.trackOutcome(false, true);

    const parent = makeElement('div');
    const container = makeElement('div');
    parent.appendChild(container);
    frust.showNudge(container, null, 'step-1');

    assert.equal(frust.getTotalEvents(), 1);
    const events = frust.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].stepId, 'step-1');
    assert.equal(events[0].trigger, 'skips');
    assert.ok(events[0].score >= 0);
  });
});

// ── rapid retries ────────────────────────────────────────────────────────────

describe('trackRetry (rapid retries)', () => {
  beforeEach(() => frust.reset());

  it('triggers nudge after 4 rapid retries', () => {
    const origNow = Date.now;
    let clock = 1000;
    Date.now = () => clock;

    frust.trackRetry();
    clock += 500;
    frust.trackRetry();
    clock += 500;
    frust.trackRetry();
    clock += 500;
    frust.trackRetry();
    clock += 500;
    frust.trackRetry();

    Date.now = origNow;

    assert.equal(frust.shouldShowNudge(), true);
  });
});
