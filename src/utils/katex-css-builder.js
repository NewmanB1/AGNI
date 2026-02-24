// src/utils/katex-css-builder.js
// AGNI KaTeX CSS Builder  v1.0.0
//
// Splits the full KaTeX CSS bundle into three cached subset files at build
// time. Called by html.js during lesson compilation. Only the files the
// lesson actually needs (from ir.inferredFeatures.katexAssets) are written
// to the output directory.
//
// Output files:
//   katex-core.css            — layout rules, sizing, spacing (~15KB)
//                               always written when any equation is present
//   katex-symbols-{domain}.css — operator and symbol subsets, one per domain:
//                               algebra, trig, calculus, physics, sets
//                               written only when that domain is detected
//   katex-fonts.css           — @font-face declarations (~80KB)
//                               written once and cached aggressively;
//                               not re-transmitted per lesson
//
// Write strategy: write-if-source-newer (same as shared-runtime.js in
// html.js). CSS files are shared across all lessons in a build run —
// the first lesson that needs a given file writes it; subsequent lessons
// skip the write if the file already exists and source is unchanged.
//
// KaTeX source: expects the full katex.min.css to be present at
//   node_modules/katex/dist/katex.min.css
// This is a dev dependency already required by rehype-katex in config.js.
//
// Splitting strategy:
//   @font-face rules       → katex-fonts.css
//   @keyframes / .katex-*  → katex-core.css (layout engine)
//   Per-domain operators   → katex-symbols-{domain}.css
//   Everything else        → katex-core.css
//
// Target: Node.js 14+. Not loaded on the edge device.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var fs   = require('fs');
var path = require('path');

// ── KaTeX source path ─────────────────────────────────────────────────────────
var KATEX_CSS_SOURCE = path.join(
  __dirname, '../../node_modules/katex/dist/katex.min.css'
);

// ── Domain-specific symbol patterns ──────────────────────────────────────────
// These class name patterns identify CSS rules that belong to a specific
// equation domain. Rules matching these are extracted into the per-domain
// symbols file; all remaining non-font rules go into katex-core.css.
//
// Patterns are matched against the selector portion of each CSS rule block.
// The selectors come from KaTeX's generated class names — these are stable
// across KaTeX minor versions but should be verified on major version bumps.
//
var DOMAIN_PATTERNS = {
  trig:     /\.mord\.sin|\.mord\.cos|\.mord\.tan|\.mord\.sec|\.mord\.csc|\.mord\.cot|katex-html.*trig/i,
  calculus: /\.mop\.int|\.mop\.sum|\.mop\.prod|\.mop\.lim|katex-html.*calc/i,
  physics:  /\.mord\.vec|\.mord\.hat|katex-html.*phys/i,
  sets:     /\.mord\.in\b|\.mord\.cup|\.mord\.cap|\.mord\.empty|katex-html.*sets/i,
  // algebra: fallback — no pattern, receives rules not claimed by other domains
  algebra:  null
};

// ── Cached split result (per process) ────────────────────────────────────────
// Splitting the full CSS is O(n) over ~1500 rules. Cache the result so a
// multi-lesson build run only pays this cost once per Node.js process.
var _splitCache = null;
var _splitSourceMtime = 0;

/**
 * Read and split the full KaTeX CSS into buckets.
 * Returns a cached result if the source file has not changed.
 *
 * @returns {{ core: string, fonts: string, symbols: Object.<string,string> }}
 */
function _getSplitCss() {
  if (!fs.existsSync(KATEX_CSS_SOURCE)) {
    throw new Error(
      '[KATEX-CSS] KaTeX CSS source not found: ' + KATEX_CSS_SOURCE + '\n' +
      'Run: npm install katex'
    );
  }

  var mtime = fs.statSync(KATEX_CSS_SOURCE).mtimeMs;
  if (_splitCache && _splitSourceMtime === mtime) return _splitCache;

  var raw = fs.readFileSync(KATEX_CSS_SOURCE, 'utf8');
  _splitCache = _splitCss(raw);
  _splitSourceMtime = mtime;
  return _splitCache;
}

/**
 * Split a full KaTeX CSS string into core, fonts, and per-domain symbol buckets.
 *
 * Strategy:
 *   1. Extract all @font-face blocks → fonts bucket
 *   2. For each remaining rule block, test selector against domain patterns
 *      → first matching domain's symbols bucket
 *   3. Unmatched rules → core bucket
 *
 * @param  {string} raw   full katex.min.css content
 * @returns {{ core: string, fonts: string, symbols: Object.<string,string> }}
 */
function _splitCss(raw) {
  var fonts   = [];
  var core    = [];
  var symbols = { algebra: [], trig: [], calculus: [], physics: [], sets: [] };

  // Split into individual rule blocks by walking the string character by
  // character and tracking brace depth. This handles @font-face and @keyframes
  // which contain nested braces without a full CSS parser.
  var rules = _extractRuleBlocks(raw);

  rules.forEach(function (rule) {
    var trimmed = rule.trim();
    if (!trimmed) return;

    // @font-face → fonts bucket
    if (/^@font-face/i.test(trimmed)) {
      fonts.push(trimmed);
      return;
    }

    // Test against domain patterns — first match wins
    var claimed = false;
    var domains = ['trig', 'calculus', 'physics', 'sets'];
    for (var i = 0; i < domains.length; i++) {
      var domain  = domains[i];
      var pattern = DOMAIN_PATTERNS[domain];
      if (pattern && pattern.test(trimmed)) {
        symbols[domain].push(trimmed);
        claimed = true;
        break;
      }
    }

    // Unclaimed → core (includes @keyframes, .katex layout rules, algebra)
    if (!claimed) core.push(trimmed);
  });

  // algebra symbols bucket gets rules that are operator-like but not claimed
  // by a specific domain. For now it is empty — all algebra rules end up in
  // core, which is always loaded. This is intentional: algebra operators are
  // so common that separating them would save negligible bandwidth while
  // adding a separate file fetch. The algebra CSS file is written as a stub
  // so factory-loader.js does not 404 when the lesson requests it.
  symbols.algebra = ['/* algebra operators included in katex-core.css */'];

  return {
    core:    core.join('\n'),
    fonts:   fonts.join('\n'),
    symbols: {
      algebra:  symbols.algebra.join('\n'),
      trig:     symbols.trig.join('\n'),
      calculus: symbols.calculus.join('\n'),
      physics:  symbols.physics.join('\n'),
      sets:     symbols.sets.join('\n')
    }
  };
}

/**
 * Extract individual CSS rule blocks from a minified or formatted CSS string.
 * Handles nested braces (@font-face, @keyframes) correctly.
 *
 * @param  {string} css
 * @returns {string[]}   one entry per top-level rule block
 */
function _extractRuleBlocks(css) {
  var blocks = [];
  var depth  = 0;
  var start  = 0;
  var inStr  = false;
  var strCh  = '';

  for (var i = 0; i < css.length; i++) {
    var ch = css[i];

    // Track string literals (url("...") etc.) to avoid counting their braces
    if (!inStr && (ch === '"' || ch === "'")) {
      inStr = true;
      strCh = ch;
      continue;
    }
    if (inStr && ch === strCh && css[i - 1] !== '\\') {
      inStr = false;
      continue;
    }
    if (inStr) continue;

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }

  return blocks;
}


// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write the KaTeX CSS files needed by a lesson to the output directory.
 *
 * Only writes the files listed in `assetList` (from ir.inferredFeatures
 * .katexAssets). Files already present and up-to-date are skipped.
 * A single-line log summarises what was written vs skipped.
 *
 * @param {string[]} assetList   e.g. ['katex-core.css','katex-symbols-trig.css','katex-fonts.css']
 * @param {string}   outputDir   destination directory (same dir as lesson HTML)
 */
function buildKatexCss(assetList, outputDir) {
  if (!assetList || assetList.length === 0) return;

  var split = _getSplitCss();

  // Map filename → content
  function contentFor(filename) {
    if (filename === 'katex-core.css')  return split.core;
    if (filename === 'katex-fonts.css') return split.fonts;
    var domainMatch = filename.match(/^katex-symbols-(.+)\.css$/);
    if (domainMatch) {
      var domain = domainMatch[1];
      return split.symbols[domain] || ('/* no symbols for domain: ' + domain + ' */');
    }
    return null;
  }

  var written = [];
  var skipped = [];

  assetList.forEach(function (filename) {
    var content = contentFor(filename);
    if (content === null) {
      console.warn('[KATEX-CSS] Unknown asset filename:', filename);
      return;
    }

    var destPath = path.join(outputDir, filename);

    // Write-if-missing strategy for CSS files:
    // Unlike source files, the split CSS content is derived from the same
    // katex.min.css source, so checking source mtime is sufficient.
    // We use existence check + source mtime vs dest mtime.
    if (fs.existsSync(destPath)) {
      var destMtime = fs.statSync(destPath).mtimeMs;
      if (_splitSourceMtime <= destMtime) {
        skipped.push(filename);
        return;
      }
    }

    fs.writeFileSync(destPath, content, 'utf8');
    written.push(filename);
  });

  if (written.length > 0) {
    console.log('[KATEX-CSS] Written:', written.join(', '));
  }
  if (skipped.length > 0) {
    console.log('[KATEX-CSS] Up-to-date:', skipped.join(', '));
  }
}

module.exports = {
  buildKatexCss:  buildKatexCss,
  // Exposed for testing
  _splitCss:      _splitCss,
  _extractRuleBlocks: _extractRuleBlocks
};
