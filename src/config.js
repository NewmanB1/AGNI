// src/config.js
// AGNI Compiler Configuration  v1.8.0
//
// Provides the Markdown processing pipeline used by buildLessonIR.js
// to pre-render lesson step content at compile time.
//
// Changes from v1.7.0:
//   - Fixed Markdown pipeline: replaced remark-html with the correct
//     remark-rehype → rehype-katex → rehype-stringify chain. remark-html
//     predates the remark/rehype ecosystem split and cannot handle
//     plugin-generated AST node types like math — it silently drops
//     $...$ and $$...$$ blocks rather than rendering them.
//   - Fixed singleton reset on failure: if processor initialisation fails,
//     the cached Promise is now cleared so the next build attempt retries
//     rather than permanently serving a broken pipeline within the same
//     Node.js process. This matters most in fresh checkouts where a missing
//     node_module causes a transient failure.
//   - Stripped per-call verbose logging: removed the '[config] awaiting
//     processor' and '[config] processing text' lines that fired on every
//     step. One log line '[config] Markdown processor ready' fires once
//     when the singleton initialises. Errors always log regardless of mode.
//   - Version bumped to 1.8.0.
//
// KaTeX CSS is NOT injected here. The pipeline renders math to HTML using
// KaTeX but assumes the required CSS is loaded by factory-loader.js at
// runtime based on the katexAssets list in the lesson sidecar. Injecting
// CSS here would add ~95KB to every lesson with equations and violate the
// 500KB lesson packet budget on 2G links.
//
// Target: Node.js 14+. Not loaded on the edge device.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Singleton processor ───────────────────────────────────────────────────────
// The remark/rehype pipeline is expensive to initialise (dynamic imports,
// plugin setup). We build it once and reuse it across all steps and lessons
// compiled in the same Node process.
//
// processorPromise is set to null on failure so that the next call retries
// rather than caching a permanently broken pipeline. See the error handler
// in _buildProcessor() for the reset.
var processorPromise = null;

/**
 * Returns a Promise that resolves to the unified processor instance.
 * Initialises the pipeline on first call; subsequent calls return the
 * cached Promise.
 *
 * Pipeline:
 *   remark-parse      — parses Markdown source to mdast (Markdown AST)
 *   remark-math       — parses $...$ inline and $$...$$ block math nodes
 *   remark-rehype     — converts mdast → hast (HTML AST)
 *                       allowDangerousHtml: true so raw HTML in step
 *                       content (e.g. <b>, <em>) passes through
 *   rehype-katex      — renders math hast nodes to HTML using KaTeX
 *                       output: 'html' (not mathml) for compatibility with
 *                       old Android WebView which has no MathML support
 *                       throwOnError: false so a bad LaTeX expression
 *                       renders as red error text rather than crashing
 *                       the build
 *   rehype-stringify  — serialises hast to an HTML string
 *
 * @returns {Promise<UnifiedProcessor>}
 */
function _getProcessor() {
  if (processorPromise) return processorPromise;

  processorPromise = _buildProcessor().catch(function (err) {
    // Reset so the next build attempt retries rather than serving a
    // permanently broken pipeline. A transient failure (missing module
    // in a fresh checkout, network error on npm install) should not
    // poison every subsequent lesson compilation in this process.
    processorPromise = null;
    throw err;
  });

  return processorPromise;
}

async function _buildProcessor() {
  // Dynamic imports: these are ESM-only packages (unified ecosystem v10+).
  // We use dynamic import() so this CommonJS file can consume them.
  var unified        = (await import('unified')).unified;
  var remarkParse    = (await import('remark-parse')).default;
  var remarkMath     = (await import('remark-math')).default;
  var remarkRehype   = (await import('remark-rehype')).default;
  var rehypeKatex    = (await import('rehype-katex')).default;
  var rehypeStringify = (await import('rehype-stringify')).default;

  var processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype, {
      // Pass raw HTML from lesson YAML through to the output.
      // Lesson authors are trusted — the YAML is compiled on the hub,
      // not submitted by end users. Without this, HTML like <strong>
      // in step content would be escaped rather than rendered.
      allowDangerousHtml: true
    })
    .use(rehypeKatex, {
      // Render to HTML rather than MathML. Android 4–6 WebView has no
      // MathML support. KaTeX HTML output uses spans and CSS which work
      // on all target browsers including iOS 9 Safari.
      output: 'html',
      // A bad LaTeX expression renders as red error text rather than
      // throwing an exception that aborts the lesson build. The author
      // sees the error in the compiled lesson and can fix the YAML.
      throwOnError: false,
      // errorColor is the colour used for broken LaTeX in the output.
      errorColor: '#ff6b35'
    })
    .use(rehypeStringify, {
      allowDangerousHtml: true
    });

  console.log('[config] Markdown processor ready');
  return processor;
}


/**
 * Process a Markdown string and return the rendered HTML.
 *
 * Called by buildLessonIR.js for each step's content field.
 * All calls within a build share the same processor instance.
 *
 * @param  {string} markdown   raw Markdown text (may contain $...$ math)
 * @returns {Promise<string>}  rendered HTML string
 */
async function processMarkdown(markdown) {
  var processor = await _getProcessor();
  var result    = await processor.process(markdown);
  return String(result);
}


module.exports = {
  processMarkdown: processMarkdown
};
