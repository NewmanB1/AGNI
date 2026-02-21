// src/runtime/table-renderer.js
// AGNI Table Renderer  v1.7.0
//
// Renders Markdown tables in lesson content with three layers of intelligence:
//
//   1. DETECTION — classifies each table as one of:
//        data       rows of numeric measurements (lab results, survey data)
//        comparison features vs options (pros/cons, property tables)
//        frequency  two columns: category + count/percentage
//        timeline   date/event pairs
//        generic    anything that doesn't match the above
//
//   2. STYLING — applies semantic CSS classes and layout per table type:
//        data       → right-aligned numbers, unit header, zebra rows
//        comparison → first column sticky, tick/cross icons for Y/N values
//        frequency  → inline mini bar embedded in the count cell
//        timeline   → left border accent, date styled separately
//        generic    → clean default styling
//
//   3. UPGRADE — if svg-factories.js is loaded AND the table is type
//        'frequency' or 'data' with one numeric column, offer an
//        "View as chart" button that renders an AGNI SVG bar graph.
//        The table remains visible; the chart appears below it.
//        No DOM replacement — both views coexist.
//
// Called by player.js after each step renders, same as math-renderer.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;
  if (!S) { console.error('[TABLE] AGNI_SHARED not found'); return; }

  var log    = S.log;
  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Markdown table parser
  //    Converts raw Markdown table text into a { headers, rows, align } object.
  //    The Markdown processor has already run, so we're actually working with
  //    <table> elements in the DOM — but we also expose a text parser for the
  //    WYSIWYG preview path.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Parse a Markdown table string into a data object.
   * @param  {string} src  raw Markdown table text
   * @returns {{ headers:string[], rows:string[][], align:string[] }}
   */
  function parseMarkdown(src) {
    var lines = src.trim().split('\n').map(function(l){ return l.trim(); });
    if (lines.length < 2) return null;

    function splitCells(line) {
      return line.replace(/^\||\|$/g, '').split('|').map(function(c){ return c.trim(); });
    }

    var headers  = splitCells(lines[0]);
    var sepLine  = lines[1];
    var align    = splitCells(sepLine).map(function(s){
      if (/^:-+:$/.test(s)) return 'center';
      if (/^-+:$/.test(s))  return 'right';
      return 'left';
    });
    var rows = lines.slice(2).map(splitCells);

    return { headers: headers, rows: rows, align: align };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Table type detection
  // ═══════════════════════════════════════════════════════════════════════════

  var NUM_RE    = /^-?[\d,]+(\.\d+)?\s*(%|g|kg|m|km|s|ms|N|J|W|°C|°F|Hz|Pa)?$/;
  var DATE_RE   = /^\d{4}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\d{1,2}\/\d{1,2}/i;
  var YESNO_RE  = /^(yes|no|y|n|✓|✗|×|true|false|✔|✘)$/i;

  function isNumeric(s)   { return NUM_RE.test(s.trim()); }
  function isDate(s)      { return DATE_RE.test(s.trim()); }
  function isYesNo(s)     { return YESNO_RE.test(s.trim()); }

  /**
   * Classify a parsed table.
   * @returns {'data'|'comparison'|'frequency'|'timeline'|'generic'}
   */
  function detectType(parsed) {
    if (!parsed || !parsed.rows.length) return 'generic';

    var headers = parsed.headers;
    var rows    = parsed.rows;
    var cols    = headers.length;

    // Timeline: first column is dates
    if (rows.length >= 2 && rows.every(function(r){ return isDate(r[0] || ''); })) {
      return 'timeline';
    }

    // Frequency: exactly two columns, second column all numeric
    if (cols === 2 && rows.every(function(r){ return isNumeric(r[1] || ''); })) {
      return 'frequency';
    }

    // Comparison: majority of data cells are Y/N or tick/cross
    var totalCells = rows.length * (cols - 1);
    var ynCells    = 0;
    rows.forEach(function(r) {
      for (var c = 1; c < r.length; c++) { if (isYesNo(r[c])) ynCells++; }
    });
    if (totalCells > 0 && ynCells / totalCells > 0.5) return 'comparison';

    // Data: majority of non-first-column cells are numeric
    var numCells = 0;
    rows.forEach(function(r) {
      for (var c = 1; c < r.length; c++) { if (isNumeric(r[c])) numCells++; }
    });
    if (totalCells > 0 && numCells / totalCells > 0.5) return 'data';

    return 'generic';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DOM table enhancement
  //    Works directly on <table> elements already in the lesson HTML.
  // ═══════════════════════════════════════════════════════════════════════════

  var ICON = { yes: '✓', no: '✗', true: '✓', false: '✗', y: '✓', n: '✗' };

  function enhanceTable(tableEl) {
    // Extract data from DOM table
    var parsed = extractFromDOM(tableEl);
    if (!parsed) return;

    var type = detectType(parsed);
    tableEl.classList.add('agni-table', 'agni-table-' + type);

    if (type === 'comparison') _enhanceComparison(tableEl, parsed);
    if (type === 'frequency')  _enhanceFrequency(tableEl, parsed);
    if (type === 'timeline')   _enhanceTimeline(tableEl);
    if (type === 'data')       _enhanceData(tableEl, parsed);

    // SVG chart upgrade button (frequency and single-value data tables)
    if ((type === 'frequency' || type === 'data') && _canChart(parsed)) {
      _addChartButton(tableEl, parsed, type);
    }

    if (DEV_MODE) log.debug('Table enhanced as type:', type);
  }

  function extractFromDOM(tableEl) {
    var headers = [];
    var rows    = [];
    var align   = [];

    var ths = tableEl.querySelectorAll('thead th');
    if (!ths.length) ths = tableEl.querySelectorAll('tr:first-child th, tr:first-child td');
    ths.forEach(function(th){ headers.push(th.textContent.trim()); align.push('left'); });

    tableEl.querySelectorAll('tbody tr').forEach(function(tr){
      var cells = [];
      tr.querySelectorAll('td').forEach(function(td){ cells.push(td.textContent.trim()); });
      if (cells.length) rows.push(cells);
    });

    if (!headers.length && !rows.length) return null;
    return { headers: headers, rows: rows, align: align };
  }

  // ── Comparison table: replace Y/N text with icons ──────────────────────────
  function _enhanceComparison(tableEl, parsed) {
    tableEl.querySelectorAll('tbody td').forEach(function(td) {
      var text = td.textContent.trim().toLowerCase();
      if (ICON[text]) {
        var positive = (text === 'yes' || text === 'y' || text === 'true' || text === '✓' || text === '✔');
        td.innerHTML = '<span class="agni-yn agni-yn-' + (positive ? 'yes' : 'no') + '">' +
                       (positive ? '✓' : '✗') + '</span>';
      }
    });
  }

  // ── Frequency table: add inline mini-bars in count cells ──────────────────
  function _enhanceFrequency(tableEl, parsed) {
    // Find max numeric value
    var max = 0;
    parsed.rows.forEach(function(r){ var v = parseFloat(r[1]); if (v > max) max = v; });
    if (max === 0) return;

    var tds = tableEl.querySelectorAll('tbody td:last-child');
    parsed.rows.forEach(function(row, i) {
      var td = tds[i];
      if (!td) return;
      var v    = parseFloat(row[1]) || 0;
      var pct  = Math.round((v / max) * 100);
      td.innerHTML =
        '<span class="agni-freq-val">' + row[1] + '</span>' +
        '<span class="agni-freq-bar" style="' +
          'display:inline-block;height:10px;width:' + pct + '%;' +
          'background:var(--agni-accent,#4dabf7);border-radius:2px;' +
          'margin-left:0.4em;vertical-align:middle;opacity:0.8' +
        '"></span>';
    });
  }

  // ── Timeline table: style first column as date ─────────────────────────────
  function _enhanceTimeline(tableEl) {
    tableEl.querySelectorAll('tbody tr').forEach(function(tr) {
      var first = tr.querySelector('td:first-child');
      if (first) first.classList.add('agni-timeline-date');
    });
  }

  // ── Data table: right-align number cells, highlight min/max ───────────────
  function _enhanceData(tableEl, parsed) {
    var colCount = parsed.headers.length;
    // For each numeric column find min/max
    for (var c = 1; c < colCount; c++) {
      var vals = parsed.rows.map(function(r){ return parseFloat(r[c]); }).filter(function(v){ return !isNaN(v); });
      if (!vals.length) continue;
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      var tds = tableEl.querySelectorAll('tbody td:nth-child(' + (c + 1) + ')');
      tds.forEach(function(td) {
        var v = parseFloat(td.textContent);
        if (!isNaN(v)) {
          td.style.textAlign = 'right';
          if (v === max && max !== min) td.classList.add('agni-data-max');
          if (v === min && max !== min) td.classList.add('agni-data-min');
        }
      });
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SVG chart upgrade
  // ═══════════════════════════════════════════════════════════════════════════

  function _canChart(parsed) {
    // Only offer chart upgrade when svg-factories barGraph is available
    return !!(global.AGNI_SVG && global.AGNI_SVG.barGraph);
  }

  function _addChartButton(tableEl, parsed, type) {
    var btn = document.createElement('button');
    btn.className   = 'agni-chart-btn';
    btn.textContent = '📊 View as bar chart';
    btn.style.cssText = 'margin-top:0.5rem;font-size:12px;padding:4px 10px;' +
      'background:#1a3a5c;color:#4dabf7;border:1px solid #4dabf7;' +
      'border-radius:4px;cursor:pointer;';

    var chartContainer = null;
    var showing = false;

    btn.onclick = function () {
      if (showing) {
        if (chartContainer) { chartContainer.remove(); chartContainer = null; }
        btn.textContent = '📊 View as bar chart';
        showing = false;
        return;
      }

      // Build chart data from table
      var data = parsed.rows.map(function(r) {
        return { label: r[0], value: parseFloat(r[1]) || 0 };
      }).filter(function(d){ return !isNaN(d.value); });

      if (!data.length) return;

      chartContainer = document.createElement('div');
      chartContainer.style.cssText = 'margin-top:0.75rem;';
      tableEl.parentNode.insertBefore(chartContainer, tableEl.nextSibling);

      // Use the AGNI SVG barGraph factory
      try {
        global.AGNI_SVG.barGraph(chartContainer, {
          data:   data,
          title:  parsed.headers[0] + ' — ' + (parsed.headers[1] || 'Value'),
          yLabel: parsed.headers[1] || '',
          w: Math.min(500, global.innerWidth ? global.innerWidth - 40 : 400),
          h: 220
        });
        btn.textContent = '✕ Hide chart';
        showing = true;
      } catch(e) {
        chartContainer.remove();
        chartContainer = null;
        log.warn('Chart upgrade failed:', e.message);
      }
    };

    tableEl.parentNode.insertBefore(btn, tableEl.nextSibling);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CSS injection
  //    Injected once into the document head. Uses CSS custom properties so
  //    the lesson theme can override accent colours.
  // ═══════════════════════════════════════════════════════════════════════════

  var _cssInjected = false;

  function _injectCSS() {
    if (_cssInjected || typeof document === 'undefined') return;
    _cssInjected = true;

    var style = document.createElement('style');
    style.id = 'agni-table-styles';
    style.textContent = [
      '.agni-table { width:100%; border-collapse:collapse; font-size:0.9em;',
      '  color:var(--agni-text,#ccccee); margin:0.75rem 0; }',

      '.agni-table th { background:var(--agni-surface2,#1a1a3e);',
      '  color:var(--agni-accent,#4dabf7); font-weight:600;',
      '  padding:0.45rem 0.65rem; text-align:left; border-bottom:2px solid var(--agni-accent,#4dabf7); }',

      '.agni-table td { padding:0.4rem 0.65rem;',
      '  border-bottom:1px solid var(--agni-border,#2a2a4a); }',

      '.agni-table tbody tr:nth-child(even) { background:var(--agni-surface1,#12122a); }',
      '.agni-table tbody tr:hover { background:var(--agni-hover,#1a2a4a); }',

      /* Comparison */
      '.agni-yn { font-size:1.1em; font-weight:bold; }',
      '.agni-yn-yes { color:#51cf66; }',
      '.agni-yn-no  { color:#ff6b6b; }',

      /* Data: min/max highlight */
      '.agni-data-max { color:#fcc419; font-weight:600; }',
      '.agni-data-min { color:#ff8787; }',

      /* Timeline: date column */
      '.agni-timeline-date { color:var(--agni-accent,#4dabf7);',
      '  font-size:0.85em; white-space:nowrap;',
      '  border-left:3px solid var(--agni-accent,#4dabf7); padding-left:0.5rem; }',

      /* Frequency: value + bar */
      '.agni-freq-val { min-width:2.5em; display:inline-block; text-align:right; }',
    ].join('\n');
    document.head.appendChild(style);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Main entry point
  //    Called by player.js after each step renders, same as math-renderer.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find all <table> elements in a container and enhance them.
   * @param {HTMLElement} container
   */
  function renderAll(container) {
    if (!container) return;
    var tables = container.querySelectorAll('table');
    if (!tables.length) return;
    _injectCSS();
    tables.forEach(enhanceTable);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Attach and register
  // ═══════════════════════════════════════════════════════════════════════════

  S.tableRenderer = {
    renderAll:    renderAll,      // main entry point
    enhanceTable: enhanceTable,   // single table (used by WYSIWYG preview)
    detectType:   detectType,     // classification (used by featureInference)
    parseMarkdown: parseMarkdown  // text-based parsing (WYSIWYG / testing)
  };

  S.registerModule('table-renderer', '1.7.0');

  if (DEV_MODE) log.debug('table-renderer v1.7.0 loaded');

}(window));
