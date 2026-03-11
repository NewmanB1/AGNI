'use strict';

/**
 * Lightweight browser-global stubs for testing ES5 IIFE runtime modules
 * under Node's built-in test runner.
 *
 * Usage:
 *   const { setupGlobals, teardownGlobals, dom, storage } = require('./browser-globals');
 *   before(() => setupGlobals());
 *   after(() => teardownGlobals());
 *
 * After setupGlobals():
 *   - globalThis acts as `window`/`self` (modules attach AGNI_* here)
 *   - globalThis.document provides createElement, getElementById, head, body, documentElement
 *   - globalThis.localStorage provides getItem/setItem/removeItem/clear
 *   - globalThis.navigator provides a stub vibrate()
 *
 * dom.getById(id) returns the last element set via dom.setById(id, el).
 * storage.store is the raw Map — inspect it directly in assertions.
 */

const _originals = {};

function makeElement(tag) {
  const el = {
    _tag: tag || 'div',
    _children: [],
    _attrs: {},
    _classes: [],
    className: '',
    id: '',
    textContent: '',
    innerHTML: '',
    get outerHTML() {
      const tag = el._tag || 'div';
      const attrs = Object.keys(el._attrs || {}).map(function (k) {
        return k + '="' + String(el._attrs[k]).replace(/"/g, '&quot;') + '"';
      }).join(' ');
      const open = attrs ? '<' + tag + ' ' + attrs + '>' : '<' + tag + '>';
      const inner = el.innerHTML || '';
      return open + inner + '</' + tag + '>';
    },
    style: {},
    disabled: false,
    parentNode: null,
    tagName: (tag || 'div').toUpperCase(),
    setAttribute(k, v) { el._attrs[k] = v; },
    getAttribute(k) { return el._attrs[k] || null; },
    appendChild(child) {
      child.parentNode = el;
      el._children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = el._children.indexOf(child);
      if (idx >= 0) el._children.splice(idx, 1);
      child.parentNode = null;
    },
    remove() {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    focus() {},
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll(sel) {
      const match = [];
      const tagSel = /^[a-z]+$/i.test(sel) ? sel.toLowerCase() : null;
      function walk(node) {
        if (tagSel && (node._tag || '').toLowerCase() === tagSel) match.push(node);
        else if (node.className && typeof node.className === 'string' &&
            sel.startsWith('.') && node.className.indexOf(sel.slice(1)) >= 0) {
          match.push(node);
        }
        (node._children || []).forEach(walk);
      }
      walk(el);
      return match;
    },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); }
    }
  };
  return el;
}

const _elementRegistry = new Map();

function makeDocument() {
  const docEl = makeElement('html');
  const head = makeElement('head');
  const body = makeElement('body');
  return {
    documentElement: docEl,
    head,
    body,
    readyState: 'complete',
    createElement(tag) { return makeElement(tag); },
    createElementNS(ns, tag) { return makeElement(tag); },
    createTextNode(text) { return { textContent: text, nodeType: 3, parentNode: null }; },
    getElementById(id) { return _elementRegistry.get(id) || null; },
    addEventListener() {},
    removeEventListener() {}
  };
}

function makeLocalStorage() {
  const store = new Map();
  return {
    store,
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    get length() { return store.size; }
  };
}

let _storage = null;

function setupGlobals() {
  _originals.document = globalThis.document;
  _originals.localStorage = globalThis.localStorage;
  _originals.navigator = globalThis.navigator;
  _originals.self = globalThis.self;
  _originals.window = globalThis.window;
  _originals.SpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;
  _originals.DeviceMotionEvent = globalThis.DeviceMotionEvent;
  _originals.Image = globalThis.Image;

  _storage = makeLocalStorage();
  const doc = makeDocument();

  globalThis.document = doc;
  globalThis.localStorage = _storage;
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate() { return true; }, userAgent: 'test' },
    writable: true,
    configurable: true
  });
  globalThis.self = globalThis;
  globalThis.window = globalThis;
  globalThis.Image = function ImageStub() {
    let _src = '';
    const img = {
      onload: null,
      onerror: null,
      get src() { return _src; },
      set src(v) {
        _src = v;
        const fn = img.onerror;
        if (typeof fn === 'function') setImmediate(function () { fn(); });
      }
    };
    return img;
  };
  _elementRegistry.clear();
}

function teardownGlobals() {
  for (const key of Object.keys(_originals)) {
    if (_originals[key] === undefined) {
      try { delete globalThis[key]; } catch { /* non-configurable */ }
    } else {
      try {
        globalThis[key] = _originals[key];
      } catch {
        Object.defineProperty(globalThis, key, {
          value: _originals[key],
          writable: true,
          configurable: true
        });
      }
    }
  }
  // Clean up any AGNI_* globals registered by modules
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith('AGNI_')) delete globalThis[key];
  }
  _elementRegistry.clear();
}

module.exports = {
  setupGlobals,
  teardownGlobals,
  makeElement,
  dom: {
    setById(id, el) { el.id = id; _elementRegistry.set(id, el); },
    getById(id) { return _elementRegistry.get(id) || null; },
    clearRegistry() { _elementRegistry.clear(); }
  },
  get storage() { return _storage; }
};
