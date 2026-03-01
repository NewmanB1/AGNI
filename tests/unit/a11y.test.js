'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const browserGlobals = require('../helpers/browser-globals');
const { setupGlobals, teardownGlobals, makeElement } = browserGlobals;

const modulePath = require.resolve('../../src/runtime/a11y');

function storage() { return browserGlobals.storage; }

function loadA11y() {
  delete require.cache[modulePath];
  delete globalThis.AGNI_A11Y;
  require('../../src/runtime/a11y');
  return globalThis.AGNI_A11Y;
}

before(() => setupGlobals());
after(() => teardownGlobals());

// ── prefs – defaults ────────────────────────────────────────────────────────

describe('prefs – defaults', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.document.documentElement.classList._set.clear();
    globalThis.document.documentElement.style = {};
    globalThis.document.head._children = [];
  });

  it('has correct default values when no localStorage items set', () => {
    const a11y = loadA11y();
    assert.equal(a11y.prefs.fontScale, 1);
    assert.equal(a11y.prefs.highContrast, false);
    assert.equal(a11y.prefs.reducedMotion, false);
    assert.equal(a11y.prefs.hapticIntensity, 1);
  });
});

// ── prefs – localStorage overrides ──────────────────────────────────────────

describe('prefs – localStorage overrides', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.document.documentElement.classList._set.clear();
    globalThis.document.documentElement.style = {};
    globalThis.document.head._children = [];
  });

  it('highContrast is true when localStorage has agni_high_contrast = "true"', () => {
    storage().setItem('agni_high_contrast', 'true');
    const a11y = loadA11y();
    assert.equal(a11y.prefs.highContrast, true);
  });

  it('fontScale is clamped to minimum 0.8', () => {
    storage().setItem('agni_font_scale', '0.5');
    const a11y = loadA11y();
    assert.equal(a11y.prefs.fontScale, 0.8);
  });

  it('fontScale is clamped to maximum 1.5', () => {
    storage().setItem('agni_font_scale', '3.0');
    const a11y = loadA11y();
    assert.equal(a11y.prefs.fontScale, 1.5);
  });
});

// ── apply() ─────────────────────────────────────────────────────────────────

describe('apply()', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.document.documentElement.classList._set.clear();
    globalThis.document.documentElement.style = {};
    globalThis.document.head._children = [];
  });

  it('adds agni-high-contrast class when highContrast is true', () => {
    storage().setItem('agni_high_contrast', 'true');
    const a11y = loadA11y();
    a11y.apply();
    assert.ok(globalThis.document.documentElement.classList.contains('agni-high-contrast'));
  });

  it('sets font size on root element when fontScale !== 1', () => {
    storage().setItem('agni_font_scale', '1.2');
    const a11y = loadA11y();
    a11y.apply();
    assert.equal(globalThis.document.documentElement.style.fontSize, '120%');
  });

  it('creates a style element with id agni-a11y-style', () => {
    const a11y = loadA11y();
    a11y.apply();
    const styles = globalThis.document.head._children.filter(c => c.id === 'agni-a11y-style');
    assert.equal(styles.length, 1);
    assert.ok(styles[0].textContent.length > 0);
  });
});

// ── addAria() ───────────────────────────────────────────────────────────────

describe('addAria()', () => {
  it('sets role and aria-label attributes on an element', () => {
    const a11y = loadA11y();
    const el = makeElement('div');
    a11y.addAria(el, 'button', 'Submit');
    assert.equal(el.getAttribute('role'), 'button');
    assert.equal(el.getAttribute('aria-label'), 'Submit');
  });

  it('does not set attributes when role and label are null', () => {
    const a11y = loadA11y();
    const el = makeElement('div');
    a11y.addAria(el, null, null);
    assert.equal(el.getAttribute('role'), null);
    assert.equal(el.getAttribute('aria-label'), null);
  });
});

// ── renderSettingsPanel ──────────────────────────────────────────────────────

describe('renderSettingsPanel()', () => {
  beforeEach(() => {
    storage().store.clear();
    globalThis.document.documentElement.classList._set.clear();
    globalThis.document.documentElement.style = {};
    globalThis.document.head._children = [];
    globalThis.document.body._children = [];
  });

  it('is exposed as a function', () => {
    const a11y = loadA11y();
    assert.equal(typeof a11y.renderSettingsPanel, 'function');
  });

  it('exposes injectSettingsButton', () => {
    const a11y = loadA11y();
    assert.equal(typeof a11y.injectSettingsButton, 'function');
  });

  it('exposes savePrefs', () => {
    const a11y = loadA11y();
    assert.equal(typeof a11y.savePrefs, 'function');
  });

  it('savePrefs persists all four preferences to localStorage', () => {
    const a11y = loadA11y();
    a11y.prefs.fontScale = 1.2;
    a11y.prefs.highContrast = true;
    a11y.prefs.reducedMotion = true;
    a11y.prefs.hapticIntensity = 0.5;
    a11y.savePrefs();
    assert.equal(storage().getItem('agni_font_scale'), '1.2');
    assert.equal(storage().getItem('agni_high_contrast'), 'true');
    assert.equal(storage().getItem('agni_reduced_motion'), 'true');
    assert.equal(storage().getItem('agni_haptic_intensity'), '0.5');
  });
});
