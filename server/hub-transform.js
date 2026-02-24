// server/hub-transform.js
// AGNI Hub Transform  v1.0.0
//
// On-demand lesson delivery server. Transforms YAML source into compiled
// lesson HTML at request time and serves it directly to the device browser.
// Also serves factory files, KaTeX CSS, and static runtime assets from the
// hub's /factories/ endpoint so factory-loader.js can fetch and cache them.
//
// Responsibilities:
//   GET /lessons/:slug        — compile YAML → HTML, stream to device
//   GET /factories/:file      — serve cached runtime asset (factory files,
//                               shared-runtime.js, sensor-bridge.js, etc.)
//   GET /katex/:file          — serve KaTeX CSS subset files
//   GET /manifest.json        — PWA manifest
//   GET /sw.js                — Service Worker
//
// Integration with theta.js:
//   hub-transform.js exports an attachRoutes(server) function that adds
//   the above routes to the existing theta.js http.Server instance.
//   Alternatively it can run standalone on AGNI_SERVE_PORT (default 8083).
//
//   In theta.js startApi(), add:
//     require('../server/hub-transform').attachRoutes(server);
//
// YAML source lookup:
//   Lessons are located by slug under YAML_DIR (default: data/yaml/).
//   Slug → file: <YAML_DIR>/<slug>.yaml or <YAML_DIR>/<slug>/index.yaml
//
// Caching strategy:
//   Compiled lesson HTML is cached in memory keyed to slug + YAML mtime.
//   A changed YAML file invalidates only that lesson's cache entry.
//   Factory files are static — served with long Cache-Control headers.
//   Lesson HTML is served with no-cache so devices always get the current
//   compiled version (the device-side Cache API handles factory caching).
//
// Target: Node.js 14+. Runs on the Village Hub only.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var fs      = require('fs');
var path    = require('path');
var zlib    = require('zlib');
var yaml    = require('js-yaml');

var compiler           = require('../src/compiler');
var buildLessonIR      = compiler.buildLessonIR;
var buildLessonSidecar = compiler.buildLessonSidecar;
var buildKatexCss      = require('../src/utils/katex-css-builder');
var signContent        = require('../src/utils/crypto').signContent;
var generateNonce      = require('../src/utils/csp').generateNonce;
var buildCspMeta       = require('../src/utils/csp').buildCspMeta;
var lessonAssembly     = require('../src/services/lessonAssembly');

// ── Paths ─────────────────────────────────────────────────────────────────────
var YAML_DIR      = process.env.AGNI_YAML_DIR    || path.join(__dirname, '../data/yaml');
var FACTORY_DIR   = process.env.AGNI_FACTORY_DIR || path.join(__dirname, '../src/runtime');
var KATEX_DIR     = process.env.AGNI_KATEX_DIR   || path.join(__dirname, '../data/katex-css');
var DATA_DIR      = process.env.AGNI_DATA_DIR     || path.join(__dirname, '../data');
var SERVE_PORT    = parseInt(process.env.AGNI_SERVE_PORT || '8083', 10);

// ── In-memory lesson cache ────────────────────────────────────────────────────
// { slug: { html: string, sidecar: object, mtime: number, lastAccessed: number } }
//
// MAX_CACHE_ENTRIES caps memory usage on long-running Pi processes.
// LRU eviction: when the cache is full, the entry with the oldest
// lastAccessed timestamp is removed before the new one is inserted.
// Each compiled lesson HTML is roughly 50–500KB. At 100 entries that
// is 5–50MB worst case, acceptable on a Pi with 1–2GB RAM.
var _lessonCache   = {};
var _cacheSize     = 0;
var MAX_CACHE_ENTRIES = parseInt(process.env.AGNI_CACHE_MAX || '100', 10);

// ── Per-slug in-flight compilation guard ─────────────────────────────────────
// Prevents concurrent requests for the same slug from each triggering a
// full buildLessonIR() call — a CPU DoS vector on a Pi when many devices
// request the same lesson simultaneously (e.g. class starting together).
// When a compilation is already in flight for a slug, subsequent requests
// await the same Promise rather than starting a new one.
var _compilingNow  = {};

// ── Allowed factory files ─────────────────────────────────────────────────────
// Whitelist prevents directory traversal. Only files in this set can be
// served from /factories/. All are ES5-compatible IIFE scripts.
var ALLOWED_FACTORY_FILES = new Set([
  'binary-utils.js',
  'shared-runtime.js',
  'sensor-bridge.js',
  'svg-stage.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js',
  'factory-loader.js'
]);

// ── Allowed KaTeX CSS files ───────────────────────────────────────────────────
var ALLOWED_KATEX_FILES = new Set([
  'katex-core.css',
  'katex-fonts.css',
  'katex-symbols-algebra.css',
  'katex-symbols-trig.css',
  'katex-symbols-calculus.css',
  'katex-symbols-physics.css',
  'katex-symbols-sets.css'
]);

// ── MIME types ────────────────────────────────────────────────────────────────
var MIME = {
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};


// ═══════════════════════════════════════════════════════════════════════════
// YAML loader
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Locate and parse a YAML lesson file by slug.
 * Tries <YAML_DIR>/<slug>.yaml then <YAML_DIR>/<slug>/index.yaml.
 *
 * @param  {string} slug
 * @returns {{ lessonData: object, yamlPath: string, mtime: number } | null}
 */
function loadYaml(slug) {
  // Sanitise slug: only allow alphanumeric, hyphens, underscores, and slashes
  // for subdirectory paths. Reject anything that could be a traversal attempt.
  if (!/^[a-zA-Z0-9_\-/]+$/.test(slug)) return null;

  var candidates = [
    path.join(YAML_DIR, slug + '.yaml'),
    path.join(YAML_DIR, slug, 'index.yaml')
  ];

  for (var i = 0; i < candidates.length; i++) {
    var yamlPath = candidates[i];
    if (!fs.existsSync(yamlPath)) continue;

    // Resolve to absolute path and confirm it's inside YAML_DIR
    var resolved = path.resolve(yamlPath);
    var base     = path.resolve(YAML_DIR);
    if (!resolved.startsWith(base + path.sep)) return null;  // traversal guard

    try {
      var raw        = fs.readFileSync(yamlPath, 'utf8');
      var lessonData = yaml.load(raw);
      var mtime      = fs.statSync(yamlPath).mtimeMs;
      return { lessonData: lessonData, yamlPath: yamlPath, mtime: mtime };
    } catch (err) {
      console.error('[HUB-TRANSFORM] YAML parse error for', slug, ':', err.message);
      return null;
    }
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════════════
// Lesson compiler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compile a lesson YAML into HTML and sidecar.
 * Returns cached result if the YAML file has not changed since last compile.
 *
 * Per-slug in-flight guard: if a compilation for this slug is already running,
 * awaits the existing Promise rather than starting a parallel compile. This
 * prevents a CPU spike when many devices request the same lesson simultaneously.
 *
 * LRU cache eviction: when the cache reaches MAX_CACHE_ENTRIES, the least
 * recently accessed entry is removed before inserting the new one.
 *
 * @param  {string} slug
 * @param  {object} options   { deviceId, privateKey, dev }
 * @returns {Promise<{ html: string, sidecar: object } | null>}
 */
async function compileLesson(slug, options) {
  var loaded = loadYaml(slug);
  if (!loaded) return null;

  var cached = _lessonCache[slug];
  if (cached && cached.mtime === loaded.mtime) {
    cached.lastAccessed = Date.now();
    if (options.dev) console.log('[HUB-TRANSFORM] Cache hit:', slug);
    return { html: cached.html, sidecar: cached.sidecar };
  }

  // In-flight guard: return existing compilation Promise if one is running
  if (_compilingNow[slug]) {
    if (options.dev) console.log('[HUB-TRANSFORM] Awaiting in-flight compile:', slug);
    return _compilingNow[slug];
  }

  console.log('[HUB-TRANSFORM] Compiling:', slug);
  _compilingNow[slug] = _doCompile(slug, loaded, options).finally(function () {
    delete _compilingNow[slug];
  });
  return _compilingNow[slug];
}

/**
 * Internal: perform the actual compilation. Called only by compileLesson()
 * after the in-flight and mtime checks pass.
 */
async function _doCompile(slug, loaded, options) {

  var ir      = await buildLessonIR(loaded.lessonData, options);
  var sidecar = buildLessonSidecar(ir);

  // Build factory dependency list (same logic as html.js Step 6)
  var RUNTIME_VERSION = '1.9.0';
  var factoryDeps     = [{ file: 'binary-utils.js', version: RUNTIME_VERSION }, { file: 'shared-runtime.js', version: RUNTIME_VERSION }];
  var manifest        = (ir.inferredFeatures && ir.inferredFeatures.factoryManifest) || [];
  manifest.forEach(function (filename) {
    factoryDeps.push({ file: filename, version: RUNTIME_VERSION });
  });
  ir.requires = { factories: factoryDeps };

  // Ensure KaTeX CSS files exist on disk for /katex/ serving
  if (ir.inferredFeatures.katexAssets.length > 0) {
    if (!fs.existsSync(KATEX_DIR)) fs.mkdirSync(KATEX_DIR, { recursive: true });
    buildKatexCss.buildKatexCss(ir.inferredFeatures.katexAssets, KATEX_DIR);
  }

  // Read runtime files
  var runtimeDir      = path.join(__dirname, '../src/runtime');
  var factoryLoaderJs = fs.readFileSync(path.join(runtimeDir, 'factory-loader.js'), 'utf8');
  var playerJs        = fs.readFileSync(path.join(runtimeDir, 'player.js'),         'utf8');
  var styles          = fs.readFileSync(path.join(runtimeDir, 'style.css'),          'utf8');

  // Serialize and sign; script block shared with CLI html builder (lessonAssembly)
  var dataString = JSON.stringify(ir);
  var signature  = signContent(dataString, options.deviceId, options.privateKey);
  var lessonScript = lessonAssembly.buildLessonScript(ir, {
    signature:       signature,
    publicKeySpki:   options.publicKeySpki != null ? options.publicKeySpki : '',
    deviceId:        options.deviceId || '',
    factoryLoaderJs: factoryLoaderJs,
    playerJs:        playerJs
  });

  // Generate a per-request nonce for the CSP <meta> tag.
  // LESSON_DATA changes every compilation so a hash would have to be
  // recomputed per request — a nonce is equivalent and simpler here.
  var nonce = generateNonce();
  var html = _buildPwaShell(ir, styles, lessonScript, nonce);

  // LRU eviction: if cache is full, remove the least recently accessed entry
  if (_cacheSize >= MAX_CACHE_ENTRIES) {
    var oldestSlug = null;
    var oldestTime = Infinity;
    Object.keys(_lessonCache).forEach(function (s) {
      if (_lessonCache[s].lastAccessed < oldestTime) {
        oldestTime = _lessonCache[s].lastAccessed;
        oldestSlug = s;
      }
    });
    if (oldestSlug) {
      delete _lessonCache[oldestSlug];
      _cacheSize--;
      console.log('[HUB-TRANSFORM] Cache evicted:', oldestSlug);
    }
  }

  _lessonCache[slug] = {
    html:         html,
    sidecar:      sidecar,
    mtime:        loaded.mtime,
    lastAccessed: Date.now()
  };
  _cacheSize++;

  return { html: html, sidecar: sidecar };
}

/**
 * Wrap compiled lesson content in the PWA shell HTML.
 * Equivalent to assembling the <html> document in html.js Step 9.
 *
 * The shell differs from the CLI output in two ways:
 *   1. <link rel="manifest"> points to /manifest.json
 *   2. <script src="/sw.js"> registration block is included
 *
 * @param  {object} ir            compiled IR
 * @param  {string} styles        contents of style.css
 * @param  {string} lessonScript  assembled inline script block
 * @returns {string}
 */
function _buildPwaShell(ir, styles, lessonScript, nonce) {
  var lang    = _escapeHtml((ir.meta && ir.meta.language) || 'en');
  var title   = _escapeHtml((ir.meta && ir.meta.title)    || 'AGNI Lesson');
  var cspMeta = buildCspMeta({ nonce: nonce });
  // nonce value embedded in the script tag must not be HTML-escaped —
  // only the CSP meta content attribute needs escaping (done inside buildCspMeta).
  var nonceAttr = ' nonce="' + nonce + '"';

  return [
    '<!DOCTYPE html>',
    '<html lang="' + lang + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
    '  <meta name="theme-color" content="#1a1a2e">',
    '  ' + cspMeta,
    '  <title>' + title + '</title>',
    '  <link rel="manifest" href="/manifest.json">',
    '  <style>' + styles + '</style>',
    '</head>',
    '<body>',
    '  <div id="loading">Loading lesson\u2026</div>',
    '  <div id="app"></div>',
    '  <script' + nonceAttr + '>',
    '  // Register Service Worker',
    '  if (\'serviceWorker\' in navigator) {',
    '    navigator.serviceWorker.register(\'/sw.js\')',
    '      .catch(function(e) { console.warn(\'[SW] Registration failed:\', e.message); });',
    '  }',
    '  </script>',
    '  <script' + nonceAttr + '>',
    lessonScript,
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}


// ═══════════════════════════════════════════════════════════════════════════
// Response helpers
// ═══════════════════════════════════════════════════════════════════════════

function _escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/**
 * Send a text/HTML or text/plain response, gzipped if accepted.
 */
function _sendText(req, res, statusCode, contentType, body) {
  var buf = Buffer.from(body, 'utf8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', contentType);

  if (req.headers['accept-encoding'] &&
      req.headers['accept-encoding'].indexOf('gzip') !== -1 &&
      buf.length > 1024) {
    res.setHeader('Content-Encoding', 'gzip');
    res.writeHead(statusCode);
    res.end(zlib.gzipSync(buf));
  } else {
    res.writeHead(statusCode);
    res.end(buf);
  }
}

function _sendJson(req, res, statusCode, payload) {
  _sendText(req, res, statusCode, 'application/json; charset=utf-8',
    JSON.stringify(payload));
}

function _sendFile(req, res, filePath, contentType, maxAge) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  var buf = fs.readFileSync(filePath);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=' + (maxAge || 0));

  if (req.headers['accept-encoding'] &&
      req.headers['accept-encoding'].indexOf('gzip') !== -1 &&
      buf.length > 1024) {
    res.setHeader('Content-Encoding', 'gzip');
    res.writeHead(200);
    res.end(zlib.gzipSync(buf));
  } else {
    res.writeHead(200);
    res.end(buf);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// Route handler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle an incoming request for lesson delivery or factory assets.
 * Returns true if the request was handled, false to fall through to the
 * next handler (e.g. theta.js routes).
 *
 * @param  {http.IncomingMessage} req
 * @param  {http.ServerResponse}  res
 * @param  {object}               options   { deviceId, privateKey, dev }
 * @returns {boolean}
 */
function handleRequest(req, res, options) {
  var urlPath = req.url.split('?')[0];

  // GET /lessons/:slug — compile YAML on demand and stream lesson HTML
  var lessonMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)$/);
  if (req.method === 'GET' && lessonMatch) {
    var slug = lessonMatch[1];
    compileLesson(slug, options || {}).then(function (result) {
      if (!result) {
        _sendText(req, res, 404, 'text/html; charset=utf-8',
          '<h1>Lesson not found</h1><p>No YAML source found for: ' +
          _escapeHtml(slug) + '</p>');
        return;
      }
      // Lesson HTML: no-cache so devices always get the current compiled version.
      // The device-side Cache API (via factory-loader.js) handles factory caching.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      _sendText(req, res, 200, 'text/html; charset=utf-8', result.html);
    }).catch(function (err) {
      console.error('[HUB-TRANSFORM] Compile error for', slug, ':', err.message);
      _sendText(req, res, 500, 'text/html; charset=utf-8',
        '<h1>Compilation error</h1><pre>' + _escapeHtml(err.message) + '</pre>');
    });
    return true;
  }

  // GET /lessons/:slug/sidecar — serve lesson IR sidecar for theta engine
  var sidecarMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)\/sidecar$/);
  if (req.method === 'GET' && sidecarMatch) {
    var sidecarSlug = sidecarMatch[1];
    compileLesson(sidecarSlug, options || {}).then(function (result) {
      if (!result) return _sendJson(req, res, 404, { error: 'Lesson not found' });
      _sendJson(req, res, 200, result.sidecar);
    }).catch(function (err) {
      _sendJson(req, res, 500, { error: err.message });
    });
    return true;
  }

  // GET /factories/:file — serve a runtime factory file with long cache headers.
  // factory-loader.js fetches these at lesson startup and caches them on-device.
  var factoryMatch = urlPath.match(/^\/factories\/(.+)$/);
  if (req.method === 'GET' && factoryMatch) {
    var factoryFile = path.basename(factoryMatch[1]);  // basename strips any ../ attempts
    if (!ALLOWED_FACTORY_FILES.has(factoryFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    var factoryPath = path.join(FACTORY_DIR, factoryFile);
    // Long cache: 7 days. Version string in factory-loader cache key forces
    // refresh when RUNTIME_VERSION bumps, so stale-while-revalidate is safe.
    _sendFile(req, res, factoryPath, MIME['.js'], 604800);
    return true;
  }

  // GET /katex/:file — serve a KaTeX CSS subset file.
  var katexMatch = urlPath.match(/^\/katex\/(.+)$/);
  if (req.method === 'GET' && katexMatch) {
    var katexFile = path.basename(katexMatch[1]);
    if (!ALLOWED_KATEX_FILES.has(katexFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    var katexPath = path.join(KATEX_DIR, katexFile);
    // Long cache: 30 days. KaTeX CSS changes only with KaTeX version bumps.
    _sendFile(req, res, katexPath, MIME['.css'], 2592000);
    return true;
  }

  // GET /manifest.json — PWA manifest
  if (req.method === 'GET' && urlPath === '/manifest.json') {
    var manifestPath = path.join(__dirname, 'manifest.json');
    _sendFile(req, res, manifestPath, MIME['.json'], 86400);
    return true;
  }

  // GET /sw.js — Service Worker
  if (req.method === 'GET' && urlPath === '/sw.js') {
    var swPath = path.join(__dirname, 'sw.js');
    // Service Worker must not be cached — browsers check it for updates.
    res.setHeader('Cache-Control', 'no-cache');
    _sendFile(req, res, swPath, MIME['.js'], 0);
    return true;
  }

  return false;  // not handled — fall through to theta.js routes
}

/**
 * Attach lesson delivery routes to an existing http.Server instance.
 * Called from theta.js startApi() to add routes to the shared server.
 *
 * The existing theta.js request handler is wrapped: hub-transform routes
 * are checked first; unhandled requests fall through to theta's handler.
 *
 * @param {http.Server} server   existing theta.js server
 * @param {object}      options  { deviceId, privateKey, dev }
 */
function attachRoutes(server, options) {
  // Wrap the existing listener rather than replacing it
  var listeners = server.listeners('request').slice();
  server.removeAllListeners('request');

  server.on('request', function (req, res) {
    var handled = handleRequest(req, res, options || {});
    if (!handled) {
      // Fall through to original theta.js handler
      for (var i = 0; i < listeners.length; i++) {
        listeners[i].call(server, req, res);
      }
    }
  });

  console.log('[HUB-TRANSFORM] Routes attached — serving /lessons/, /factories/, /katex/');
}

/**
 * Run hub-transform as a standalone server (alternative to attaching to theta.js).
 * Useful for testing or when running hub-transform on a separate process/port.
 */
function startStandalone(options) {
  var http = require('http');
  var server = http.createServer(function (req, res) {
    var handled = handleRequest(req, res, options || {});
    if (!handled) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  server.listen(SERVE_PORT, '0.0.0.0', function () {
    console.log('[HUB-TRANSFORM] Standalone server listening on port', SERVE_PORT);
  });
  return server;
}


module.exports = {
  attachRoutes:    attachRoutes,
  startStandalone: startStandalone,
  handleRequest:   handleRequest,
  compileLesson:   compileLesson,
  loadYaml:        loadYaml
};
