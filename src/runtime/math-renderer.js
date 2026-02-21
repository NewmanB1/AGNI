// src/runtime/math-renderer.js
// AGNI Math Renderer  v1.7.0
//
// Renders LaTeX equations in lesson content.
// Strategy:
//   1. If full KaTeX is already cached on the device → use it (best quality)
//   2. If not cached → use the built-in micro-renderer (fast, ~8KB, covers
//      the subset lesson authors actually need)
//   3. Queue a background fetch of full KaTeX; re-render when it arrives
//
// The micro-renderer covers:
//   Fractions      \frac{a}{b}
//   Superscripts   x^{2}  x^2
//   Subscripts     x_{i}  x_i
//   Square roots   \sqrt{x}  \sqrt[n]{x}
//   Greek letters  \alpha \beta \gamma \delta \theta \lambda \mu \pi \phi \omega …
//   Operators      \times \div \cdot \pm \leq \geq \neq \approx \infty \sum \int
//   Vectors        \vec{v}  \hat{v}
//   Absolute value \left| … \right|
//   Parentheses    \left( … \right)
//   Text           \text{…}
//   Spacing        \,  \;  \quad  \qquad
//
// Lesson authors write:
//   Inline:  $F = ma$
//   Block:   $$v = \frac{\Delta x}{\Delta t}$$
//
// The renderer finds all math delimiters in step HTML after Markdown
// processing and replaces them with rendered spans/divs.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;
  if (!S) { console.error('[MATH] AGNI_SHARED not found'); return; }

  var log    = S.log;
  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);

  // Cache key used to store full KaTeX in the Cache API
  var KATEX_CACHE_KEY = 'agni-katex-0.16';
  var KATEX_CDN       = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/';
  var _katexLoaded    = false;
  var _katexLoading   = false;
  var _pendingRenders = [];   // queued {el, latex, display} waiting for KaTeX


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Micro-renderer
  //    Pure JS, no dependencies.  Handles the 20 constructs above.
  //    Output is HTML with inline styles that match the lesson dark theme.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Greek letter map ───────────────────────────────────────────────────────
  var GREEK = {
    alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', zeta:'ζ',
    eta:'η', theta:'θ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ',
    nu:'ν', xi:'ξ', pi:'π', rho:'ρ', sigma:'σ', tau:'τ',
    upsilon:'υ', phi:'φ', chi:'χ', psi:'ψ', omega:'ω',
    // Capitals
    Alpha:'Α', Beta:'Β', Gamma:'Γ', Delta:'Δ', Epsilon:'Ε',
    Theta:'Θ', Lambda:'Λ', Pi:'Π', Sigma:'Σ', Phi:'Φ', Omega:'Ω'
  };

  // ── Operator / symbol map ──────────────────────────────────────────────────
  var SYMBOLS = {
    times:'×', div:'÷', cdot:'·', pm:'±', mp:'∓',
    leq:'≤', geq:'≥', neq:'≠', approx:'≈', equiv:'≡', propto:'∝',
    infty:'∞', partial:'∂', nabla:'∇',
    sum:'∑', prod:'∏', int:'∫', oint:'∮',
    rightarrow:'→', leftarrow:'←', Rightarrow:'⇒', Leftarrow:'⇐',
    leftrightarrow:'↔', Leftrightarrow:'⇔',
    forall:'∀', exists:'∃', in:'∈', notin:'∉', subset:'⊂', supset:'⊃',
    cup:'∪', cap:'∩', emptyset:'∅',
    sqrt:'√',    // bare \sqrt without arg
    therefore:'∴', because:'∵',
    // Spacing — converted to non-breaking spaces of varying widths
    ',': '<span style="margin-right:0.15em"></span>',
    ';': '<span style="margin-right:0.27em"></span>',
    quad: '<span style="margin-right:1em"></span>',
    qquad: '<span style="margin-right:2em"></span>',
    // Text style
    ldots:'…', cdots:'⋯', vdots:'⋮', ddots:'⋱'
  };

  // ── Styles for rendered output ─────────────────────────────────────────────
  var BASE_STYLE  = 'font-family:\'STIX Two Math\',\'Cambria Math\',serif;';
  var BLOCK_STYLE = 'display:block;text-align:center;padding:0.6em 0;font-size:1.25em;' + BASE_STYLE;
  var INLIN_STYLE = 'display:inline;font-size:1.05em;' + BASE_STYLE;
  var FRAC_STYLE  = 'display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 0.15em;';
  var NUM_STYLE   = 'border-bottom:1px solid currentColor;padding:0 0.1em;line-height:1.4;';
  var DEN_STYLE   = 'padding:0 0.1em;line-height:1.4;';
  var SUP_STYLE   = 'vertical-align:super;font-size:0.75em;';
  var SUB_STYLE   = 'vertical-align:sub;font-size:0.75em;';
  var SQRT_STYLE  = 'display:inline-flex;align-items:center;margin:0 0.1em;';
  var RADICAL_ST  = 'border-top:1.5px solid currentColor;border-left:1.5px solid currentColor;padding:0 0.15em 0 0.05em;';

  /**
   * Convert a LaTeX string to HTML using the micro-renderer.
   * This is intentionally not a full LaTeX parser — it processes the most
   * common constructs in a single left-to-right pass.
   *
   * @param  {string}  latex
   * @param  {boolean} display  true → block-level ($$...$$)
   * @returns {string}           HTML string
   */
  function microRender(latex, display) {
    var html = processLatex(latex.trim());
    var style = display ? BLOCK_STYLE : INLIN_STYLE;
    var tag   = display ? 'div' : 'span';
    return '<' + tag + ' class="agni-math agni-math-' + (display ? 'block' : 'inline') +
           '" style="' + style + '" aria-label="' + escAttr(latex) + '">' + html + '</' + tag + '>';
  }

  function escAttr(s) { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Token-based LaTeX processor ────────────────────────────────────────────

  function processLatex(src) {
    var out = '';
    var i   = 0;

    while (i < src.length) {
      var ch = src[i];

      if (ch === '\\') {
        // LaTeX command
        var cmd = '';
        i++;
        if (i >= src.length) break;

        if (/[a-zA-Z]/.test(src[i])) {
          while (i < src.length && /[a-zA-Z]/.test(src[i])) { cmd += src[i]; i++; }
          // Skip trailing space after command
          if (src[i] === ' ') i++;
        } else {
          // Single-char command: \, \; \! etc.
          cmd = src[i]; i++;
        }

        var pair = renderCommandPair(cmd, src, i);
        out += pair[0];
        i    = pair[1];

      } else if (ch === '{') {
        // Bare braces — just process content
        var inner = extractBraced(src, i);
        out += processLatex(inner[0]);
        i   = inner[1];

      } else if (ch === '^') {
        // Superscript
        i++;
        var sup = extractArg(src, i);
        out += '<sup style="' + SUP_STYLE + '">' + processLatex(sup[0]) + '</sup>';
        i   = sup[1];

      } else if (ch === '_') {
        // Subscript
        i++;
        var sub = extractArg(src, i);
        out += '<sub style="' + SUB_STYLE + '">' + processLatex(sub[0]) + '</sub>';
        i   = sub[1];

      } else if (ch === ' ') {
        out += ' ';
        i++;

      } else if (ch === '&') {
        // Alignment tab in environments — treat as thin space in micro-renderer
        out += '&emsp;';
        i++;

      } else {
        out += escHtml(ch);
        i++;
      }
    }

    return out;
  }

  // Returns [html, newIndex] — always used in tandem
  function renderCommandPair(cmd, src, i) {
    // Greek
    if (GREEK[cmd]) return [GREEK[cmd], i];

    // Symbols
    if (SYMBOLS[cmd]) return [SYMBOLS[cmd], i];

    // \frac{num}{den}
    if (cmd === 'frac') {
      var num = extractBraced(src, i);
      var den = extractBraced(src, num[1]);
      var html = '<span style="' + FRAC_STYLE + '">' +
                 '<span style="' + NUM_STYLE + '">' + processLatex(num[0]) + '</span>' +
                 '<span style="' + DEN_STYLE + '">' + processLatex(den[0]) + '</span>' +
                 '</span>';
      return [html, den[1]];
    }

    // \sqrt[n]{x}  or  \sqrt{x}
    if (cmd === 'sqrt') {
      var idx = '';
      var ii = i;
      if (src[ii] === '[') {
        var close = src.indexOf(']', ii);
        idx = close > ii ? src.slice(ii + 1, close) : '';
        ii  = close > ii ? close + 1 : ii;
      }
      var arg = extractBraced(src, ii);
      var radical = idx
        ? '<sup style="font-size:0.6em;vertical-align:super">' + escHtml(idx) + '</sup>√'
        : '√';
      var sqHtml = '<span style="' + SQRT_STYLE + '">' + radical +
                   '<span style="' + RADICAL_ST + '">' + processLatex(arg[0]) + '</span>' +
                   '</span>';
      return [sqHtml, arg[1]];
    }

    // \vec{v}
    if (cmd === 'vec') {
      var varg = extractBraced(src, i);
      return ['<span style="position:relative">' + processLatex(varg[0]) +
              '<span style="position:absolute;top:-0.4em;left:0;right:0;text-align:center;font-size:0.7em">→</span></span>', varg[1]];
    }

    // \hat{v}
    if (cmd === 'hat') {
      var harg = extractBraced(src, i);
      return ['<span style="position:relative">' + processLatex(harg[0]) +
              '<span style="position:absolute;top:-0.35em;left:0;right:0;text-align:center;font-size:0.7em">^</span></span>', harg[1]];
    }

    // \overline{x}
    if (cmd === 'overline') {
      var oarg = extractBraced(src, i);
      return ['<span style="text-decoration:overline">' + processLatex(oarg[0]) + '</span>', oarg[1]];
    }

    // \text{...}
    if (cmd === 'text' || cmd === 'mathrm' || cmd === 'textit') {
      var targ = extractBraced(src, i);
      var fontStyle = cmd === 'textit' ? 'font-style:italic;' : '';
      return ['<span style="font-family:sans-serif;' + fontStyle + '">' + escHtml(targ[0]) + '</span>', targ[1]];
    }

    // \mathbf{x}  \boldsymbol{x}
    if (cmd === 'mathbf' || cmd === 'boldsymbol') {
      var barg = extractBraced(src, i);
      return ['<strong>' + processLatex(barg[0]) + '</strong>', barg[1]];
    }

    // \left( ... \right)  — stretchy delimiters (simplified: just render content)
    if (cmd === 'left') {
      var delim = src[i] || '(';
      return [escHtml(delim), i + 1];
    }
    if (cmd === 'right') {
      var rdelim = src[i] || ')';
      return [escHtml(rdelim), i + 1];
    }

    // \begin{...}...\end{...} environments — flatten to inline
    if (cmd === 'begin') {
      var envArg = extractBraced(src, i);
      // Skip to \end{envname}
      var endTag = '\\end{' + envArg[0] + '}';
      var endIdx = src.indexOf(endTag, envArg[1]);
      if (endIdx === -1) return ['', src.length];
      var envContent = src.slice(envArg[1], endIdx);
      // Replace \\ (row break) with line break
      envContent = envContent.replace(/\\\\/g, '<br>');
      return [processLatex(envContent), endIdx + endTag.length];
    }
    if (cmd === 'end') {
      var earg = extractBraced(src, i);
      return ['', earg[1]];
    }

    // \\ (line break in display math)
    if (cmd === '\\') return ['<br>', i];

    // Unknown command — render literally with backslash
    return ['\\' + escHtml(cmd), i];
  }


  // ── Argument extraction helpers ────────────────────────────────────────────

  /** Extract content of {…} block. Returns [content, indexAfterClose]. */
  function extractBraced(src, i) {
    if (src[i] !== '{') {
      // Single character argument (e.g. x^2 rather than x^{2})
      return [src[i] || '', i + 1];
    }
    var depth = 0, start = i + 1;
    while (i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return [src.slice(start, i), i + 1]; }
      i++;
    }
    return [src.slice(start), src.length];
  }

  /** Extract next argument: {…} or single char. */
  function extractArg(src, i) {
    while (i < src.length && src[i] === ' ') i++;
    return extractBraced(src, i);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 2. KaTeX progressive enhancement
  //    Check cache → load CSS + JS → re-render queued elements
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectKatexCSS() {
    if (document.getElementById('agni-katex-css')) return;
    var link = document.createElement('link');
    link.id   = 'agni-katex-css';
    link.rel  = 'stylesheet';
    link.href = KATEX_CDN + 'katex.min.css';
    document.head.appendChild(link);
  }

  function _loadKatex() {
    if (_katexLoaded || _katexLoading) return;
    _katexLoading = true;

    // Check Cache API first
    var fetchKatex = typeof caches !== 'undefined'
      ? caches.open(KATEX_CACHE_KEY).then(function (cache) {
          return cache.match(KATEX_CDN + 'katex.min.js').then(function (resp) {
            if (resp) { log.debug('KaTeX: cache hit'); return resp.text(); }
            log.debug('KaTeX: fetching from CDN');
            return fetch(KATEX_CDN + 'katex.min.js').then(function (r) {
              var clone = r.clone();
              cache.put(KATEX_CDN + 'katex.min.js', clone);
              return r.text();
            });
          });
        })
      : fetch(KATEX_CDN + 'katex.min.js').then(function (r) { return r.text(); });

    fetchKatex.then(function (jsText) {
      // Execute KaTeX in global scope
      try { (new Function(jsText))(); } catch (e) { log.warn('KaTeX load error:', e.message); return; }
      _katexLoaded  = true;
      _katexLoading = false;
      _injectKatexCSS();
      log.debug('KaTeX loaded, re-rendering', _pendingRenders.length, 'elements');
      // Re-render everything that used the micro-renderer
      _pendingRenders.forEach(function (task) {
        try {
          global.katex.render(task.latex, task.el, {
            displayMode:  task.display,
            throwOnError: false,
            errorColor:   '#ff8787'
          });
        } catch (e) { /* keep micro-rendered version */ }
      });
      _pendingRenders = [];
    }).catch(function (err) {
      _katexLoading = false;
      log.warn('KaTeX unavailable (offline?):', err.message);
    });
  }

  /**
   * Render a single math expression into an element.
   * Uses KaTeX if available, micro-renderer otherwise.
   * Queues for KaTeX upgrade when it loads.
   *
   * @param {string}      latex
   * @param {HTMLElement} el       target element (will be replaced / filled)
   * @param {boolean}     display  true = block ($$), false = inline ($)
   */
  function renderInto(latex, el, display) {
    if (_katexLoaded && global.katex) {
      try {
        global.katex.render(latex, el, { displayMode: display, throwOnError: false, errorColor: '#ff8787' });
        return;
      } catch (e) { /* fall through to micro */ }
    }
    // Micro-render now; queue for KaTeX upgrade
    el.innerHTML = microRender(latex, display);
    _pendingRenders.push({ el: el, latex: latex, display: display });
    // Kick off background KaTeX load (won't block rendering)
    _loadKatex();
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DOM scanner
  //    Finds all $...$ and $$...$$ occurrences in a container element and
  //    replaces them with rendered math spans/divs.
  //    Called by player.js after each step renders.
  // ═══════════════════════════════════════════════════════════════════════════

  var BLOCK_RE  = /\$\$([\s\S]+?)\$\$/g;
  var INLINE_RE = /\$([^$\n]+?)\$/g;

  /**
   * Scan a container element and render all LaTeX delimiters found in its
   * text nodes. Modifies the DOM in place.
   *
   * @param {HTMLElement} container
   */
  function renderAll(container) {
    if (!container) return;
    // Work on innerHTML for simplicity; safe because lesson content is
    // already sanitised upstream by the Markdown processor
    var html = container.innerHTML;
    if (html.indexOf('$') === -1) return;   // fast path: no math

    // Block math first ($$...$$)
    html = html.replace(BLOCK_RE, function (_, latex) {
      var el = document.createElement('div');
      renderInto(latex.trim(), el, true);
      return el.outerHTML;
    });

    // Inline math ($...$)
    html = html.replace(INLINE_RE, function (_, latex) {
      var el = document.createElement('span');
      renderInto(latex.trim(), el, false);
      return el.outerHTML;
    });

    container.innerHTML = html;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Attach to AGNI_SHARED and register
  // ═══════════════════════════════════════════════════════════════════════════

  S.mathRenderer = {
    renderAll:   renderAll,     // main entry point for player.js
    renderInto:  renderInto,    // render a single expression into a given element
    microRender: microRender,   // direct micro-renderer access (testing / WYSIWYG)
    loadKatex:   _loadKatex     // pre-fetch KaTeX in background
  };

  S.registerModule('math-renderer', '1.7.0');

  if (DEV_MODE) log.debug('math-renderer v1.7.0 loaded');

}(window));
