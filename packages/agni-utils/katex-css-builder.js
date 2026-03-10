// packages/agni-utils/katex-css-builder.js
'use strict';

const fs   = require('fs');
const path = require('path');
const { writeIfNewer } = require('./io');
const { createLogger } = require('./logger');

const log = createLogger('katex-css');
const KATEX_CSS_SOURCE = path.join(__dirname, '../../node_modules/katex/dist/katex.min.css');

const DOMAIN_PATTERNS = {
  trig:     /\.mord\.sin|\.mord\.cos|\.mord\.tan|\.mord\.sec|\.mord\.csc|\.mord\.cot|katex-html.*trig/i,
  calculus: /\.mop\.int|\.mop\.sum|\.mop\.prod|\.mop\.lim|katex-html.*calc/i,
  physics:  /\.mord\.vec|\.mord\.hat|katex-html.*phys/i,
  sets:     /\.mord\.in\b|\.mord\.cup|\.mord\.cap|\.mord\.empty|katex-html.*sets/i,
  algebra:  null
};

let _splitCache = null;
let _splitSourceMtime = 0;

function _getSplitCss() {
  if (!fs.existsSync(KATEX_CSS_SOURCE)) {
    throw new Error('[KATEX-CSS] KaTeX CSS source not found: ' + KATEX_CSS_SOURCE + '\nRun: npm install katex');
  }
  const mtime = fs.statSync(KATEX_CSS_SOURCE).mtimeMs;
  if (_splitCache && _splitSourceMtime === mtime) return _splitCache;
  const raw = fs.readFileSync(KATEX_CSS_SOURCE, 'utf8');
  _splitCache = _splitCss(raw);
  _splitSourceMtime = mtime;
  return _splitCache;
}

function _splitCss(raw) {
  const fonts = []; const core = [];
  const symbols = { algebra: [], trig: [], calculus: [], physics: [], sets: [] };
  const rules = _extractRuleBlocks(raw);
  rules.forEach(function (rule) {
    const trimmed = rule.trim();
    if (!trimmed) return;
    if (/^@font-face/i.test(trimmed)) { fonts.push(trimmed); return; }
    let claimed = false;
    for (const domain of ['trig', 'calculus', 'physics', 'sets']) {
      const p = DOMAIN_PATTERNS[domain];
      if (p && p.test(trimmed)) { symbols[domain].push(trimmed); claimed = true; break; }
    }
    if (!claimed) core.push(trimmed);
  });
  symbols.algebra = ['/* algebra operators included in katex-core.css */'];
  return {
    core: core.join('\n'),
    fonts: fonts.join('\n'),
    symbols: { algebra: symbols.algebra.join('\n'), trig: symbols.trig.join('\n'),
      calculus: symbols.calculus.join('\n'), physics: symbols.physics.join('\n'),
      sets: symbols.sets.join('\n') }
  };
}

function _extractRuleBlocks(css) {
  const blocks = []; let depth = 0, start = 0, inStr = false, strCh = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
    if (inStr && ch === strCh && css[i - 1] !== '\\') { inStr = false; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { blocks.push(css.slice(start, i + 1)); start = i + 1; } }
  }
  return blocks;
}

function buildKatexCss(assetList, outputDir) {
  if (!assetList || assetList.length === 0) return;
  const split = _getSplitCss();
  function contentFor(filename) {
    if (filename === 'katex-core.css') return split.core;
    if (filename === 'katex-fonts.css') return split.fonts;
    const m = filename.match(/^katex-symbols-(.+)\.css$/);
    if (m) return split.symbols[m[1]] || ('/* no symbols for domain: ' + m[1] + ' */');
    return null;
  }
  const written = []; const skipped = [];
  assetList.forEach(function (filename) {
    const content = contentFor(filename);
    if (content === null) { log.warn('Unknown asset filename: ' + filename); return; }
    const destPath = path.join(outputDir, filename);
    if (writeIfNewer(_splitSourceMtime, destPath, content)) written.push(filename);
    else skipped.push(filename);
  });
  if (written.length > 0) log.info('Written: ' + written.join(', '));
  if (skipped.length > 0) log.info('Up-to-date: ' + skipped.join(', '));
}

module.exports = { buildKatexCss, _splitCss, _extractRuleBlocks };
