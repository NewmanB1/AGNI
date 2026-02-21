// src/runtime/svg-factories.js
// AGNI SVG Factory Library
// Each factory takes a DOM container element and an options object.
// Returns the created SVG element so callers can update or animate it.
// All factories are pure functions — no side effects beyond writing to container.
//
// Usage:
//   const svg = AGNI_SVG.venn(document.getElementById('diagram'), {
//     sets: [{ label: 'A', items: ['cat','dog'] }, { label: 'B', items: ['dog','fish'] }]
//   });
//
// All dimensions default to filling the container width at a sensible aspect ratio.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  // ── Shared helpers ──────────────────────────────────────────────────────────

  var NS = 'http://www.w3.org/2000/svg';

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
    var e = el('text', Object.assign({
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': 'sans-serif',
      'font-size': '13',
      'fill': '#ffffff'
    }, attrs));
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
  function rootSvg(container, w, h) {
    container.innerHTML = '';
    var svg = el('svg', {
      xmlns: NS,
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      height: 'auto',
      style: 'display:block;'
    });
    container.appendChild(svg);
    return svg;
  }

  /** Clamp a value between min and max */
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  /** Convert polar (r, angleDeg) to cartesian around cx,cy */
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

  // Default colour palette (accessible, works on dark backgrounds)
  var PALETTE = [
    '#4dabf7', '#ff6b35', '#51cf66', '#fcc419',
    '#cc5de8', '#ff8787', '#20c997', '#f06595'
  ];

  // ── 1. Venn Diagram ─────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   sets        {Array}  [{label, items[], color?}, ...]  – 2 or 3 sets
   *   title       {string}
   *   w           {number} default 400
   *   h           {number} default 260
   */
  function venn(container, opts) {
    opts = opts || {};
    var W = opts.w || 400, H = opts.h || 260;
    var sets = opts.sets || [];
    var svg = rootSvg(container, W, H);

    if (sets.length < 2) {
      svg.appendChild(txt('Need at least 2 sets', { x: W/2, y: H/2, fill: '#ff8787' }));
      return svg;
    }

    var r = opts.r || Math.min(W, H) * 0.32;
    var opacity = '0.35';

    // Centre positions for up to 3 circles
    var centres = [];
    if (sets.length === 2) {
      var gap = r * 0.75;
      centres = [
        { x: W/2 - gap/2, y: H/2 },
        { x: W/2 + gap/2, y: H/2 }
      ];
    } else {
      var gr = r * 0.65;
      centres = [
        { x: W/2,          y: H/2 - gr * 0.85 },
        { x: W/2 - gr,     y: H/2 + gr * 0.5  },
        { x: W/2 + gr,     y: H/2 + gr * 0.5  }
      ];
    }

    // Draw circles
    sets.forEach(function (s, i) {
      var c = centres[i];
      svg.appendChild(el('circle', {
        cx: c.x, cy: c.y, r: r,
        fill: s.color || PALETTE[i],
        'fill-opacity': opacity,
        stroke: s.color || PALETTE[i],
        'stroke-width': '2'
      }));
      // Set label outside circle
      var lx = c.x + (c.x < W/2 ? -r * 0.55 : r * 0.55);
      var ly = c.y - r * 0.85;
      svg.appendChild(txt(s.label || ('Set ' + (i+1)), {
        x: lx, y: ly,
        fill: s.color || PALETTE[i],
        'font-weight': 'bold',
        'font-size': '14'
      }));
    });

    // Items in each set (simple, non-overlapping placement inside each circle)
    sets.forEach(function (s, i) {
      var c = centres[i];
      var items = s.items || [];
      items.slice(0, 5).forEach(function (item, j) {
        var angle = 180 + i * 120 + j * 28 - (items.length - 1) * 14;
        var p = polar(c.x, c.y, r * 0.52, angle);
        svg.appendChild(txt(item, { x: p.x, y: p.y, 'font-size': '11' }));
      });
    });

    // Title
    if (opts.title) {
      svg.appendChild(txt(opts.title, { x: W/2, y: 16, 'font-size': '14', 'font-weight': 'bold' }));
    }

    return svg;
  }

  // ── 2. Axis (Number Line with optional function plot) ───────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   min         {number} default 0
   *   max         {number} default 10
   *   step        {number} tick interval, default 1
   *   values      {Array}  [{x, label?, color?}] points to mark
   *   fn          {function} optional y=f(x) to plot (maps to normalised height)
   *   xLabel      {string}
   *   yLabel      {string}
   *   title       {string}
   *   w / h       {number}
   */
  function axis(container, opts) {
    opts = opts || {};
    var W = opts.w || 400, H = opts.h || 280;
    var ML = 50, MR = 20, MT = 30, MB = 40;
    var CW = W - ML - MR, CH = H - MT - MB;
    var min = opts.min !== undefined ? opts.min : 0;
    var max = opts.max !== undefined ? opts.max : 10;
    var step = opts.step || 1;
    var svg = rootSvg(container, W, H);

    function toX(v) { return ML + ((v - min) / (max - min)) * CW; }
    function toY(v) { return MT + CH - clamp(v, 0, 1) * CH; }

    // Grid & ticks
    for (var v = min; v <= max; v += step) {
      var px = toX(v);
      svg.appendChild(el('line', { x1:px, y1:MT, x2:px, y2:MT+CH, stroke:'#2a2a4a', 'stroke-width':'1' }));
      svg.appendChild(el('line', { x1:px, y1:MT+CH, x2:px, y2:MT+CH+5, stroke:'#aaaacc', 'stroke-width':'1.5' }));
      svg.appendChild(txt(v, { x:px, y:MT+CH+18, 'font-size':'11', fill:'#8888aa' }));
    }

    // Axes
    svg.appendChild(el('line', { x1:ML, y1:MT, x2:ML, y2:MT+CH, stroke:'#aaaacc', 'stroke-width':'2' }));
    svg.appendChild(el('line', { x1:ML, y1:MT+CH, x2:ML+CW, y2:MT+CH, stroke:'#aaaacc', 'stroke-width':'2' }));

    // Optional function plot
    if (typeof opts.fn === 'function') {
      var steps = 200;
      var points = [];
      for (var i = 0; i <= steps; i++) {
        var xv = min + (i / steps) * (max - min);
        var yv = opts.fn(xv);
        points.push(toX(xv).toFixed(1) + ',' + toY(yv).toFixed(1));
      }
      svg.appendChild(el('polyline', {
        points: points.join(' '),
        fill: 'none', stroke: PALETTE[0], 'stroke-width': '2.5', 'stroke-linejoin': 'round'
      }));
    }

    // Marked values
    (opts.values || []).forEach(function (pt, i) {
      var px = toX(pt.x);
      var color = pt.color || PALETTE[i % PALETTE.length];
      svg.appendChild(el('circle', { cx: px, cy: MT+CH, r: 6, fill: color, stroke: '#fff', 'stroke-width':'1.5' }));
      if (pt.label) {
        svg.appendChild(txt(pt.label, { x: px, y: MT+CH-18, fill: color, 'font-size':'12', 'font-weight':'bold' }));
      }
    });

    // Labels
    if (opts.xLabel) svg.appendChild(txt(opts.xLabel, { x: ML+CW/2, y: H-6, fill:'#ccccee', 'font-size':'12' }));
    if (opts.yLabel) {
      var yl = txt(opts.yLabel, { x:0, y:0, fill:'#ccccee', 'font-size':'12' });
      yl.setAttribute('transform', 'translate(14,' + (MT+CH/2) + ') rotate(-90)');
      svg.appendChild(yl);
    }
    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:16, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── 3. Number Line ──────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   min / max   {number}
   *   step        {number}
   *   marks       {Array} [{value, label?, color?, arrow?}]
   *   title       {string}
   *   w / h       {number}
   */
  function numberLine(container, opts) {
    opts = opts || {};
    var W = opts.w || 400, H = opts.h || 100;
    var ML = 30, MR = 30, CY = H / 2 + 8;
    var CW = W - ML - MR;
    var min = opts.min !== undefined ? opts.min : 0;
    var max = opts.max !== undefined ? opts.max : 10;
    var step = opts.step || 1;
    var svg = rootSvg(container, W, H);

    function toX(v) { return ML + ((v - min) / (max - min)) * CW; }

    // Main line with arrowheads
    svg.appendChild(el('line', { x1:ML-10, y1:CY, x2:ML+CW+10, y2:CY, stroke:'#aaaacc', 'stroke-width':'2' }));
    // Arrow right
    svg.appendChild(el('polygon', {
      points: (ML+CW+10)+','+(CY)+' '+(ML+CW+3)+','+(CY-5)+' '+(ML+CW+3)+','+(CY+5),
      fill:'#aaaacc'
    }));

    // Ticks and labels
    for (var v = min; v <= max; v += step) {
      var px = toX(v);
      svg.appendChild(el('line', { x1:px, y1:CY-8, x2:px, y2:CY+8, stroke:'#aaaacc', 'stroke-width':'1.5' }));
      svg.appendChild(txt(v, { x:px, y:CY+22, 'font-size':'12', fill:'#8888aa' }));
    }

    // Marks
    (opts.marks || []).forEach(function (m, i) {
      var px = toX(m.value);
      var color = m.color || PALETTE[i % PALETTE.length];
      svg.appendChild(el('circle', { cx:px, cy:CY, r:7, fill:color, stroke:'#fff', 'stroke-width':'1.5' }));
      if (m.label) {
        svg.appendChild(txt(m.label, { x:px, y:CY-20, 'font-size':'12', fill:color, 'font-weight':'bold' }));
      }
      if (m.arrow) {
        svg.appendChild(el('line', { x1:px, y1:CY-12, x2:px, y2:CY-28, stroke:color, 'stroke-width':'1.5' }));
      }
    });

    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:14, 'font-size':'13', 'font-weight':'bold' }));

    return svg;
  }

  // ── 4. Balance Scale ────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   left        {object} { label, value, color? }
   *   right       {object} { label, value, color? }
   *   title       {string}
   *   w / h       {number}
   */
  function balanceScale(container, opts) {
    opts = opts || {};
    var W = opts.w || 360, H = opts.h || 260;
    var svg = rootSvg(container, W, H);
    var left  = opts.left  || { label: 'Left',  value: 1 };
    var right = opts.right || { label: 'Right', value: 1 };
    var lv = parseFloat(left.value)  || 0;
    var rv = parseFloat(right.value) || 0;

    // Tilt angle: max ±20 degrees based on difference
    var diff = clamp((lv - rv) / (Math.max(lv, rv, 1)), -1, 1);
    var tiltDeg = diff * 20;

    var cx = W / 2, baseY = H - 40;
    var armLen = W * 0.38;

    // Stand
    svg.appendChild(el('line', { x1:cx, y1:baseY, x2:cx, y2:baseY-100, stroke:'#aaaacc', 'stroke-width':'4', 'stroke-linecap':'round' }));
    svg.appendChild(el('ellipse', { cx:cx, cy:baseY, rx:30, ry:8, fill:'#2a2a4a', stroke:'#aaaacc', 'stroke-width':'2' }));

    // Pivot point
    var pivotY = baseY - 100;

    // Arm (rotated beam)
    var rad = tiltDeg * Math.PI / 180;
    var lEnd = { x: cx - armLen * Math.cos(rad), y: pivotY - armLen * Math.sin(rad) };
    var rEnd = { x: cx + armLen * Math.cos(rad), y: pivotY + armLen * Math.sin(rad) };

    svg.appendChild(el('line', {
      x1: lEnd.x.toFixed(1), y1: lEnd.y.toFixed(1),
      x2: rEnd.x.toFixed(1), y2: rEnd.y.toFixed(1),
      stroke:'#aaaacc', 'stroke-width':'4', 'stroke-linecap':'round'
    }));
    svg.appendChild(el('circle', { cx:cx, cy:pivotY, r:7, fill:'#4dabf7', stroke:'#fff', 'stroke-width':'1.5' }));

    // Pans
    var panW = 60, panH = 10, panDrop = 40;
    [
      { end: lEnd, val: lv, color: left.color  || PALETTE[0], label: left.label  },
      { end: rEnd, val: rv, color: right.color || PALETTE[1], label: right.label }
    ].forEach(function (pan) {
      // String
      svg.appendChild(el('line', {
        x1: pan.end.x.toFixed(1), y1: pan.end.y.toFixed(1),
        x2: pan.end.x.toFixed(1), y2: (pan.end.y + panDrop).toFixed(1),
        stroke:'#aaaacc', 'stroke-width':'1.5', 'stroke-dasharray':'4,3'
      }));
      // Pan dish
      svg.appendChild(el('rect', {
        x: (pan.end.x - panW/2).toFixed(1),
        y: (pan.end.y + panDrop).toFixed(1),
        width: panW, height: panH,
        rx: 4, fill: pan.color, 'fill-opacity':'0.5',
        stroke: pan.color, 'stroke-width':'2'
      }));
      // Value on pan
      svg.appendChild(txt(pan.val, {
        x: pan.end.x.toFixed(1),
        y: (pan.end.y + panDrop + panH/2).toFixed(1),
        'font-size':'13', 'font-weight':'bold', fill:'#ffffff'
      }));
      // Label below
      svg.appendChild(txt(pan.label, {
        x: pan.end.x.toFixed(1),
        y: (pan.end.y + panDrop + panH + 18).toFixed(1),
        'font-size':'12', fill: pan.color
      }));
    });

    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:18, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── 5. Bar Graph ────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   data        {Array} [{label, value, color?}]
   *   yMax        {number} auto if omitted
   *   yLabel      {string}
   *   title       {string}
   *   horizontal  {boolean} default false
   *   w / h       {number}
   */
  function barGraph(container, opts) {
    opts = opts || {};
    var W = opts.w || 400, H = opts.h || 280;
    var ML = 50, MR = 20, MT = 36, MB = 50;
    var CW = W - ML - MR, CH = H - MT - MB;
    var data = opts.data || [];
    var yMax = opts.yMax || Math.max.apply(null, data.map(function(d){ return d.value; })) * 1.15 || 10;
    var svg = rootSvg(container, W, H);
    var horiz = !!opts.horizontal;

    // Axes
    svg.appendChild(el('line', { x1:ML, y1:MT, x2:ML, y2:MT+CH, stroke:'#aaaacc', 'stroke-width':'2' }));
    svg.appendChild(el('line', { x1:ML, y1:MT+CH, x2:ML+CW, y2:MT+CH, stroke:'#aaaacc', 'stroke-width':'2' }));

    // Y grid lines (4 steps)
    for (var gi = 0; gi <= 4; gi++) {
      var gv = (yMax / 4) * gi;
      var gy = MT + CH - (gv / yMax) * CH;
      svg.appendChild(el('line', { x1:ML, y1:gy, x2:ML+CW, y2:gy, stroke:'#2a2a4a', 'stroke-width':'1' }));
      svg.appendChild(txt(Math.round(gv), { x:ML-8, y:gy, 'font-size':'11', fill:'#8888aa', 'text-anchor':'end' }));
    }

    // Bars
    var barW = Math.min(50, (CW / data.length) * 0.65);
    var gap   = CW / data.length;

    data.forEach(function (d, i) {
      var color = d.color || PALETTE[i % PALETTE.length];
      var bh = (d.value / yMax) * CH;
      var bx = ML + gap * i + (gap - barW) / 2;
      var by = MT + CH - bh;

      svg.appendChild(el('rect', { x:bx.toFixed(1), y:by.toFixed(1), width:barW, height:bh.toFixed(1),
        rx:3, fill:color, 'fill-opacity':'0.85' }));

      // Value on top
      svg.appendChild(txt(d.value, { x:(bx + barW/2).toFixed(1), y:(by-10).toFixed(1),
        'font-size':'11', fill:'#ffffff' }));

      // X label
      svg.appendChild(txt(d.label, { x:(bx + barW/2).toFixed(1), y:(MT+CH+18).toFixed(1),
        'font-size':'11', fill:'#8888aa' }));
    });

    if (opts.yLabel) {
      var yl = txt(opts.yLabel, { x:0, y:0, fill:'#ccccee', 'font-size':'12' });
      yl.setAttribute('transform', 'translate(12,' + (MT+CH/2) + ') rotate(-90)');
      svg.appendChild(yl);
    }
    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:20, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── 6. Clock Face ───────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   hours       {number}  0–12
   *   minutes     {number}  0–59
   *   label       {string}  optional text below clock
   *   showDigital {boolean}
   *   w / h       {number}
   */
  function clockFace(container, opts) {
    opts = opts || {};
    var W = opts.w || 240, H = opts.h || 260;
    var svg = rootSvg(container, W, H);
    var cx = W/2, cy = H/2 - 10, r = Math.min(W, H) * 0.40;
    var hrs = (opts.hours   || 0) % 12;
    var min = (opts.minutes || 0) % 60;

    // Face
    svg.appendChild(el('circle', { cx:cx, cy:cy, r:r, fill:'#12122a', stroke:'#aaaacc', 'stroke-width':'3' }));

    // Hour markers
    for (var hm = 0; hm < 12; hm++) {
      var hAngle = hm * 30;
      var outer = polar(cx, cy, r * 0.92, hAngle);
      var inner = polar(cx, cy, r * (hm % 3 === 0 ? 0.78 : 0.86), hAngle);
      svg.appendChild(el('line', {
        x1:inner.x.toFixed(1), y1:inner.y.toFixed(1),
        x2:outer.x.toFixed(1), y2:outer.y.toFixed(1),
        stroke:'#aaaacc', 'stroke-width': hm % 3 === 0 ? '3' : '1.5'
      }));
      if (hm % 3 === 0) {
        var numP = polar(cx, cy, r * 0.67, hAngle);
        svg.appendChild(txt(hm === 0 ? '12' : hm, {
          x:numP.x.toFixed(1), y:numP.y.toFixed(1), 'font-size':'13', fill:'#ccccee'
        }));
      }
    }

    // Hour hand
    var hDeg  = (hrs + min / 60) * 30;
    var hTip  = polar(cx, cy, r * 0.55, hDeg);
    var hTail = polar(cx, cy, r * 0.12, hDeg + 180);
    svg.appendChild(el('line', {
      x1:hTail.x.toFixed(1), y1:hTail.y.toFixed(1),
      x2:hTip.x.toFixed(1),  y2:hTip.y.toFixed(1),
      stroke:'#ffffff', 'stroke-width':'5', 'stroke-linecap':'round'
    }));

    // Minute hand
    var mDeg  = min * 6;
    var mTip  = polar(cx, cy, r * 0.80, mDeg);
    var mTail = polar(cx, cy, r * 0.15, mDeg + 180);
    svg.appendChild(el('line', {
      x1:mTail.x.toFixed(1), y1:mTail.y.toFixed(1),
      x2:mTip.x.toFixed(1),  y2:mTip.y.toFixed(1),
      stroke:'#4dabf7', 'stroke-width':'3', 'stroke-linecap':'round'
    }));

    // Centre dot
    svg.appendChild(el('circle', { cx:cx, cy:cy, r:5, fill:'#ff6b35' }));

    // Optional digital display
    if (opts.showDigital) {
      var dStr = String(opts.hours || 0).padStart(2,'0') + ':' + String(min).padStart(2,'0');
      svg.appendChild(txt(dStr, { x:cx, y:cy + r + 18, 'font-size':'16', fill:'#4dabf7', 'font-weight':'bold' }));
    }

    if (opts.label) svg.appendChild(txt(opts.label, { x:cx, y:H-10, 'font-size':'12', fill:'#8888aa' }));

    return svg;
  }

  // ── 7. Flow Map ─────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   nodes  {Array} [{id, label, x?, y?, color?, shape?}]  shape: 'rect'|'diamond'|'oval'
   *   edges  {Array} [{from, to, label?}]
   *   title  {string}
   *   w / h  {number}
   */
  function flowMap(container, opts) {
    opts = opts || {};
    var W = opts.w || 440, H = opts.h || 320;
    var svg = rootSvg(container, W, H);
    var nodes = opts.nodes || [];
    var edges = opts.edges || [];

    // Auto-layout nodes in a grid if no positions given
    var cols = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach(function (n, i) {
      if (n.x === undefined) {
        var col = i % cols, row = Math.floor(i / cols);
        n.x = 60 + col * ((W - 80) / Math.max(cols - 1, 1));
        n.y = 60 + row * ((H - 80) / Math.max(Math.ceil(nodes.length / cols) - 1, 1));
      }
    });

    var nodeMap = {};
    nodes.forEach(function (n) { nodeMap[n.id] = n; });

    // Arrowhead marker
    var defs = el('defs', {});
    var marker = el('marker', { id:'arrow', markerWidth:'10', markerHeight:'7',
      refX:'10', refY:'3.5', orient:'auto' });
    marker.appendChild(el('polygon', { points:'0 0, 10 3.5, 0 7', fill:'#aaaacc' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Edges
    edges.forEach(function (e) {
      var from = nodeMap[e.from], to = nodeMap[e.to];
      if (!from || !to) return;
      svg.appendChild(el('line', {
        x1:from.x.toFixed(1), y1:from.y.toFixed(1),
        x2:to.x.toFixed(1),   y2:to.y.toFixed(1),
        stroke:'#aaaacc', 'stroke-width':'2', 'marker-end':'url(#arrow)'
      }));
      if (e.label) {
        svg.appendChild(txt(e.label, {
          x:((from.x + to.x)/2).toFixed(1),
          y:((from.y + to.y)/2 - 8).toFixed(1),
          'font-size':'11', fill:'#ccccee'
        }));
      }
    });

    // Nodes
    nodes.forEach(function (n, i) {
      var color = n.color || PALETTE[i % PALETTE.length];
      var shape = n.shape || 'rect';
      var nw = 90, nh = 34;

      if (shape === 'diamond') {
        var hh = nh * 0.8;
        svg.appendChild(el('polygon', {
          points: [
            n.x + ',' + (n.y - hh),
            (n.x + nw/2) + ',' + n.y,
            n.x + ',' + (n.y + hh),
            (n.x - nw/2) + ',' + n.y
          ].join(' '),
          fill: color, 'fill-opacity':'0.25', stroke:color, 'stroke-width':'2'
        }));
      } else if (shape === 'oval') {
        svg.appendChild(el('ellipse', { cx:n.x, cy:n.y, rx:nw/2, ry:nh/2,
          fill:color, 'fill-opacity':'0.25', stroke:color, 'stroke-width':'2' }));
      } else {
        svg.appendChild(el('rect', { x:n.x - nw/2, y:n.y - nh/2, width:nw, height:nh,
          rx:6, fill:color, 'fill-opacity':'0.25', stroke:color, 'stroke-width':'2' }));
      }

      svg.appendChild(txt(n.label || n.id, { x:n.x, y:n.y, 'font-size':'12', fill:'#ffffff' }));
    });

    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:16, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── 8. Pie Chart ────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   data    {Array} [{label, value, color?}]
   *   title   {string}
   *   donut   {boolean} render as donut chart
   *   w / h   {number}
   */
  function pieChart(container, opts) {
    opts = opts || {};
    var W = opts.w || 340, H = opts.h || 300;
    var svg = rootSvg(container, W, H);
    var data = opts.data || [];
    var total = data.reduce(function(s, d){ return s + d.value; }, 0) || 1;
    var cx = W * 0.42, cy = H * 0.50;
    var r = Math.min(W * 0.36, H * 0.42);
    var innerR = opts.donut ? r * 0.5 : 0;
    var cursor = 0;

    data.forEach(function (d, i) {
      var sweep = (d.value / total) * 360;
      var color = d.color || PALETTE[i % PALETTE.length];
      var midDeg = cursor + sweep / 2;

      if (sweep >= 360) {
        // Full circle
        svg.appendChild(el('circle', { cx:cx, cy:cy, r:r, fill:color }));
      } else {
        var pathD = arcPath(cx, cy, r, cursor, cursor + sweep);
        svg.appendChild(el('path', { d:pathD, fill:color, 'fill-opacity':'0.85',
          stroke:'#1a1a2e', 'stroke-width':'2' }));
      }

      // Donut hole
      if (opts.donut) {
        svg.appendChild(el('circle', { cx:cx, cy:cy, r:innerR, fill:'#1a1a2e' }));
      }

      // Slice label (only for slices > 8%)
      if (d.value / total > 0.08) {
        var lp = polar(cx, cy, r * (opts.donut ? 0.72 : 0.65), midDeg);
        svg.appendChild(txt(Math.round(d.value / total * 100) + '%', {
          x:lp.x.toFixed(1), y:lp.y.toFixed(1), 'font-size':'12', fill:'#ffffff', 'font-weight':'bold'
        }));
      }

      cursor += sweep;
    });

    // Legend
    data.forEach(function (d, i) {
      var ly = H * 0.18 + i * 22;
      var lx = W * 0.76;
      var color = d.color || PALETTE[i % PALETTE.length];
      svg.appendChild(el('rect', { x:lx, y:ly-7, width:14, height:14, rx:3, fill:color }));
      var lt = el('text', { x:lx+20, y:ly+1, 'font-family':'sans-serif', 'font-size':'12', fill:'#ccccee', 'dominant-baseline':'central' });
      lt.textContent = d.label;
      svg.appendChild(lt);
    });

    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:16, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── 9. Polygon ──────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   sides       {number}  3–12, default 6
   *   label       {string}  centre label
   *   vertexLabels {Array}  labels at each vertex
   *   color       {string}
   *   filled      {boolean} default true
   *   title       {string}
   *   w / h       {number}
   */
  function polygon(container, opts) {
    opts = opts || {};
    var W = opts.w || 280, H = opts.h || 280;
    var svg = rootSvg(container, W, H);
    var sides = Math.max(3, Math.min(12, opts.sides || 6));
    var cx = W/2, cy = H/2 + 10;
    var r = Math.min(W, H) * 0.36;
    var color = opts.color || PALETTE[0];

    var pts = [];
    for (var i = 0; i < sides; i++) {
      var p = polar(cx, cy, r, i * (360 / sides));
      pts.push(p.x.toFixed(2) + ',' + p.y.toFixed(2));
    }

    svg.appendChild(el('polygon', {
      points: pts.join(' '),
      fill: opts.filled !== false ? color : 'none',
      'fill-opacity': opts.filled !== false ? '0.2' : '0',
      stroke: color,
      'stroke-width': '2.5',
      'stroke-linejoin': 'round'
    }));

    // Vertex labels
    if (opts.vertexLabels) {
      opts.vertexLabels.slice(0, sides).forEach(function (vl, i) {
        var p = polar(cx, cy, r + 18, i * (360 / sides));
        svg.appendChild(txt(vl, { x:p.x.toFixed(1), y:p.y.toFixed(1), 'font-size':'12', fill:'#ccccee' }));
      });
    }

    // Side count label in centre
    var centreText = opts.label || (sides + ' sides');
    svg.appendChild(txt(centreText, { x:cx, y:cy, 'font-size':'14', fill:'#ffffff', 'font-weight':'bold' }));

    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:16, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── 10. Tree (hierarchical) ─────────────────────────────────────────────────
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   root  {object} { label, color?, children?: [...same] }
   *   title {string}
   *   w / h {number}
   */
  function tree(container, opts) {
    opts = opts || {};
    var W = opts.w || 440, H = opts.h || 320;
    var svg = rootSvg(container, W, H);
    var root = opts.root || { label: 'Root' };

    // Measure depth and max breadth per level
    function levels(node, depth) {
      var result = [[node]];
      if (node.children && node.children.length) {
        var childLevels = node.children.map(function(c){ return levels(c, depth+1); });
        var maxDepth = Math.max.apply(null, childLevels.map(function(l){ return l.length; }));
        for (var d = 0; d < maxDepth; d++) {
          var row = [];
          childLevels.forEach(function(cl){ if (cl[d]) row = row.concat(cl[d]); });
          result.push(row);
        }
      }
      return result;
    }

    var lvls = levels(root, 0);
    var MT = 40, MB = 20;
    var levelH = (H - MT - MB) / Math.max(lvls.length - 1, 1);

    // Assign positions
    function assignPos(node, depth, siblings, sibIndex) {
      var row = lvls[depth];
      var idx = row.indexOf(node);
      node._x = (idx + 0.5) * (W / row.length);
      node._y = MT + depth * levelH;
      if (node.children) {
        node.children.forEach(function(c, i){ assignPos(c, depth+1, node.children, i); });
      }
    }
    assignPos(root, 0, [root], 0);

    // Draw edges then nodes
    function drawEdges(node) {
      if (!node.children) return;
      node.children.forEach(function(c) {
        svg.appendChild(el('line', {
          x1:node._x.toFixed(1), y1:(node._y + 14).toFixed(1),
          x2:c._x.toFixed(1),    y2:(c._y - 14).toFixed(1),
          stroke:'#aaaacc', 'stroke-width':'1.5'
        }));
        drawEdges(c);
      });
    }

    function drawNodes(node, depth) {
      var color = node.color || PALETTE[depth % PALETTE.length];
      svg.appendChild(el('rect', {
        x:(node._x - 38).toFixed(1), y:(node._y - 14).toFixed(1),
        width:76, height:28, rx:6,
        fill:color, 'fill-opacity':'0.25', stroke:color, 'stroke-width':'2'
      }));
      svg.appendChild(txt(node.label, { x:node._x.toFixed(1), y:node._y.toFixed(1), 'font-size':'12', fill:'#ffffff' }));
      if (node.children) node.children.forEach(function(c){ drawNodes(c, depth+1); });
    }

    drawEdges(root);
    drawNodes(root, 0);

    if (opts.title) svg.appendChild(txt(opts.title, { x:W/2, y:18, 'font-size':'14', 'font-weight':'bold' }));

    return svg;
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  var AGNI_SVG = {
    venn:        venn,
    axis:        axis,
    numberLine:  numberLine,
    balanceScale: balanceScale,
    barGraph:    barGraph,
    clockFace:   clockFace,
    flowMap:     flowMap,
    pieChart:    pieChart,
    polygon:     polygon,
    tree:        tree
  };

  // Attach to AGNI_SHARED if present, and expose globally
  if (global.AGNI_SHARED) {
    global.AGNI_SHARED.svg = AGNI_SVG;
  }
  global.AGNI_SVG = AGNI_SVG;

  if (global.DEV_MODE) console.log('[SVG-FACTORIES] loaded – factories:', Object.keys(AGNI_SVG).join(', '));

}(window));
