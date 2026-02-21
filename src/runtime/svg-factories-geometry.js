// src/runtime/svg-factories-geometry.js
// AGNI Geometry SVG Factories
// Provides dynamic polygon transforms, decomposition, a full Cartesian grid
// system, and an animated trig unit circle.
//
// Requires: svg-stage.js
// Load order: svg-stage.js → svg-factories.js → svg-factories-geometry.js
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // ── SVG helpers ─────────────────────────────────────────────────────────────
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function txt(content, attrs) {
    var e = el('text', Object.assign({
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'sans-serif', 'font-size': '13', 'fill': '#ffffff'
    }, attrs));
    e.textContent = content;
    return e;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  var PALETTE = ['#4dabf7','#ff6b35','#51cf66','#fcc419','#cc5de8','#ff8787','#20c997','#f06595'];

  if (!global.AGNI_SVG) global.AGNI_SVG = {};
  var SVG = global.AGNI_SVG;

  // ── Geometry math helpers ───────────────────────────────────────────────────

  /** Regular polygon vertices centred at (cx,cy) with circumradius r */
  function regularVertices(sides, cx, cy, r, startAngleDeg) {
    startAngleDeg = startAngleDeg !== undefined ? startAngleDeg : -90;
    var pts = [];
    for (var i = 0; i < sides; i++) {
      var deg = startAngleDeg + i * (360 / sides);
      var rad = deg * Math.PI / 180;
      pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
    }
    return pts;
  }

  /** Arbitrary polygon vertices from a flat array or [{x,y}] array */
  function normaliseVerts(verts) {
    if (!verts || verts.length === 0) return [];
    if (typeof verts[0] === 'number') {
      var out = [];
      for (var i = 0; i < verts.length; i += 2) out.push({ x: verts[i], y: verts[i+1] });
      return out;
    }
    return verts;
  }

  /** Centroid of a polygon */
  function centroid(pts) {
    var sx = 0, sy = 0;
    pts.forEach(function (p) { sx += p.x; sy += p.y; });
    return { x: sx / pts.length, y: sy / pts.length };
  }

  /** Rotate a point around an origin */
  function rotatePoint(p, origin, angleDeg) {
    var rad = angleDeg * Math.PI / 180;
    var dx = p.x - origin.x, dy = p.y - origin.y;
    return {
      x: origin.x + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: origin.y + dx * Math.sin(rad) + dy * Math.cos(rad)
    };
  }

  /** Scale a point around an origin */
  function scalePoint(p, origin, sx, sy) {
    return {
      x: origin.x + (p.x - origin.x) * sx,
      y: origin.y + (p.y - origin.y) * sy
    };
  }

  /** Convert [{x,y}] to SVG points string */
  function toPoints(pts) {
    return pts.map(function (p) { return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join(' ');
  }

  /** Fan-triangulate a polygon from its centroid */
  function fanTriangles(pts, c) {
    c = c || centroid(pts);
    var tris = [];
    for (var i = 0; i < pts.length; i++) {
      tris.push([c, pts[i], pts[(i + 1) % pts.length]]);
    }
    return tris;
  }

  /** Signed area (positive = CCW) */
  function signedArea(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return a / 2;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Dynamic Polygon
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage
   * @param {object} opts
   *   sides        {number}   regular polygon sides (3–24). Ignored if verts given.
   *   verts        {Array}    [{x,y}] custom vertices (absolute SVG coords)
   *   cx / cy      {number}   centre (default: stage centre). Used for regular polygons.
   *   r            {number}   circumradius for regular polygons
   *   color        {string}
   *   fillOpacity  {number}   0–1, default 0.2
   *   showCentroid {boolean}
   *   showVertexLabels {Array|boolean}  true = A,B,C... or provide custom array
   *   showSideLabels   {boolean}  show computed side lengths
   *   showAngles       {boolean}  show interior angles at each vertex
   *
   *   — Rotation —
   *   rotate          {number}    initial rotation degrees
   *   rotateAnimation {boolean}   auto-spin
   *   rotateSpeed     {number}    degrees/sec (default 30)
   *   rotateSensor    {string}    sensorId → value mapped to rotation angle
   *   rotateSensorMin {number}
   *   rotateSensorMax {number}    maps to 0–360 degrees
   *   rotateOrigin    {string|object}  'centroid'|'vertex:0'|{x,y}  default 'centroid'
   *
   *   — Scale —
   *   scale           {number|[sx,sy]}  initial scale (default 1)
   *   scaleSensor     {string}    sensorId → value mapped to scale
   *   scaleSensorMin  {number}
   *   scaleSensorMax  {number}    maps to scaleMin–scaleMax
   *   scaleMin        {number}    default 0.3
   *   scaleMax        {number}    default 2.0
   *   scaleAnimation  {boolean}   breathing pulse animation
   *
   *   — Decomposition —
   *   decompose       {string}    'triangles'|'strips'|'none'  (default 'none')
   *   decomposeAnimate {boolean}  animate the separation
   *
   *   title           {string}
   */
  SVG.polygonDynamic = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h;
    var cx = opts.cx !== undefined ? opts.cx : W / 2;
    var cy = opts.cy !== undefined ? opts.cy : H / 2;
    var r  = opts.r  !== undefined ? opts.r  : Math.min(W, H) * 0.32;
    var color = opts.color || PALETTE[0];
    var fillOpacity = opts.fillOpacity !== undefined ? opts.fillOpacity : 0.2;

    var layer = stage.layer('polygon-dynamic');
    var decompLayer = stage.layer('polygon-decomp');

    // ── Compute base vertices ─────────────────────────────────────────────────
    var baseVerts;
    if (opts.verts) {
      baseVerts = normaliseVerts(opts.verts);
    } else {
      var sides = Math.max(3, Math.min(24, opts.sides || 6));
      baseVerts = regularVertices(sides, cx, cy, r);
    }

    // ── Rotation origin ───────────────────────────────────────────────────────
    function resolveOrigin(verts) {
      var ro = opts.rotateOrigin || 'centroid';
      if (ro === 'centroid') return centroid(verts);
      if (typeof ro === 'object') return ro;
      if (typeof ro === 'string' && ro.startsWith('vertex:')) {
        var idx = parseInt(ro.split(':')[1]) || 0;
        return verts[idx % verts.length];
      }
      return centroid(verts);
    }

    // ── State ─────────────────────────────────────────────────────────────────
    var _rotDeg   = opts.rotate || 0;
    var _scale    = Array.isArray(opts.scale) ? opts.scale : [opts.scale || 1, opts.scale || 1];
    var _decompose = opts.decompose || 'none';
    var _decompSep = 0;   // 0 = together, 1 = fully separated

    // ── Main polygon element ──────────────────────────────────────────────────
    var polyEl = el('polygon', {
      points: toPoints(baseVerts),
      fill: color, 'fill-opacity': fillOpacity,
      stroke: color, 'stroke-width': '2.5', 'stroke-linejoin': 'round'
    });
    layer.appendChild(polyEl);

    // ── Centroid dot ──────────────────────────────────────────────────────────
    var centDot = null;
    if (opts.showCentroid) {
      centDot = el('circle', { r: 4, fill: '#ff6b35', stroke: '#fff', 'stroke-width': '1.5' });
      layer.appendChild(centDot);
    }

    // ── Vertex labels ─────────────────────────────────────────────────────────
    var vertLabelEls = [];
    var vertLabelNames = [];
    if (opts.showVertexLabels) {
      vertLabelNames = Array.isArray(opts.showVertexLabels)
        ? opts.showVertexLabels
        : baseVerts.map(function (_, i) { return String.fromCharCode(65 + i); });
      baseVerts.forEach(function (_, i) {
        var t = txt(vertLabelNames[i] || '', { 'font-size': '13', fill: '#ccccee', 'font-weight': 'bold' });
        layer.appendChild(t);
        vertLabelEls.push(t);
      });
    }

    // ── Side length labels ────────────────────────────────────────────────────
    var sideLabelEls = [];
    if (opts.showSideLabels) {
      baseVerts.forEach(function (_, i) {
        var t = txt('', { 'font-size': '11', fill: '#8888aa' });
        layer.appendChild(t);
        sideLabelEls.push(t);
      });
    }

    // ── Angle arc elements ────────────────────────────────────────────────────
    var angleEls = [];
    if (opts.showAngles) {
      baseVerts.forEach(function () {
        var g = el('g', {});
        var arc = el('path', { fill: 'none', stroke: '#fcc419', 'stroke-width': '1.5' });
        var label = txt('', { 'font-size': '10', fill: '#fcc419' });
        g.appendChild(arc);
        g.appendChild(label);
        layer.appendChild(g);
        angleEls.push({ arc: arc, label: label });
      });
    }

    // ── Decomposition triangle elements ───────────────────────────────────────
    var decompEls = [];

    function rebuildDecompEls(verts) {
      while (decompLayer.firstChild) decompLayer.removeChild(decompLayer.firstChild);
      decompEls = [];
      if (_decompose === 'none') return;

      var c = centroid(verts);
      var tris = fanTriangles(verts, c);
      tris.forEach(function (tri, i) {
        var triColor = PALETTE[i % PALETTE.length];
        var triEl = el('polygon', {
          points: toPoints(tri),
          fill: triColor, 'fill-opacity': '0.35',
          stroke: triColor, 'stroke-width': '1.5'
        });
        decompLayer.appendChild(triEl);
        decompEls.push({ el: triEl, base: tri, centroid: centroid(tri) });
      });
    }

    // ── Interior angle calculation ────────────────────────────────────────────
    function interiorAngle(prev, curr, next) {
      var v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
      var v2 = { x: next.x - curr.x, y: next.y - curr.y };
      var dot = v1.x*v2.x + v1.y*v2.y;
      var mag = Math.sqrt(v1.x*v1.x+v1.y*v1.y) * Math.sqrt(v2.x*v2.x+v2.y*v2.y);
      return mag === 0 ? 0 : Math.acos(clamp(dot/mag, -1, 1)) * 180 / Math.PI;
    }

    // ── Angle arc SVG path ─────────────────────────────────────────────────────
    function angleArcPath(vertex, prev, next, arcR) {
      arcR = arcR || 18;
      var a1 = Math.atan2(prev.y - vertex.y, prev.x - vertex.x);
      var a2 = Math.atan2(next.y - vertex.y, next.x - vertex.x);
      // Ensure we draw the interior arc
      var sweep = a2 - a1;
      if (sweep > Math.PI)  sweep -= 2 * Math.PI;
      if (sweep < -Math.PI) sweep += 2 * Math.PI;
      var p1 = { x: vertex.x + arcR * Math.cos(a1), y: vertex.y + arcR * Math.sin(a1) };
      var p2 = { x: vertex.x + arcR * Math.cos(a2), y: vertex.y + arcR * Math.sin(a2) };
      var large = Math.abs(sweep) > Math.PI ? 1 : 0;
      var clockwise = sweep > 0 ? 1 : 0;
      return 'M ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) +
             ' A ' + arcR + ' ' + arcR + ' 0 ' + large + ' ' + clockwise +
             ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }

    // ── Master render — applies rotation, scale, then updates all elements ─────
    function render() {
      var n = baseVerts.length;
      var origin = resolveOrigin(baseVerts);

      // Apply rotation then scale to base vertices
      var verts = baseVerts.map(function (p) {
        var p2 = rotatePoint(p, origin, _rotDeg);
        return scalePoint(p2, origin, _scale[0], _scale[1]);
      });
      var c = centroid(verts);

      polyEl.setAttribute('points', toPoints(verts));

      if (centDot) {
        centDot.setAttribute('cx', c.x.toFixed(1));
        centDot.setAttribute('cy', c.y.toFixed(1));
      }

      // Vertex labels — placed outside polygon at scaled-up radius
      vertLabelEls.forEach(function (t, i) {
        var p = verts[i];
        var dx = p.x - c.x, dy = p.y - c.y;
        var len = Math.sqrt(dx*dx+dy*dy) || 1;
        t.setAttribute('x', (p.x + dx/len * 16).toFixed(1));
        t.setAttribute('y', (p.y + dy/len * 16).toFixed(1));
      });

      // Side labels
      sideLabelEls.forEach(function (t, i) {
        var a = verts[i], b = verts[(i+1) % n];
        var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx*dx+dy*dy);
        // Offset label perpendicular to side
        var nx = -dy/len * 12, ny = dx/len * 12;
        // Bias toward centroid
        var toCx = c.x - midX, toCy = c.y - midY;
        if (nx*toCx + ny*toCy > 0) { nx = -nx; ny = -ny; }
        t.setAttribute('x', (midX + nx).toFixed(1));
        t.setAttribute('y', (midY + ny).toFixed(1));
        t.textContent = len.toFixed(1);
      });

      // Angle arcs
      angleEls.forEach(function (ae, i) {
        var prev = verts[(i - 1 + n) % n];
        var curr = verts[i];
        var next = verts[(i + 1) % n];
        var angle = interiorAngle(prev, curr, next);
        ae.arc.setAttribute('d', angleArcPath(curr, prev, next, 14));
        // Label at mid of arc
        var a1 = Math.atan2(prev.y-curr.y, prev.x-curr.x);
        var a2 = Math.atan2(next.y-curr.y, next.x-curr.x);
        var mid = (a1 + a2) / 2;
        ae.label.setAttribute('x', (curr.x + 26 * Math.cos(mid)).toFixed(1));
        ae.label.setAttribute('y', (curr.y + 26 * Math.sin(mid)).toFixed(1));
        ae.label.textContent = Math.round(angle) + '°';
      });

      // Decomposition triangles — animate separation
      if (decompEls.length > 0) {
        var gC = centroid(verts);
        var tris = fanTriangles(verts, gC);
        decompEls.forEach(function (de, i) {
          var triC = centroid(tris[i]);
          var dx = (triC.x - gC.x) * _decompSep * 0.3;
          var dy = (triC.y - gC.y) * _decompSep * 0.3;
          var separated = tris[i].map(function (p) {
            return { x: p.x + dx, y: p.y + dy };
          });
          de.el.setAttribute('points', toPoints(separated));
        });
        // Hide main poly when fully separated
        polyEl.setAttribute('opacity', (1 - _decompSep * 0.7).toFixed(2));
      } else {
        polyEl.setAttribute('opacity', '1');
      }
    }

    rebuildDecompEls(baseVerts);
    render();

    if (opts.title) layer.appendChild(txt(opts.title, { x: W/2, y: 16, 'font-size': '14', 'font-weight': 'bold' }));

    // ── Rotation: animation ───────────────────────────────────────────────────
    if (opts.rotateAnimation) {
      var speed = opts.rotateSpeed || 30;
      stage.onTick(function (t, dt) {
        _rotDeg = (_rotDeg + speed * dt) % 360;
        render();
      });
    }

    // ── Scale: breathing animation ────────────────────────────────────────────
    if (opts.scaleAnimation) {
      var sMin = opts.scaleMin || 0.7, sMax = opts.scaleMax || 1.3;
      stage.onTick(function (t) {
        var s = sMin + (sMax - sMin) * (0.5 + 0.5 * Math.sin(t * 1.5));
        _scale = [s, s];
        render();
      });
    }

    // ── Rotation: sensor ─────────────────────────────────────────────────────
    if (opts.rotateSensor) {
      var rMin = opts.rotateSensorMin || 0;
      var rMax = opts.rotateSensorMax || 10;
      stage.bindSensor(opts.rotateSensor, function (reading) {
        _rotDeg = ((reading.value - rMin) / (rMax - rMin)) * 360;
        render();
      });
    }

    // ── Scale: sensor ─────────────────────────────────────────────────────────
    if (opts.scaleSensor) {
      var ssMin = opts.scaleSensorMin || 0;
      var ssMax = opts.scaleSensorMax || 10;
      var scMin = opts.scaleMin || 0.3;
      var scMax = opts.scaleMax || 2.0;
      stage.bindSensor(opts.scaleSensor, function (reading) {
        var s = scMin + ((reading.value - ssMin) / (ssMax - ssMin)) * (scMax - scMin);
        s = clamp(s, scMin, scMax);
        _scale = [s, s];
        render();
      });
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
      /** Set rotation in degrees */
      rotate: function (deg) { _rotDeg = deg; render(); },

      /** Set scale — pass a single number or [sx, sy] */
      scale: function (s) {
        _scale = Array.isArray(s) ? s : [s, s];
        render();
      },

      /**
       * Decompose the polygon.
       * @param {string} mode  'triangles' | 'strips' | 'none'
       * @param {boolean} animate  if true, gradually separate over 0.8s
       */
      decompose: function (mode, animate) {
        _decompose = mode || 'triangles';
        rebuildDecompEls(baseVerts);
        if (animate) {
          var start = null;
          var dur = 800;
          var tickId = stage.onTick(function (t) {
            if (start === null) start = t;
            _decompSep = clamp((t - start) * 1000 / dur, 0, 1);
            render();
            if (_decompSep >= 1) stage.offTick(tickId);
          });
        } else {
          _decompSep = 1;
          render();
        }
      },

      /** Recompose — animate triangles back together */
      recompose: function (animate) {
        if (animate) {
          var start = null, dur = 800, startSep = _decompSep;
          var tickId = stage.onTick(function (t) {
            if (start === null) start = t;
            _decompSep = startSep * clamp(1 - (t - start) * 1000 / dur, 0, 1);
            render();
            if (_decompSep <= 0) {
              _decompose = 'none';
              rebuildDecompEls(baseVerts);
              render();
              stage.offTick(tickId);
            }
          });
        } else {
          _decompSep = 0;
          _decompose = 'none';
          rebuildDecompEls(baseVerts);
          render();
        }
      },

      /** Get current transformed vertices */
      getVerts: function () {
        var origin = resolveOrigin(baseVerts);
        return baseVerts.map(function (p) {
          return scalePoint(rotatePoint(p, origin, _rotDeg), origin, _scale[0], _scale[1]);
        });
      },

      /** Force a re-render (e.g. after external state change) */
      render: render
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Cartesian Grid
  //    A full coordinate system that other objects paint into.
  //    Supports dynamic function plots, moving points, tangent lines,
  //    and rise/run slope triangles.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage
   * @param {object} opts
   *   xMin/xMax    {number}   default -5/5
   *   yMin/yMax    {number}   default -4/4
   *   xStep        {number}   grid/tick spacing (default 1)
   *   yStep        {number}   grid/tick spacing (default 1)
   *   showGrid     {boolean}  default true
   *   showMinorGrid {boolean} default false
   *   labelAxes    {boolean}  default true
   *   xLabel       {string}
   *   yLabel       {string}
   *   title        {string}
   *   padding      {object}   {l,r,t,b} pixel margins (default 40 each)
   *
   * @returns {GridObject}
   *   .plot(fn, color, opts)       — plot y=fn(x)
   *   .plotParametric(xFn, yFn)    — parametric curve
   *   .point(x, y, opts)           — place a point {label, color, r}
   *   .segment(x1,y1,x2,y2, opts) — draw a line segment
   *   .tangent(fn, x, opts)        — draw tangent line at x
   *   .slopeTriangle(fn, x1, x2, opts) — rise/run triangle
   *   .secant(fn, x1, x2, opts)    — secant line
   *   .vector(ox,oy,dx,dy, opts)   — draw a vector arrow
   *   .clear(layerName)            — clear a named sublayer
   *   .toScreen(x,y)               — world → screen coords
   *   .fromScreen(sx,sy)           — screen → world coords
   *   .animate(fn, tickFn)         — animate a plotted function
   */
  SVG.cartesianGrid = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h;
    var pad = Object.assign({ l: 48, r: 20, t: 30, b: 40 }, opts.padding || {});
    var CW = W - pad.l - pad.r;
    var CH = H - pad.t - pad.b;

    var xMin = opts.xMin !== undefined ? opts.xMin : -5;
    var xMax = opts.xMax !== undefined ? opts.xMax : 5;
    var yMin = opts.yMin !== undefined ? opts.yMin : -4;
    var yMax = opts.yMax !== undefined ? opts.yMax : 4;
    var xStep = opts.xStep || 1;
    var yStep = opts.yStep || 1;

    // ── Coordinate transforms ─────────────────────────────────────────────────
    function toScreenX(wx) { return pad.l + ((wx - xMin) / (xMax - xMin)) * CW; }
    function toScreenY(wy) { return pad.t + CH - ((wy - yMin) / (yMax - yMin)) * CH; }
    function toWorldX(sx) { return xMin + ((sx - pad.l) / CW) * (xMax - xMin); }
    function toWorldY(sy) { return yMin + ((pad.t + CH - sy) / CH) * (yMax - yMin); }

    // Clamp screen coords to grid area
    function inBounds(wx, wy) {
      return wx >= xMin && wx <= xMax && wy >= yMin && wy <= yMax;
    }

    // ── Layers ────────────────────────────────────────────────────────────────
    var gridLayer    = stage.layer('grid-scaffold');
    var plotLayer    = stage.layer('grid-plots');
    var overlayLayer = stage.layer('grid-overlay');
    var labelLayer   = stage.layer('grid-labels');

    // ── Arrowhead marker ──────────────────────────────────────────────────────
    var defs = el('defs', {});
    stage.svg.insertBefore(defs, stage.svg.firstChild);
    function makeMarker(id, color, size) {
      var m = el('marker', { id: id, markerWidth: size||8, markerHeight: size||6,
        refX: (size||8)-1, refY: (size||6)/2, orient: 'auto' });
      m.appendChild(el('polygon', { points: '0 0, '+(size||8)+' '+(size||6)/2+', 0 '+(size||6), fill: color }));
      defs.appendChild(m);
    }
    makeMarker('axis-arrow', '#aaaacc', 8);

    // ── Draw scaffold (grid, axes, labels) ────────────────────────────────────
    var ox = toScreenX(0), oy = toScreenY(0);   // origin in screen space

    // Minor grid
    if (opts.showMinorGrid) {
      var xMinorStep = xStep / 5, yMinorStep = yStep / 5;
      for (var mx = xMin; mx <= xMax; mx += xMinorStep) {
        gridLayer.appendChild(el('line', {
          x1: toScreenX(mx).toFixed(1), y1: pad.t,
          x2: toScreenX(mx).toFixed(1), y2: pad.t + CH,
          stroke: '#1a1a38', 'stroke-width': '0.5'
        }));
      }
      for (var my = yMin; my <= yMax; my += yMinorStep) {
        gridLayer.appendChild(el('line', {
          x1: pad.l, y1: toScreenY(my).toFixed(1),
          x2: pad.l + CW, y2: toScreenY(my).toFixed(1),
          stroke: '#1a1a38', 'stroke-width': '0.5'
        }));
      }
    }

    // Major grid
    if (opts.showGrid !== false) {
      for (var gx = Math.ceil(xMin / xStep) * xStep; gx <= xMax; gx += xStep) {
        gridLayer.appendChild(el('line', {
          x1: toScreenX(gx).toFixed(1), y1: pad.t,
          x2: toScreenX(gx).toFixed(1), y2: pad.t + CH,
          stroke: '#2a2a4a', 'stroke-width': '1'
        }));
      }
      for (var gy = Math.ceil(yMin / yStep) * yStep; gy <= yMax; gy += yStep) {
        gridLayer.appendChild(el('line', {
          x1: pad.l, y1: toScreenY(gy).toFixed(1),
          x2: pad.l + CW, y2: toScreenY(gy).toFixed(1),
          stroke: '#2a2a4a', 'stroke-width': '1'
        }));
      }
    }

    // Axes
    gridLayer.appendChild(el('line', {
      x1: pad.l, y1: oy.toFixed(1), x2: pad.l + CW, y2: oy.toFixed(1),
      stroke: '#aaaacc', 'stroke-width': '2', 'marker-end': 'url(#axis-arrow)'
    }));
    gridLayer.appendChild(el('line', {
      x1: ox.toFixed(1), y1: pad.t + CH, x2: ox.toFixed(1), y2: pad.t,
      stroke: '#aaaacc', 'stroke-width': '2', 'marker-end': 'url(#axis-arrow)'
    }));

    // Tick labels
    if (opts.labelAxes !== false) {
      for (var tx = Math.ceil(xMin / xStep) * xStep; tx <= xMax; tx += xStep) {
        if (Math.abs(tx) < xStep * 0.01) continue;
        var tl = txt(tx, { x: toScreenX(tx).toFixed(1), y: (oy + 16).toFixed(1),
          'font-size': '11', fill: '#8888aa' });
        gridLayer.appendChild(tl);
        gridLayer.appendChild(el('line', {
          x1: toScreenX(tx).toFixed(1), y1: (oy - 4).toFixed(1),
          x2: toScreenX(tx).toFixed(1), y2: (oy + 4).toFixed(1),
          stroke: '#aaaacc', 'stroke-width': '1.5'
        }));
      }
      for (var ty = Math.ceil(yMin / yStep) * yStep; ty <= yMax; ty += yStep) {
        if (Math.abs(ty) < yStep * 0.01) continue;
        gridLayer.appendChild(txt(ty, { x: (ox - 10).toFixed(1), y: toScreenY(ty).toFixed(1),
          'font-size': '11', fill: '#8888aa', 'text-anchor': 'end' }));
        gridLayer.appendChild(el('line', {
          x1: (ox - 4).toFixed(1), y1: toScreenY(ty).toFixed(1),
          x2: (ox + 4).toFixed(1), y2: toScreenY(ty).toFixed(1),
          stroke: '#aaaacc', 'stroke-width': '1.5'
        }));
      }
      // Axis name labels
      if (opts.xLabel) {
        gridLayer.appendChild(txt(opts.xLabel, { x: pad.l + CW - 10, y: (oy + 26).toFixed(1),
          'font-size': '13', fill: '#ccccee', 'text-anchor': 'end' }));
      }
      if (opts.yLabel) {
        var yl = txt(opts.yLabel, { x: 0, y: 0, 'font-size': '13', fill: '#ccccee' });
        yl.setAttribute('transform', 'translate(' + (ox - 26).toFixed(1) + ',' + (pad.t + 10).toFixed(1) + ')');
        gridLayer.appendChild(yl);
      }
    }

    if (opts.title) {
      gridLayer.appendChild(txt(opts.title, { x: W/2, y: 16, 'font-size': '14', 'font-weight': 'bold' }));
    }

    // ── Internal sublayer registry ────────────────────────────────────────────
    var _sublayers = {};
    function sublayer(name) {
      if (!_sublayers[name]) {
        var g = el('g', { id: 'grid-sub-' + name });
        overlayLayer.appendChild(g);
        _sublayers[name] = g;
      }
      return _sublayers[name];
    }
    function clearSublayer(name) {
      var g = _sublayers[name];
      if (g) { while (g.firstChild) g.removeChild(g.firstChild); }
    }

    // ── Plot builder ──────────────────────────────────────────────────────────
    function buildPolyline(fn, color, strokeWidth, steps, dashed) {
      steps = steps || 300;
      var pts = [];
      var prevValid = false;
      for (var i = 0; i <= steps; i++) {
        var wx = xMin + (i / steps) * (xMax - xMin);
        var wy;
        try { wy = fn(wx); } catch(e) { prevValid = false; continue; }
        if (!isFinite(wy) || isNaN(wy)) { prevValid = false; continue; }
        if (!inBounds(wx, clamp(wy, yMin, yMax))) { prevValid = false; }
        pts.push(toScreenX(wx).toFixed(1) + ',' + toScreenY(clamp(wy, yMin, yMax)).toFixed(1));
        prevValid = true;
      }
      var pl = el('polyline', {
        points: pts.join(' '),
        fill: 'none', stroke: color || PALETTE[0],
        'stroke-width': strokeWidth || '2.5',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      });
      if (dashed) pl.setAttribute('stroke-dasharray', '6,4');
      return pl;
    }

    // ── Grid public API ───────────────────────────────────────────────────────
    var grid = {
      toScreen: function (wx, wy) { return { x: toScreenX(wx), y: toScreenY(wy) }; },
      fromScreen: function (sx, sy) { return { x: toWorldX(sx), y: toWorldY(sy) }; },

      /** Plot y = fn(x) */
      plot: function (fn, color, plotOpts) {
        plotOpts = plotOpts || {};
        var name = plotOpts.layer || 'plot-' + Date.now();
        var g = sublayer(name);
        g.appendChild(buildPolyline(fn, color, plotOpts.width, plotOpts.steps, plotOpts.dashed));
        return { layer: name };
      },

      /** Plot a parametric curve {x:fn(t), y:fn(t)}, tMin–tMax */
      plotParametric: function (xFn, yFn, color, plotOpts) {
        plotOpts = plotOpts || {};
        var tMin = plotOpts.tMin || 0, tMax = plotOpts.tMax || (2 * Math.PI);
        var steps = plotOpts.steps || 400;
        var pts = [];
        for (var i = 0; i <= steps; i++) {
          var t = tMin + (i / steps) * (tMax - tMin);
          var wx = xFn(t), wy = yFn(t);
          if (!isFinite(wx) || !isFinite(wy)) continue;
          pts.push(toScreenX(clamp(wx, xMin, xMax)).toFixed(1) + ',' +
                   toScreenY(clamp(wy, yMin, yMax)).toFixed(1));
        }
        var name = plotOpts.layer || 'param-' + Date.now();
        var g = sublayer(name);
        var pl = el('polyline', { points: pts.join(' '), fill: 'none',
          stroke: color || PALETTE[2], 'stroke-width': plotOpts.width || '2' });
        g.appendChild(pl);
        return { layer: name };
      },

      /** Place a labelled point */
      point: function (wx, wy, pointOpts) {
        pointOpts = pointOpts || {};
        var sx = toScreenX(wx), sy = toScreenY(wy);
        var color = pointOpts.color || '#fcc419';
        var name = pointOpts.layer || 'pts';
        var g = sublayer(name);
        g.appendChild(el('circle', { cx: sx.toFixed(1), cy: sy.toFixed(1),
          r: pointOpts.r || 5, fill: color, stroke: '#fff', 'stroke-width': '1.5' }));
        if (pointOpts.label) {
          var dx = pointOpts.labelDx || 10, dy = pointOpts.labelDy || -10;
          g.appendChild(txt(pointOpts.label, { x: (sx+dx).toFixed(1), y: (sy+dy).toFixed(1),
            'font-size': '12', fill: color, 'text-anchor': 'start' }));
        }
        if (pointOpts.showCoords) {
          g.appendChild(txt('(' + wx.toFixed(1) + ', ' + wy.toFixed(1) + ')',
            { x: (sx+10).toFixed(1), y: (sy+14).toFixed(1), 'font-size': '11', fill: '#8888aa', 'text-anchor': 'start' }));
        }
        // Dashed projection lines to axes
        if (pointOpts.project) {
          g.appendChild(el('line', { x1: sx.toFixed(1), y1: sy.toFixed(1),
            x2: sx.toFixed(1), y2: oy.toFixed(1),
            stroke: color, 'stroke-width': '1', 'stroke-dasharray': '4,3', opacity: '0.5' }));
          g.appendChild(el('line', { x1: sx.toFixed(1), y1: sy.toFixed(1),
            x2: ox.toFixed(1), y2: sy.toFixed(1),
            stroke: color, 'stroke-width': '1', 'stroke-dasharray': '4,3', opacity: '0.5' }));
        }
        return { layer: name };
      },

      /** Draw a line segment in world coords */
      segment: function (wx1, wy1, wx2, wy2, segOpts) {
        segOpts = segOpts || {};
        var name = segOpts.layer || 'segments';
        var g = sublayer(name);
        g.appendChild(el('line', {
          x1: toScreenX(wx1).toFixed(1), y1: toScreenY(wy1).toFixed(1),
          x2: toScreenX(wx2).toFixed(1), y2: toScreenY(wy2).toFixed(1),
          stroke: segOpts.color || '#aaaacc', 'stroke-width': segOpts.width || '1.5',
          'stroke-dasharray': segOpts.dashed ? '6,4' : 'none'
        }));
      },

      /** Draw a vector arrow from (ox,oy) in direction (dx,dy) */
      vector: function (wx, wy, dx, dy, vecOpts) {
        vecOpts = vecOpts || {};
        var color = vecOpts.color || PALETTE[1];
        var name = vecOpts.layer || 'vectors';
        var markId = 'vec-arrow-' + name;
        makeMarker(markId, color, 7);
        var g = sublayer(name);
        g.appendChild(el('line', {
          x1: toScreenX(wx).toFixed(1),      y1: toScreenY(wy).toFixed(1),
          x2: toScreenX(wx+dx).toFixed(1),   y2: toScreenY(wy+dy).toFixed(1),
          stroke: color, 'stroke-width': vecOpts.width || '2.5',
          'marker-end': 'url(#' + markId + ')'
        }));
        if (vecOpts.label) {
          var mx = toScreenX(wx + dx/2), my = toScreenY(wy + dy/2);
          g.appendChild(txt(vecOpts.label, { x: (mx+10).toFixed(1), y: (my-8).toFixed(1),
            'font-size': '12', fill: color, 'text-anchor': 'start' }));
        }
      },

      /**
       * Draw tangent line to fn at x.
       * Shows the instantaneous slope (derivative) with a labelled Δy/Δx.
       */
      tangent: function (fn, wx, tanOpts) {
        tanOpts = tanOpts || {};
        var color = tanOpts.color || '#fcc419';
        var name = tanOpts.layer || 'tangent';
        clearSublayer(name);
        var g = sublayer(name);

        var h = 0.0001;
        var wy = fn(wx);
        var slope = (fn(wx + h) - fn(wx - h)) / (2 * h);

        // Tangent line extends across visible window
        var tLen = tanOpts.length || (xMax - xMin) * 0.4;
        var tx1 = wx - tLen, ty1 = wy - slope * tLen;
        var tx2 = wx + tLen, ty2 = wy + slope * tLen;

        g.appendChild(el('line', {
          x1: toScreenX(tx1).toFixed(1), y1: toScreenY(ty1).toFixed(1),
          x2: toScreenX(tx2).toFixed(1), y2: toScreenY(ty2).toFixed(1),
          stroke: color, 'stroke-width': '2', 'stroke-dasharray': '7,4'
        }));

        // Point of tangency
        g.appendChild(el('circle', { cx: toScreenX(wx).toFixed(1), cy: toScreenY(wy).toFixed(1),
          r: 5, fill: color, stroke: '#fff', 'stroke-width': '1.5' }));

        // Slope label
        if (tanOpts.showSlope !== false) {
          var sx = toScreenX(wx + 0.3), sy = toScreenY(wy + slope * 0.3 + 0.3);
          g.appendChild(txt('m = ' + slope.toFixed(2), { x: sx.toFixed(1), y: sy.toFixed(1),
            'font-size': '12', fill: color, 'text-anchor': 'start', 'font-weight': 'bold' }));
        }
        return { slope: slope, x: wx, y: wy };
      },

      /**
       * Draw a slope (rise/run) triangle between x1 and x2.
       * Classic algebra / calculus teaching tool.
       */
      slopeTriangle: function (fn, wx1, wx2, triOpts) {
        triOpts = triOpts || {};
        var runColor  = triOpts.runColor  || '#4dabf7';
        var riseColor = triOpts.riseColor || '#ff6b35';
        var name = triOpts.layer || 'slope-tri';
        clearSublayer(name);
        var g = sublayer(name);

        var wy1 = fn(wx1), wy2 = fn(wx2);
        var sx1 = toScreenX(wx1), sy1 = toScreenY(wy1);
        var sx2 = toScreenX(wx2), sy2 = toScreenY(wy2);
        var sCorner = { x: sx2, y: sy1 };   // bottom-right of triangle

        // Filled triangle
        g.appendChild(el('polygon', {
          points: sx1.toFixed(1)+','+sy1.toFixed(1)+' '+sCorner.x.toFixed(1)+','+sCorner.y.toFixed(1)+' '+sx2.toFixed(1)+','+sy2.toFixed(1),
          fill: '#ffffff', 'fill-opacity': '0.07', stroke: 'none'
        }));

        // Run (horizontal)
        g.appendChild(el('line', { x1: sx1.toFixed(1), y1: sCorner.y.toFixed(1),
          x2: sCorner.x.toFixed(1), y2: sCorner.y.toFixed(1),
          stroke: runColor, 'stroke-width': '2.5' }));
        g.appendChild(txt('run = ' + (wx2 - wx1).toFixed(2),
          { x: ((sx1 + sCorner.x)/2).toFixed(1), y: (sCorner.y + 16).toFixed(1),
            'font-size': '11', fill: runColor }));

        // Rise (vertical)
        g.appendChild(el('line', { x1: sCorner.x.toFixed(1), y1: sCorner.y.toFixed(1),
          x2: sCorner.x.toFixed(1), y2: sy2.toFixed(1),
          stroke: riseColor, 'stroke-width': '2.5' }));
        g.appendChild(txt('rise = ' + (wy2 - wy1).toFixed(2),
          { x: (sCorner.x + 36).toFixed(1), y: ((sCorner.y + sy2)/2).toFixed(1),
            'font-size': '11', fill: riseColor }));

        // Slope label
        var slope = (wy2 - wy1) / (wx2 - wx1);
        if (triOpts.showSlope !== false) {
          g.appendChild(txt('slope = ' + slope.toFixed(2),
            { x: ((sx1 + sx2)/2).toFixed(1), y: ((sy1 + sy2)/2 - 14).toFixed(1),
              'font-size': '12', fill: '#ffffff', 'font-weight': 'bold' }));
        }
        return { slope: slope, run: wx2 - wx1, rise: wy2 - wy1 };
      },

      /**
       * Draw a secant line through (x1, f(x1)) and (x2, f(x2)).
       * Used to introduce derivative as limit of secant slope.
       */
      secant: function (fn, wx1, wx2, secOpts) {
        secOpts = secOpts || {};
        var color = secOpts.color || '#cc5de8';
        var name = secOpts.layer || 'secant';
        clearSublayer(name);
        var g = sublayer(name);
        var wy1 = fn(wx1), wy2 = fn(wx2);
        var slope = (wy2 - wy1) / (wx2 - wx1);
        // Extend line across view
        var ext = (xMax - xMin) * 0.5;
        g.appendChild(el('line', {
          x1: toScreenX(wx1 - ext).toFixed(1), y1: toScreenY(wy1 - slope*ext).toFixed(1),
          x2: toScreenX(wx2 + ext).toFixed(1), y2: toScreenY(wy2 + slope*ext).toFixed(1),
          stroke: color, 'stroke-width': '1.5', 'stroke-dasharray': '5,4'
        }));
        [{ x: wx1, y: wy1 }, { x: wx2, y: wy2 }].forEach(function (p) {
          g.appendChild(el('circle', { cx: toScreenX(p.x).toFixed(1), cy: toScreenY(p.y).toFixed(1),
            r: 4, fill: color, stroke: '#fff', 'stroke-width': '1.5' }));
        });
        if (secOpts.showSlope !== false) {
          var mx = toScreenX((wx1+wx2)/2), my = toScreenY((wy1+wy2)/2);
          g.appendChild(txt('Δy/Δx = ' + slope.toFixed(2),
            { x: (mx+10).toFixed(1), y: (my-10).toFixed(1), 'font-size': '11', fill: color, 'text-anchor': 'start' }));
        }
        return { slope: slope };
      },

      /** Clear a named sublayer */
      clear: function (name) { clearSublayer(name); },

      /**
       * Animate a function plot — calls updateFn(t) each frame to get the
       * current function, redraws the named layer.
       * @param {function} updateFn  fn(t) → function y=f(x)
       * @param {string}   color
       * @param {string}   layerName
       */
      animate: function (updateFn, color, layerName) {
        layerName = layerName || 'animated-plot';
        var g = sublayer(layerName);
        stage.onTick(function (t) {
          while (g.firstChild) g.removeChild(g.firstChild);
          var fn = updateFn(t);
          if (typeof fn === 'function') {
            g.appendChild(buildPolyline(fn, color || PALETTE[0], '2.5'));
          }
        });
      }
    };

    return grid;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Unit Circle
  //    Animated trig: rotating radius, sine/cosine projections, angle arc.
  //    Perfect for introducing sin, cos, and the relationship between them.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage
   * @param {object} opts
   *   angleDeg     {number}   initial angle (default 45)
   *   animate      {boolean}  auto-rotate
   *   speed        {number}   degrees/sec (default 45)
   *   sensor       {string}   sensorId → drives angle
   *   sensorMin    {number}
   *   sensorMax    {number}   maps to 0–360
   *   showSine     {boolean}  default true
   *   showCosine   {boolean}  default true
   *   showTangent  {boolean}  show tan line
   *   showValues   {boolean}  show numeric sin/cos/angle readout
   *   showGrid     {boolean}  draw unit circle grid
   *   r            {number}   circle radius in px (default ~35% of min dimension)
   *   title        {string}
   *
   * @returns { setAngle(deg) }
   */
  SVG.unitCircle = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h;
    var cx = W * 0.42, cy = H * 0.50;
    var r  = opts.r || Math.min(W, H) * 0.35;

    var layer = stage.layer('unit-circle');

    // ── Static scaffold ───────────────────────────────────────────────────────

    // Dashed unit circle
    layer.appendChild(el('circle', { cx: cx, cy: cy, r: r,
      fill: 'none', stroke: '#3a3a6a', 'stroke-width': '1.5', 'stroke-dasharray': '4,3' }));

    // Axes
    layer.appendChild(el('line', { x1: cx-r-12, y1: cy, x2: cx+r+12, y2: cy, stroke:'#aaaacc', 'stroke-width':'1.5' }));
    layer.appendChild(el('line', { x1: cx, y1: cy+r+12, x2: cx, y2: cy-r-12, stroke:'#aaaacc', 'stroke-width':'1.5' }));

    // Axis labels
    layer.appendChild(txt('1', { x: cx+r+6, y: cy-10, 'font-size':'11', fill:'#8888aa' }));
    layer.appendChild(txt('-1', { x: cx-r-10, y: cy-10, 'font-size':'11', fill:'#8888aa' }));
    layer.appendChild(txt('1', { x: cx+8, y: cy-r-4, 'font-size':'11', fill:'#8888aa' }));
    layer.appendChild(txt('-1', { x: cx+8, y: cy+r+4, 'font-size':'11', fill:'#8888aa' }));

    // Quadrant labels
    ['I','II','III','IV'].forEach(function(q, i) {
      var qx = cx + (i < 2 ? (i===0 ? 1 : -1) : (i===3 ? 1 : -1)) * r * 0.65;
      var qy = cy + (i < 2 ? -r * 0.65 : r * 0.65);
      layer.appendChild(txt(q, { x: qx, y: qy, 'font-size':'11', fill:'#3a3a6a' }));
    });

    // ── Dynamic elements ──────────────────────────────────────────────────────
    // Radius line (hypotenuse)
    var radiusLine = el('line', { stroke:'#ffffff', 'stroke-width':'2.5', 'stroke-linecap':'round' });
    layer.appendChild(radiusLine);

    // Point on circle
    var circlePoint = el('circle', { r:6, fill:'#ff6b35', stroke:'#fff', 'stroke-width':'2' });
    layer.appendChild(circlePoint);

    // Sine projection (vertical, red)
    var sineLine = el('line', { stroke:'#ff6b35', 'stroke-width':'2.5', 'stroke-dasharray':'5,3' });
    var sinLabel = txt('sin θ', { 'font-size':'12', fill:'#ff6b35', 'text-anchor':'start' });
    if (opts.showSine !== false) { layer.appendChild(sineLine); layer.appendChild(sinLabel); }

    // Cosine projection (horizontal, blue)
    var cosineLine = el('line', { stroke:'#4dabf7', 'stroke-width':'2.5', 'stroke-dasharray':'5,3' });
    var cosLabel = txt('cos θ', { 'font-size':'12', fill:'#4dabf7' });
    if (opts.showCosine !== false) { layer.appendChild(cosineLine); layer.appendChild(cosLabel); }

    // Angle arc
    var angleArcEl = el('path', { fill:'none', stroke:'#fcc419', 'stroke-width':'1.5' });
    var angleLabel = txt('θ', { 'font-size':'13', fill:'#fcc419', 'font-weight':'bold' });
    layer.appendChild(angleArcEl);
    layer.appendChild(angleLabel);

    // Tangent line (green)
    var tanLine = null, tanLabel = null;
    if (opts.showTangent) {
      tanLine  = el('line', { stroke:'#51cf66', 'stroke-width':'2' });
      tanLabel = txt('tan θ', { 'font-size':'12', fill:'#51cf66' });
      layer.appendChild(tanLine);
      layer.appendChild(tanLabel);
    }

    // Value readout panel
    var readoutEls = {};
    if (opts.showValues !== false) {
      var rx = W * 0.74, ry = H * 0.25;
      layer.appendChild(el('rect', { x:rx-2, y:ry-16, width:W*0.24, height:72,
        rx:6, fill:'#000', 'fill-opacity':'0.5', stroke:'#3a3a6a', 'stroke-width':'1' }));
      readoutEls.angle = el('text', { x:rx+4, y:ry,    'font-family':'sans-serif', 'font-size':'12', fill:'#fcc419', 'dominant-baseline':'central' }); layer.appendChild(readoutEls.angle);
      readoutEls.sin   = el('text', { x:rx+4, y:ry+22, 'font-family':'sans-serif', 'font-size':'12', fill:'#ff6b35', 'dominant-baseline':'central' }); layer.appendChild(readoutEls.sin);
      readoutEls.cos   = el('text', { x:rx+4, y:ry+44, 'font-family':'sans-serif', 'font-size':'12', fill:'#4dabf7', 'dominant-baseline':'central' }); layer.appendChild(readoutEls.cos);
    }

    if (opts.title) layer.appendChild(txt(opts.title, { x:W/2, y:16, 'font-size':'14', 'font-weight':'bold' }));

    // ── Update function ───────────────────────────────────────────────────────
    var _angleDeg = opts.angleDeg !== undefined ? opts.angleDeg : 45;

    function setAngle(deg) {
      _angleDeg = deg;
      var rad  = deg * Math.PI / 180;
      var cosV = Math.cos(rad);
      var sinV = Math.sin(rad);
      var px   = cx + r * cosV;
      var py   = cy - r * sinV;   // SVG y-axis flipped

      // Radius
      radiusLine.setAttribute('x1', cx); radiusLine.setAttribute('y1', cy);
      radiusLine.setAttribute('x2', px.toFixed(1)); radiusLine.setAttribute('y2', py.toFixed(1));

      // Point
      circlePoint.setAttribute('cx', px.toFixed(1));
      circlePoint.setAttribute('cy', py.toFixed(1));

      // Sine (vertical drop to x-axis)
      if (opts.showSine !== false) {
        sineLine.setAttribute('x1', px.toFixed(1)); sineLine.setAttribute('y1', py.toFixed(1));
        sineLine.setAttribute('x2', px.toFixed(1)); sineLine.setAttribute('y2', cy);
        sinLabel.setAttribute('x', (px + 6).toFixed(1));
        sinLabel.setAttribute('y', ((py + cy) / 2).toFixed(1));
      }

      // Cosine (horizontal to y-axis)
      if (opts.showCosine !== false) {
        cosineLine.setAttribute('x1', cx); cosineLine.setAttribute('y1', py.toFixed(1));
        cosineLine.setAttribute('x2', px.toFixed(1)); cosineLine.setAttribute('y2', py.toFixed(1));
        cosLabel.setAttribute('x', ((cx + px) / 2).toFixed(1));
        cosLabel.setAttribute('y', (py - 10).toFixed(1));
      }

      // Angle arc (small arc from 0° to current angle)
      var arcR = r * 0.22;
      var endPt = { x: cx + arcR * cosV, y: cy - arcR * sinV };
      var large = Math.abs(deg % 360) > 180 ? 1 : 0;
      var sweep = deg >= 0 ? 0 : 1;
      angleArcEl.setAttribute('d',
        'M ' + (cx + arcR) + ' ' + cy +
        ' A ' + arcR + ' ' + arcR + ' 0 ' + large + ' ' + sweep +
        ' ' + endPt.x.toFixed(1) + ' ' + endPt.y.toFixed(1));
      var midRad = (deg / 2) * Math.PI / 180;
      angleLabel.setAttribute('x', (cx + arcR * 1.7 * Math.cos(midRad)).toFixed(1));
      angleLabel.setAttribute('y', (cy - arcR * 1.7 * Math.sin(midRad)).toFixed(1));

      // Tangent
      if (tanLine && Math.abs(cosV) > 0.05) {
        var tanV = sinV / cosV;
        var tanPx = cx + r;         // tangent line drawn at x = 1
        var tanPy = cy - r * tanV;
        tanLine.setAttribute('x1', tanPx); tanLine.setAttribute('y1', cy);
        tanLine.setAttribute('x2', tanPx); tanLine.setAttribute('y2', tanPy.toFixed(1));
        tanLabel.setAttribute('x', (tanPx + 8).toFixed(1));
        tanLabel.setAttribute('y', (tanPy / 2 + cy / 2).toFixed(1));
      }

      // Readout
      if (readoutEls.angle) {
        readoutEls.angle.textContent = 'θ = ' + (deg % 360).toFixed(1) + '°';
        readoutEls.sin.textContent   = 'sin = ' + sinV.toFixed(3);
        readoutEls.cos.textContent   = 'cos = ' + cosV.toFixed(3);
      }
    }

    // Initial render
    setAngle(_angleDeg);

    // Auto-rotate animation
    if (opts.animate) {
      var speed = opts.speed || 45;
      stage.onTick(function (t) {
        setAngle(t * speed);
      });
    }

    // Sensor binding
    if (opts.sensor) {
      var sMin = opts.sensorMin || 0, sMax = opts.sensorMax || 10;
      stage.bindSensor(opts.sensor, function (reading) {
        setAngle(((reading.value - sMin) / (sMax - sMin)) * 360);
      });
    }

    return { setAngle: setAngle };
  };

  // ── Attach ──────────────────────────────────────────────────────────────────
  if (global.AGNI_SHARED) global.AGNI_SHARED.svg = SVG;
  if (global.DEV_MODE) {
    console.log('[SVG-GEOMETRY] loaded –', ['polygonDynamic','cartesianGrid','unitCircle'].join(', '));
  }

}(window));
