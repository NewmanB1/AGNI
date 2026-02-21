// src/runtime/svg-factories-dynamic.js
// AGNI Dynamic SVG Factories
// Extends svg-factories.js with:
//   - sensor-connected dynamic variants of numberLine and clockFace
//   - timeGraph  : scrolling sensor data graph (like phyphox time series)
//   - arrowMap   : animated arrows overlaid on a PNG background
//   - compose()  : combine multiple factories into one stage
//
// Requires: svg-stage.js, svg-factories.js
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // ── SVG helpers (duplicated minimally to keep files independent) ────────────
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
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  var PALETTE = ['#4dabf7','#ff6b35','#51cf66','#fcc419','#cc5de8','#ff8787','#20c997','#f06595'];

  // ── Ensure AGNI_SVG exists ──────────────────────────────────────────────────
  if (!global.AGNI_SVG) global.AGNI_SVG = {};
  var SVG = global.AGNI_SVG;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Dynamic Number Line
  //    A number line with a sensor-driven or animated ball.
  //    Optional: 'bounce' mode animates the ball between min/max with physics.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage   result of AGNI_SVG.stage(container, opts)
   * @param {object} opts
   *   min / max    {number}
   *   step         {number}
   *   sensor       {string}  sensorId e.g. 'accel.magnitude'. If null → uses bounce.
   *   sensorMin    {number}  sensor value mapped to min (default opts.min)
   *   sensorMax    {number}  sensor value mapped to max (default opts.max)
   *   bounce       {boolean} animate ball bouncing (no sensor required)
   *   bounceSpeed  {number}  units/sec (default 3)
   *   ballColor    {string}
   *   label        {string}
   *   title        {string}
   *   marks        {Array}   static marks [{value, label, color}]
   *   onValue      {function} called with current mapped value each frame
   */
  SVG.numberLineDynamic = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h || 100;
    var ML = 30, MR = 30, CY = H / 2 + 8, CW = W - ML - MR;
    var min = opts.min !== undefined ? opts.min : 0;
    var max = opts.max !== undefined ? opts.max : 10;
    var step = opts.step || 1;
    var ballColor = opts.ballColor || PALETTE[1];

    var layer = stage.layer('numberLine');

    // ── Draw static scaffold ──────────────────────────────────────────────────
    function toX(v) { return ML + ((v - min) / (max - min)) * CW; }

    // Main axis
    layer.appendChild(el('line', { x1:ML-10, y1:CY, x2:ML+CW+10, y2:CY, stroke:'#aaaacc', 'stroke-width':'2' }));
    layer.appendChild(el('polygon', {
      points:(ML+CW+10)+','+CY+' '+(ML+CW+3)+','+(CY-5)+' '+(ML+CW+3)+','+(CY+5), fill:'#aaaacc'
    }));

    // Ticks
    for (var v = min; v <= max; v += step) {
      var px = toX(v);
      layer.appendChild(el('line', { x1:px, y1:CY-8, x2:px, y2:CY+8, stroke:'#aaaacc', 'stroke-width':'1.5' }));
      layer.appendChild(txt(v, { x:px, y:CY+22, 'font-size':'12', fill:'#8888aa' }));
    }

    // Static marks
    (opts.marks || []).forEach(function (m, i) {
      var color = m.color || PALETTE[i % PALETTE.length];
      layer.appendChild(el('circle', { cx:toX(m.value), cy:CY, r:5, fill:color, stroke:'#fff', 'stroke-width':'1' }));
      if (m.label) layer.appendChild(txt(m.label, { x:toX(m.value), y:CY-18, 'font-size':'11', fill:color }));
    });

    if (opts.title) layer.appendChild(txt(opts.title, { x:W/2, y:14, 'font-size':'13', 'font-weight':'bold' }));

    // ── Dynamic ball ──────────────────────────────────────────────────────────
    var ball = el('circle', { cx:toX(min), cy:CY, r:9, fill:ballColor, stroke:'#fff', 'stroke-width':'2' });
    var ballLabel = txt('', { x:toX(min), y:CY-26, 'font-size':'12', fill:ballColor, 'font-weight':'bold' });
    layer.appendChild(ball);
    layer.appendChild(ballLabel);

    // Trail (last 8 positions, fading)
    var trailCount = 8;
    var trail = [];
    for (var ti = 0; ti < trailCount; ti++) {
      var tc = el('circle', { cx:toX(min), cy:CY, r:5, fill:ballColor,
        'fill-opacity': ((ti + 1) / trailCount * 0.4).toFixed(2) });
      layer.appendChild(tc);
      trail.push(tc);
    }

    function moveBall(value) {
      var clamped = clamp(value, min, max);
      var bx = toX(clamped);
      ball.setAttribute('cx', bx.toFixed(1));
      ballLabel.setAttribute('x', bx.toFixed(1));
      ballLabel.textContent = clamped.toFixed(1);

      // Shift trail
      for (var i = trailCount - 1; i > 0; i--) {
        trail[i].setAttribute('cx', trail[i-1].getAttribute('cx'));
      }
      trail[0].setAttribute('cx', bx.toFixed(1));

      if (opts.onValue) opts.onValue(clamped);
    }

    // ── Sensor binding ────────────────────────────────────────────────────────
    if (opts.sensor) {
      var sMin = opts.sensorMin !== undefined ? opts.sensorMin : min;
      var sMax = opts.sensorMax !== undefined ? opts.sensorMax : max;
      stage.bindSensor(opts.sensor, function (reading) {
        var mapped = min + ((reading.value - sMin) / (sMax - sMin)) * (max - min);
        moveBall(mapped);
      });
    }

    // ── Bounce animation ──────────────────────────────────────────────────────
    if (opts.bounce || !opts.sensor) {
      var bouncePos = min;
      var bounceDir = 1;
      var bounceSpeed = opts.bounceSpeed || (max - min) / 3;

      stage.onTick(function (t, dt) {
        bouncePos += bounceDir * bounceSpeed * dt;
        if (bouncePos >= max) { bouncePos = max; bounceDir = -1; }
        if (bouncePos <= min) { bouncePos = min; bounceDir =  1; }
        moveBall(bouncePos);
      });
    }

    return { moveBall: moveBall };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Dynamic Clock Face
  //    A clock that tracks real time, sensor value, or a supplied time value.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage
   * @param {object} opts
   *   mode         {string}  'realtime'|'sensor'|'manual'  (default: realtime)
   *   sensor       {string}  sensorId (for mode:'sensor') — value = seconds
   *   hours        {number}  initial hours (manual mode)
   *   minutes      {number}  initial minutes (manual mode)
   *   showDigital  {boolean}
   *   label        {string}
   */
  SVG.clockFaceDynamic = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h;
    var cx = W/2, cy = H/2 - 10;
    var r  = Math.min(W, H) * 0.38;
    var layer = stage.layer('clock');

    // Static face
    layer.appendChild(el('circle', { cx:cx, cy:cy, r:r, fill:'#12122a', stroke:'#aaaacc', 'stroke-width':'3' }));
    for (var hm = 0; hm < 12; hm++) {
      var hAngle = hm * 30;
      var outer = polar(cx, cy, r * 0.92, hAngle);
      var inner = polar(cx, cy, r * (hm % 3 === 0 ? 0.78 : 0.86), hAngle);
      layer.appendChild(el('line', {
        x1:inner.x.toFixed(1), y1:inner.y.toFixed(1),
        x2:outer.x.toFixed(1), y2:outer.y.toFixed(1),
        stroke:'#aaaacc', 'stroke-width': hm % 3 === 0 ? '3' : '1.5'
      }));
      if (hm % 3 === 0) {
        var np = polar(cx, cy, r * 0.67, hAngle);
        layer.appendChild(txt(hm === 0 ? '12' : hm, { x:np.x.toFixed(1), y:np.y.toFixed(1), 'font-size':'13', fill:'#ccccee' }));
      }
    }
    if (opts.label) layer.appendChild(txt(opts.label, { x:cx, y:H-10, 'font-size':'12', fill:'#8888aa' }));

    // Dynamic hands (elements we'll update each tick)
    var hourHand   = el('line', { stroke:'#ffffff', 'stroke-width':'5', 'stroke-linecap':'round' });
    var minuteHand = el('line', { stroke:'#4dabf7', 'stroke-width':'3', 'stroke-linecap':'round' });
    var secondHand = el('line', { stroke:'#ff6b35', 'stroke-width':'1.5', 'stroke-linecap':'round' });
    var centre     = el('circle', { cx:cx, cy:cy, r:5, fill:'#ff6b35' });
    var digital    = txt('00:00', { x:cx, y:cy + r + 18, 'font-size':'16', fill:'#4dabf7', 'font-weight':'bold' });

    layer.appendChild(hourHand);
    layer.appendChild(minuteHand);
    layer.appendChild(secondHand);
    layer.appendChild(centre);
    if (opts.showDigital) layer.appendChild(digital);

    function updateHands(totalSeconds) {
      var secs = totalSeconds % 60;
      var mins = (totalSeconds / 60) % 60;
      var hrs  = (totalSeconds / 3600) % 12;

      var hDeg = hrs  * 30;
      var mDeg = mins * 6;
      var sDeg = secs * 6;

      function setHand(hand, deg, len, tailLen) {
        var tip  = polar(cx, cy, r * len,     deg);
        var tail = polar(cx, cy, r * tailLen, deg + 180);
        hand.setAttribute('x1', tail.x.toFixed(1));
        hand.setAttribute('y1', tail.y.toFixed(1));
        hand.setAttribute('x2', tip.x.toFixed(1));
        hand.setAttribute('y2', tip.y.toFixed(1));
      }

      setHand(hourHand,   hDeg, 0.55, 0.12);
      setHand(minuteHand, mDeg, 0.80, 0.15);
      setHand(secondHand, sDeg, 0.88, 0.18);

      if (opts.showDigital) {
        var h = Math.floor(hrs), m = Math.floor(mins), s = Math.floor(secs);
        digital.textContent = String(h).padStart(2,'0') + ':' +
                              String(m).padStart(2,'0') + ':' +
                              String(s).padStart(2,'0');
      }
    }

    var mode = opts.mode || 'realtime';

    if (mode === 'realtime') {
      stage.onTick(function () {
        var now = new Date();
        var totalSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
                        + now.getMilliseconds() / 1000;
        updateHands(totalSecs);
      });
    } else if (mode === 'sensor' && opts.sensor) {
      stage.bindSensor(opts.sensor, function (reading) {
        updateHands(reading.value);
      });
    } else {
      // Manual / static initial render
      var initSecs = ((opts.hours || 0) * 3600) + ((opts.minutes || 0) * 60);
      updateHands(initSecs);
    }

    return { updateHands: updateHands };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Time Graph
  //    Scrolling real-time graph of one or more sensor streams.
  //    Looks and behaves like the phyphox time-series view.
  //    Can also be driven by a clock (maps elapsed seconds to x-axis).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage
   * @param {object} opts
   *   streams      {Array}  [{sensor, label, color, yMin, yMax}]
   *   windowSeconds {number} visible time window (default 5)
   *   gridLines    {number} number of y grid lines (default 4)
   *   xLabel       {string}
   *   title        {string}
   *   onReading    {function} called with (streamIndex, value, t)
   */
  SVG.timeGraph = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h;
    var ML = 52, MR = 12, MT = 30, MB = 36;
    var CW = W - ML - MR, CH = H - MT - MB;
    var windowSecs = opts.windowSeconds || 5;
    var streams = opts.streams || [];
    var maxPoints = 300;

    var layer = stage.layer('timeGraph');

    // ── Static scaffold ───────────────────────────────────────────────────────
    // Axes
    layer.appendChild(el('line', { x1:ML, y1:MT, x2:ML, y2:MT+CH, stroke:'#aaaacc', 'stroke-width':'2' }));
    layer.appendChild(el('line', { x1:ML, y1:MT+CH, x2:ML+CW, y2:MT+CH, stroke:'#aaaacc', 'stroke-width':'2' }));

    // X label
    if (opts.xLabel) layer.appendChild(txt(opts.xLabel || 'Time (s)', { x:ML+CW/2, y:H-6, fill:'#ccccee', 'font-size':'11' }));

    // Title
    if (opts.title) layer.appendChild(txt(opts.title, { x:W/2, y:16, 'font-size':'13', 'font-weight':'bold' }));

    // Y grid lines and labels (use first stream's range for axis labels)
    var gridCount = opts.gridLines || 4;
    var axisStream = streams[0] || { yMin: 0, yMax: 10 };
    var yMin0 = axisStream.yMin !== undefined ? axisStream.yMin : 0;
    var yMax0 = axisStream.yMax !== undefined ? axisStream.yMax : 10;

    for (var gi = 0; gi <= gridCount; gi++) {
      var gv = yMin0 + (yMax0 - yMin0) * (gi / gridCount);
      var gy = MT + CH - (gi / gridCount) * CH;
      layer.appendChild(el('line', { x1:ML, y1:gy, x2:ML+CW, y2:gy, stroke:'#2a2a4a', 'stroke-width':'1' }));
      layer.appendChild(txt(gv.toFixed(1), { x:ML-6, y:gy, 'font-size':'10', fill:'#8888aa', 'text-anchor':'end' }));
    }

    // Legend
    streams.forEach(function (s, i) {
      var lx = ML + 8 + i * 90;
      layer.appendChild(el('line', { x1:lx, y1:MT-8, x2:lx+20, y2:MT-8, stroke:s.color||PALETTE[i], 'stroke-width':'2.5' }));
      var lt = el('text', { x:lx+24, y:MT-8, 'font-family':'sans-serif', 'font-size':'11',
        fill:s.color||PALETTE[i], 'dominant-baseline':'central' });
      lt.textContent = s.label || s.sensor || ('Stream ' + i);
      layer.appendChild(lt);
    });

    // ── Per-stream polyline + data buffer ─────────────────────────────────────
    var streamState = streams.map(function (s, i) {
      var polyline = el('polyline', {
        fill: 'none',
        stroke: s.color || PALETTE[i % PALETTE.length],
        'stroke-width': '2',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      });
      layer.appendChild(polyline);
      return {
        opts: s,
        polyline: polyline,
        data: []   // [{t, value}]
      };
    });

    // ── Coordinate helpers ────────────────────────────────────────────────────
    function toScreenX(t, tNow) {
      return ML + ((t - (tNow - windowSecs)) / windowSecs) * CW;
    }
    function toScreenY(value, yMin, yMax) {
      return MT + CH - clamp((value - yMin) / (yMax - yMin), 0, 1) * CH;
    }

    // ── Redraw polylines ──────────────────────────────────────────────────────
    var lastT = 0;
    function redraw(tNow) {
      streamState.forEach(function (ss) {
        var yMin = ss.opts.yMin !== undefined ? ss.opts.yMin : 0;
        var yMax = ss.opts.yMax !== undefined ? ss.opts.yMax : 10;
        // Discard points older than window
        var cutoff = tNow - windowSecs;
        ss.data = ss.data.filter(function (p) { return p.t >= cutoff; });
        // Build polyline points
        var pts = ss.data.map(function (p) {
          return toScreenX(p.t, tNow).toFixed(1) + ',' + toScreenY(p.value, yMin, yMax).toFixed(1);
        });
        ss.polyline.setAttribute('points', pts.join(' '));
      });
    }

    // ── Sensor bindings ───────────────────────────────────────────────────────
    streamState.forEach(function (ss, i) {
      if (!ss.opts.sensor) return;
      stage.bindSensor(ss.opts.sensor, function (reading) {
        ss.data.push({ t: lastT, value: reading.value });
        if (ss.data.length > maxPoints) ss.data.shift();
        if (opts.onReading) opts.onReading(i, reading.value, lastT);
      });
    });

    // ── Tick: advance time, redraw ─────────────────────────────────────────────
    stage.onTick(function (t) {
      lastT = t;
      redraw(t);
    });

    // ── Manual push (for table-driven or clock-driven modes) ──────────────────
    return {
      push: function (streamIndex, value, t) {
        var ss = streamState[streamIndex];
        if (!ss) return;
        var tVal = t !== undefined ? t : lastT;
        ss.data.push({ t: tVal, value: value });
        if (ss.data.length > maxPoints) ss.data.shift();
      }
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Arrow Map
  //    Animated arrows overlaid on a PNG (or SVG) background image.
  //    Coordinates are fractional (0–1) relative to image dimensions.
  //    Use case: army movements, migration patterns, trade routes.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {Stage}  stage
   * @param {object} opts
   *   background   {string}  URL or data-URI of background image
   *   bgOpacity    {number}  default 1.0
   *   arrows       {Array}   see ArrowDef below
   *   timeline     {boolean} if true, arrows appear progressively via setTime()
   *   title        {string}
   *
   * ArrowDef {
   *   id           {string}
   *   from         {object}  {x, y}  fractional coords 0–1
   *   to           {object}  {x, y}  fractional coords 0–1
   *   via          {Array}   [{x,y}] optional intermediate waypoints
   *   label        {string}
   *   sublabel     {string}  secondary label (e.g. date/year)
   *   color        {string}
   *   width        {number}  stroke width (default 3)
   *   startTime    {number}  0–1 timeline position when arrow begins appearing
   *   endTime      {number}  0–1 timeline position when arrow is fully drawn
   *   arrowHead    {string}  'end'|'both'|'none' (default 'end')
   *   pulse        {boolean} pulse the arrowhead when fully drawn
   *   sensor       {string}  if set, arrow position tracks this sensor (overrides timeline)
   * }
   */
  SVG.arrowMap = function (stage, opts) {
    opts = opts || {};
    var W = stage.w, H = stage.h;

    // ── Background image layer ────────────────────────────────────────────────
    var bgLayer = stage.layer('arrowmap-bg');
    if (opts.background) {
      var img = el('image', {
        href: opts.background,
        x: 0, y: 0,
        width: W, height: H,
        preserveAspectRatio: 'xMidYMid meet',
        opacity: opts.bgOpacity !== undefined ? opts.bgOpacity : 1
      });
      bgLayer.appendChild(img);
    }

    // Dark overlay to keep arrows readable over complex images
    bgLayer.appendChild(el('rect', {
      x:0, y:0, width:W, height:H,
      fill:'#000000', 'fill-opacity': opts.background ? '0.25' : '0'
    }));

    // ── Arrow layer ───────────────────────────────────────────────────────────
    var arrowLayer = stage.layer('arrowmap-arrows');
    var labelLayer = stage.layer('arrowmap-labels');

    // ── Defs: arrowhead markers ───────────────────────────────────────────────
    var defs = el('defs', {});
    stage.svg.insertBefore(defs, stage.svg.firstChild);

    function makeMarker(id, color) {
      var m = el('marker', { id:id, markerWidth:'10', markerHeight:'7',
        refX:'9', refY:'3.5', orient:'auto' });
      m.appendChild(el('polygon', { points:'0 0, 10 3.5, 0 7', fill:color }));
      defs.appendChild(m);
      return m;
    }

    // ── Coordinate helpers ────────────────────────────────────────────────────
    function fx(v) { return v * W; }
    function fy(v) { return v * H; }

    // Build SVG path string from waypoints (from → via[] → to)
    function buildPath(arrow, progress) {
      progress = clamp(progress !== undefined ? progress : 1, 0, 1);

      var points = [arrow.from].concat(arrow.via || []).concat([arrow.to]);
      // Total path length in fractional coords
      var segments = [];
      var totalLen = 0;
      for (var i = 0; i < points.length - 1; i++) {
        var dx = points[i+1].x - points[i].x;
        var dy = points[i+1].y - points[i].y;
        var len = Math.sqrt(dx*dx + dy*dy);
        segments.push({ from: points[i], to: points[i+1], len: len });
        totalLen += len;
      }

      // Walk segments up to progress * totalLen
      var targetLen = progress * totalLen;
      var walked = 0;
      var pathPoints = [points[0]];

      for (var si = 0; si < segments.length; si++) {
        var seg = segments[si];
        if (walked + seg.len <= targetLen) {
          pathPoints.push(seg.to);
          walked += seg.len;
        } else {
          var remaining = targetLen - walked;
          var t = remaining / seg.len;
          pathPoints.push({
            x: seg.from.x + t * (seg.to.x - seg.from.x),
            y: seg.from.y + t * (seg.to.y - seg.from.y)
          });
          break;
        }
      }

      var d = 'M ' + fx(pathPoints[0].x).toFixed(1) + ' ' + fy(pathPoints[0].y).toFixed(1);
      for (var pi = 1; pi < pathPoints.length; pi++) {
        // Use cubic bezier through waypoints for smoother curves
        if (pi === 1 && pathPoints.length === 2) {
          d += ' L ' + fx(pathPoints[pi].x).toFixed(1) + ' ' + fy(pathPoints[pi].y).toFixed(1);
        } else {
          var prev = pathPoints[pi-1];
          var curr = pathPoints[pi];
          var cpx = (prev.x + curr.x) / 2;
          var cpy = (prev.y + curr.y) / 2;
          d += ' Q ' + fx(cpx).toFixed(1) + ' ' + fy(cpy).toFixed(1) +
               ' '   + fx(curr.x).toFixed(1) + ' ' + fy(curr.y).toFixed(1);
        }
      }
      return d;
    }

    // ── Build arrow state ─────────────────────────────────────────────────────
    var arrows = (opts.arrows || []).map(function (a, i) {
      var color = a.color || PALETTE[i % PALETTE.length];
      var markerId = 'arrowhead-' + (a.id || i);
      makeMarker(markerId, color);

      var path = el('path', {
        d: buildPath(a, 0),
        fill: 'none',
        stroke: color,
        'stroke-width': a.width || 3,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'marker-end': 'url(#' + markerId + ')',
        opacity: 0
      });
      arrowLayer.appendChild(path);

      // Label group
      var labelGroup = el('g', { opacity: 0 });
      var fromPx = { x: fx(a.from.x), y: fy(a.from.y) };
      var toPx   = { x: fx(a.to.x),   y: fy(a.to.y)   };
      var midX   = (fromPx.x + toPx.x) / 2;
      var midY   = (fromPx.y + toPx.y) / 2 - 12;

      // Label background pill
      var labelText = a.label || '';
      if (labelText) {
        var pill = el('rect', { x: midX - 45, y: midY - 12, width: 90, height: 22,
          rx: 6, fill: '#000000', 'fill-opacity': '0.65' });
        labelGroup.appendChild(pill);
        var lt = el('text', { x: midX, y: midY + 2, 'text-anchor':'middle', 'dominant-baseline':'central',
          'font-family':'sans-serif', 'font-size':'11', fill: color, 'font-weight':'bold' });
        lt.textContent = labelText;
        labelGroup.appendChild(lt);
      }
      if (a.sublabel) {
        var st = el('text', { x: midX, y: midY + 18, 'text-anchor':'middle', 'dominant-baseline':'central',
          'font-family':'sans-serif', 'font-size':'10', fill:'#ccccee' });
        st.textContent = a.sublabel;
        labelGroup.appendChild(st);
      }
      labelLayer.appendChild(labelGroup);

      // Pulse circle at arrowhead (shown when fully drawn)
      var pulse = null;
      if (a.pulse) {
        pulse = el('circle', { cx: toPx.x, cy: toPx.y, r: 8, fill: color,
          'fill-opacity':'0.5', opacity: 0 });
        arrowLayer.appendChild(pulse);
      }

      return {
        def: a,
        path: path,
        labelGroup: labelGroup,
        pulse: pulse,
        markerId: markerId,
        progress: 0
      };
    });

    // ── Title ─────────────────────────────────────────────────────────────────
    if (opts.title) {
      var titleBg = el('rect', { x:0, y:0, width:W, height:28, fill:'#000000', 'fill-opacity':'0.55' });
      labelLayer.appendChild(titleBg);
      labelLayer.appendChild(txt(opts.title, { x:W/2, y:14, 'font-size':'14', 'font-weight':'bold' }));
    }

    // ── Update a single arrow to a given progress (0–1) ───────────────────────
    function updateArrow(state, progress) {
      progress = clamp(progress, 0, 1);
      state.progress = progress;
      if (progress <= 0) {
        state.path.setAttribute('opacity', 0);
        state.labelGroup.setAttribute('opacity', 0);
        if (state.pulse) state.pulse.setAttribute('opacity', 0);
        return;
      }
      state.path.setAttribute('d', buildPath(state.def, progress));
      state.path.setAttribute('opacity', 1);
      // Labels appear when arrow is > 50% drawn
      state.labelGroup.setAttribute('opacity', progress > 0.5 ? 1 : 0);
      // Pulse when fully drawn
      if (state.pulse) state.pulse.setAttribute('opacity', progress >= 0.98 ? 1 : 0);
    }

    // ── Timeline mode: setTime(0–1) draws arrows progressively ───────────────
    var currentTime = 0;

    function setTime(t) {
      currentTime = clamp(t, 0, 1);
      arrows.forEach(function (state) {
        var a = state.def;
        var start = a.startTime !== undefined ? a.startTime : 0;
        var end   = a.endTime   !== undefined ? a.endTime   : 1;
        if (end <= start) end = start + 0.001;
        var progress = (currentTime - start) / (end - start);
        updateArrow(state, progress);
      });
    }

    // ── Sensor binding (per-arrow) ────────────────────────────────────────────
    arrows.forEach(function (state) {
      if (!state.def.sensor) return;
      var a = state.def;
      var sMin = a.sensorMin !== undefined ? a.sensorMin : 0;
      var sMax = a.sensorMax !== undefined ? a.sensorMax : 10;
      stage.bindSensor(a.sensor, function (reading) {
        var progress = (reading.value - sMin) / (sMax - sMin);
        updateArrow(state, progress);
      });
    });

    // ── Pulse animation on tick ───────────────────────────────────────────────
    stage.onTick(function (t) {
      arrows.forEach(function (state) {
        if (!state.pulse || state.progress < 0.98) return;
        var pulse = 0.3 + 0.4 * Math.abs(Math.sin(t * 2.5));
        state.pulse.setAttribute('fill-opacity', pulse.toFixed(2));
        var pr = 8 + 6 * Math.abs(Math.sin(t * 2.5));
        state.pulse.setAttribute('r', pr.toFixed(1));
      });
    });

    // ── Initial render ────────────────────────────────────────────────────────
    if (!opts.timeline) {
      // Show all arrows immediately
      setTime(1);
    }

    return {
      setTime: setTime,
      updateArrow: function (id, progress) {
        var state = arrows.find(function(s){ return s.def.id === id; });
        if (state) updateArrow(state, progress);
      }
    };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Compose
  //    Render multiple factories into named layers of a shared stage.
  //    Factories are called as fn(stage, opts) rather than fn(container, opts).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {HTMLElement} container
   * @param {object} opts
   *   w / h        {number}
   *   background   {string}  CSS colour
   *   layers       {Array}   [{factory, opts, name}]
   *                  factory: string name on AGNI_SVG, or function
   * @returns {Stage}
   */
  SVG.compose = function (container, opts) {
    opts = opts || {};
    var stage = SVG.stage(container, {
      w: opts.w || 400,
      h: opts.h || 300,
      background: opts.background || '#1a1a2e'
    });

    (opts.layers || []).forEach(function (layerDef) {
      var factory = typeof layerDef.factory === 'function'
        ? layerDef.factory
        : SVG[layerDef.factory];

      if (!factory) {
        console.warn('[COMPOSE] Unknown factory:', layerDef.factory);
        return;
      }

      factory(stage, layerDef.opts || {});
    });

    return stage;
  };

  // ── Attach to shared ────────────────────────────────────────────────────────
  if (global.AGNI_SHARED) global.AGNI_SHARED.svg = SVG;

  if (global.DEV_MODE) {
    console.log('[SVG-DYNAMIC] loaded –', ['numberLineDynamic','clockFaceDynamic','timeGraph','arrowMap','compose'].join(', '));
  }

}(window));
