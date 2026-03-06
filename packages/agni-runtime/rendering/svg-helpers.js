// packages/agni-runtime/rendering/svg-helpers.js
// AGNI SVG Helpers — shared utilities for all SVG factories.
// Loaded before svg-factories.js. ES5-compatible for Chrome 44+.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /** ES5-safe assign: copy own properties from src to target */
  function assign(target, src) {
    if (!src) return target;
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) {
        target[k] = src[k];
      }
    }
    return target;
  }

  /** Create an SVG element with attributes */
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      e.setAttribute(k, attrs[k]);
    });
    return e;
  }

  /** Create a text node with common defaults */
  function txt(content, attrs) {
    var defaults = {
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': 'sans-serif',
      'font-size': '13',
      'fill': '#ffffff'
    };
    var merged = assign(assign({}, defaults), attrs || {});
    var e = el('text', merged);
    e.textContent = content;
    return e;
  }

  /** Wrap a group of SVG elements */
  function g(attrs, children) {
    var group = el('g', attrs);
    (children || []).forEach(function (c) { if (c) group.appendChild(c); });
    return group;
  }

  /** Build root SVG element sized to container */
  function rootSvg(container, w, h, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var svgAttrs = {
      xmlns: NS,
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      height: 'auto',
      style: 'display:block;'
    };
    if (opts.preserveAspectRatio) {
      svgAttrs.preserveAspectRatio = opts.preserveAspectRatio;
    }
    if (opts.ariaLabel) {
      svgAttrs['aria-label'] = opts.ariaLabel;
      svgAttrs.role = 'img';
    }
    var svg = el('svg', svgAttrs);
    if (opts.ariaLabel) {
      var titleEl = el('title', {});
      titleEl.textContent = opts.ariaLabel;
      svg.appendChild(titleEl);
    }
    container.appendChild(svg);
    return svg;
  }

  /** Clamp a value between min and max */
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  /** Convert polar (r, angleDeg) to cartesian — clock convention: 0° at top */
  function polar(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  /** SVG arc path for a pie/clock slice */
  function arcPath(cx, cy, r, startDeg, endDeg) {
    var s = polar(cx, cy, r, startDeg);
    var e = polar(cx, cy, r, endDeg);
    var large = (endDeg - startDeg > 180) ? 1 : 0;
    return [
      'M', cx, cy,
      'L', s.x.toFixed(2), s.y.toFixed(2),
      'A', r, r, 0, large, 1, e.x.toFixed(2), e.y.toFixed(2),
      'Z'
    ].join(' ');
  }

  /** Escape string for use in HTML/SVG attributes */
  function escapeAttr(val) {
    if (typeof val !== 'string') val = String(val == null ? '' : val);
    return val.replace(/\x00/g, '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;');
  }

  /** Default colour palette (accessible, works on dark backgrounds) */
  var PALETTE = [
    '#0B5FFF', '#D84315', '#1B5E20', '#996600',
    '#7B1FA2', '#B00020', '#00695C', '#AD1457'
  ];

  global.AGNI_SVG_HELPERS = {
    NS: NS,
    assign: assign,
    el: el,
    txt: txt,
    g: g,
    rootSvg: rootSvg,
    clamp: clamp,
    polar: polar,
    arcPath: arcPath,
    escapeAttr: escapeAttr,
    PALETTE: PALETTE
  };

  if (global.DEV_MODE) console.log('[SVG-HELPERS] loaded');

}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
