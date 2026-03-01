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

const fs      = require('fs');
const path    = require('path');
const zlib    = require('zlib');
const yaml    = require('js-yaml');

const { createLogger }   = require('../src/utils/logger');
const log                = createLogger('hub-transform');
const compiler           = require('../src/compiler');
const buildLessonIR      = compiler.buildLessonIR;
const buildLessonSidecar = compiler.buildLessonSidecar;
const buildKatexCss      = require('../src/utils/katex-css-builder');
const lessonSchema       = require('../src/services/lesson-schema');
const { signContent, canonicalJSON } = require('../src/utils/crypto');
const generateNonce      = require('../src/utils/csp').generateNonce;
const buildCspMeta       = require('../src/utils/csp').buildCspMeta;
const lessonAssembly     = require('../src/services/lesson-assembly');
const _escapeHtml        = require('../src/utils/io').escapeHtml;
const { resolveFactoryPath } = require('../src/utils/runtimeManifest');

// ── Paths (from centralized config) ──────────────────────────────────────────
const envConfig     = require('../src/utils/env-config');
const YAML_DIR      = envConfig.yamlDir;
const FACTORY_DIR   = process.env.AGNI_FACTORY_DIR || path.join(__dirname, '../src/runtime');
const KATEX_DIR     = process.env.AGNI_KATEX_DIR   || path.join(__dirname, '../data/katex-css');
const DATA_DIR      = envConfig.dataDir;
const SERVE_PORT    = envConfig.servePort;

// ── In-memory lesson cache ────────────────────────────────────────────────────
// { slug: { html: string, sidecar: object, mtime: number, lastAccessed: number } }
//
// MAX_CACHE_ENTRIES caps memory usage on long-running Pi processes.
// LRU eviction: when the cache is full, the entry with the oldest
// lastAccessed timestamp is removed before the new one is inserted.
// Each compiled lesson HTML is roughly 50–500KB. At 100 entries that
// is 5–50MB worst case, acceptable on a Pi with 1–2GB RAM.
const _lessonCache   = {};
let _cacheSize       = 0;
const MAX_CACHE_ENTRIES = parseInt(process.env.AGNI_CACHE_MAX || '100', 10);

// ── Per-slug in-flight compilation guard ─────────────────────────────────────
// Prevents concurrent requests for the same slug from each triggering a
// full buildLessonIR() call — a CPU DoS vector on a Pi when many devices
// request the same lesson simultaneously (e.g. class starting together).
// When a compilation is already in flight for a slug, subsequent requests
// await the same Promise rather than starting a new one.
const _compilingNow  = {};

// ── Allowed factory files ─────────────────────────────────────────────────────
// Whitelist prevents directory traversal. Only files in this set can be
// served from /factories/. All are ES5-compatible IIFE scripts.
const ALLOWED_FACTORY_FILES = new Set([
  'binary-utils.js',
  'shared-runtime.js',
  'a11y.js',
  'gate-renderer.js',
  'integrity.js',
  'checkpoint.js',
  'frustration.js',
  'completion.js',
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
const ALLOWED_KATEX_FILES = new Set([
  'katex-core.css',
  'katex-fonts.css',
  'katex-symbols-algebra.css',
  'katex-symbols-trig.css',
  'katex-symbols-calculus.css',
  'katex-symbols-physics.css',
  'katex-symbols-sets.css'
]);

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
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

  const candidates = [
    path.join(YAML_DIR, slug + '.yaml'),
    path.join(YAML_DIR, slug, 'index.yaml')
  ];

  for (let i = 0; i < candidates.length; i++) {
    const yamlPath = candidates[i];
    if (!fs.existsSync(yamlPath)) continue;

    // Resolve to absolute path and confirm it's inside YAML_DIR
    const resolved = path.resolve(yamlPath);
    const base     = path.resolve(YAML_DIR);
    if (!resolved.startsWith(base + path.sep)) return null;  // traversal guard

    try {
      const raw        = fs.readFileSync(yamlPath, 'utf8');
      const lessonData = yaml.load(raw);
      const mtime      = fs.statSync(yamlPath).mtimeMs;
      return { lessonData: lessonData, yamlPath: yamlPath, mtime: mtime };
    } catch (err) {
      log.error('YAML parse error', { slug, error: err.message });
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
  const loaded = loadYaml(slug);
  if (!loaded) return null;

  const cached = _lessonCache[slug];
  if (cached && cached.mtime === loaded.mtime) {
    cached.lastAccessed = Date.now();
    if (options.dev) log.debug('Cache hit', { slug });
    return { html: cached.html, sidecar: cached.sidecar };
  }

  // In-flight guard: return existing compilation Promise if one is running
  if (_compilingNow[slug]) {
    if (options.dev) log.debug('Awaiting in-flight compile', { slug });
    return _compilingNow[slug];
  }

  log.info('Compiling', { slug });
  _compilingNow[slug] = _doCompile(slug, loaded, options).finally(function () {
    delete _compilingNow[slug];
  });
  return _compilingNow[slug];
}

/**
 * Internal: perform the actual compilation. Called only by compileLesson()
 * after the in-flight and mtime checks pass.
 * Validates with same OLS schema as CLI and author API before buildIR.
 */
async function _doCompile(slug, loaded, options) {

  const validation = lessonSchema.validateLessonData(loaded.lessonData);
  if (!validation.valid) {
    throw new Error('Lesson validation failed: ' + validation.errors.join('; '));
  }

  const ir      = await buildLessonIR(loaded.lessonData, options);
  const sidecar = buildLessonSidecar(ir);

  // Build factory dependency list (same logic as html.js Step 6)
  const RUNTIME_VERSION = '1.9.0';
  const factoryDeps     = [{ file: 'binary-utils.js', version: RUNTIME_VERSION }, { file: 'shared-runtime.js', version: RUNTIME_VERSION }];
  const manifest        = (ir.inferredFeatures && ir.inferredFeatures.factoryManifest) || [];
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
  const runtimeDir      = path.join(__dirname, '../src/runtime');
  const factoryLoaderJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'factory-loader.js'), 'utf8');
  const playerJs        = fs.readFileSync(resolveFactoryPath(runtimeDir, 'player.js'),         'utf8');
  const styles          = fs.readFileSync(path.join(runtimeDir, 'style.css'),          'utf8');

  // Serialize and sign with canonical JSON for cross-platform consistency [R10 P1.5]
  const canonicalData = canonicalJSON(ir);
  const signature     = signContent(canonicalData, options.deviceId, options.privateKey);
  const lessonScript = lessonAssembly.buildLessonScript(ir, {
    signature:       signature,
    publicKeySpki:   options.publicKeySpki != null ? options.publicKeySpki : '',
    deviceId:        options.deviceId || '',
    factoryLoaderJs: factoryLoaderJs,
    playerJs:        playerJs
  });

  // Generate a per-request nonce for the CSP <meta> tag.
  // LESSON_DATA changes every compilation so a hash would have to be
  // recomputed per request — a nonce is equivalent and simpler here.
  const nonce = generateNonce();
  const html = _buildPwaShell(ir, styles, lessonScript, nonce);

  var isUpdate = !!_lessonCache[slug];

  // LRU eviction: if cache is full and this is a new entry, evict oldest
  if (!isUpdate && _cacheSize >= MAX_CACHE_ENTRIES) {
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
      log.debug('Cache evicted', { slug: oldestSlug });
    }
  }

  _lessonCache[slug] = {
    html:         html,
    sidecar:      sidecar,
    mtime:        loaded.mtime,
    lastAccessed: Date.now()
  };
  if (!isUpdate) _cacheSize++;

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
  const lang    = _escapeHtml((ir.meta && ir.meta.language) || 'en');
  const title   = _escapeHtml((ir.meta && ir.meta.title)    || 'AGNI Lesson');
  const cspMeta = buildCspMeta(nonce);
  // nonce value embedded in the script tag must not be HTML-escaped —
  // only the CSP meta content attribute needs escaping (done inside buildCspMeta).
  const nonceAttr = ' nonce="' + nonce + '"';

  return [
    '<!DOCTYPE html>',
    '<html lang="' + lang + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta name="theme-color" content="#F4F1E8">',
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

/**
 * Async gzip helper — avoids blocking the event loop on Pi. [R10 P3.7]
 */
function _gzip(buf, cb) {
  zlib.gzip(buf, cb);
}

/**
 * Send a text/HTML or text/plain response, gzipped if accepted.
 */
function _sendText(req, res, statusCode, contentType, body) {
  const buf = Buffer.from(body, 'utf8');
  res.setHeader('Access-Control-Allow-Origin', envConfig.corsOrigin || 'null');
  res.setHeader('Content-Type', contentType);

  if (req.headers['accept-encoding'] &&
      req.headers['accept-encoding'].indexOf('gzip') !== -1 &&
      buf.length > 1024) {
    _gzip(buf, function (err, compressed) {
      if (err) {
        res.writeHead(statusCode);
        res.end(buf);
      } else {
        res.setHeader('Content-Encoding', 'gzip');
        res.writeHead(statusCode);
        res.end(compressed);
      }
    });
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
  var buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (_e) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', envConfig.corsOrigin || 'null');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=' + (maxAge || 0));

  if (req.headers['accept-encoding'] &&
      req.headers['accept-encoding'].indexOf('gzip') !== -1 &&
      buf.length > 1024) {
    _gzip(buf, function (err, compressed) {
      if (err) {
        res.writeHead(200);
        res.end(buf);
      } else {
        res.setHeader('Content-Encoding', 'gzip');
        res.writeHead(200);
        res.end(compressed);
      }
    });
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
  const urlPath = req.url.split('?')[0];

  // GET /lessons/:slug — compile YAML on demand and stream lesson HTML
  const lessonMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)$/);
  if (req.method === 'GET' && lessonMatch) {
    const slug = lessonMatch[1];
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
      log.error('Compile error', { slug, error: err.message });
      _sendText(req, res, 500, 'text/html; charset=utf-8',
        '<h1>Compilation error</h1><pre>' + _escapeHtml(err.message) + '</pre>');
    });
    return true;
  }

  // GET /lessons/:slug/sidecar — serve lesson IR sidecar for theta engine
  const sidecarMatch = urlPath.match(/^\/lessons\/([a-zA-Z0-9_\-/]+)\/sidecar$/);
  if (req.method === 'GET' && sidecarMatch) {
    const sidecarSlug = sidecarMatch[1];
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
  const factoryMatch = urlPath.match(/^\/factories\/(.+)$/);
  if (req.method === 'GET' && factoryMatch) {
    const factoryFile = path.basename(factoryMatch[1]);  // basename strips any ../ attempts
    if (!ALLOWED_FACTORY_FILES.has(factoryFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const factoryPath = resolveFactoryPath(FACTORY_DIR, factoryFile);
    // Long cache: 7 days. Version string in factory-loader cache key forces
    // refresh when RUNTIME_VERSION bumps, so stale-while-revalidate is safe.
    _sendFile(req, res, factoryPath, MIME['.js'], 604800);
    return true;
  }

  // GET /katex/:file — serve a KaTeX CSS subset file.
  const katexMatch = urlPath.match(/^\/katex\/(.+)$/);
  if (req.method === 'GET' && katexMatch) {
    const katexFile = path.basename(katexMatch[1]);
    if (!ALLOWED_KATEX_FILES.has(katexFile)) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    const katexPath = path.join(KATEX_DIR, katexFile);
    // Long cache: 30 days. KaTeX CSS changes only with KaTeX version bumps.
    _sendFile(req, res, katexPath, MIME['.css'], 2592000);
    return true;
  }

  // GET /manifest.json — PWA manifest
  if (req.method === 'GET' && urlPath === '/manifest.json') {
    const manifestPath = path.join(__dirname, 'manifest.json');
    _sendFile(req, res, manifestPath, MIME['.json'], 86400);
    return true;
  }

  // GET /sw.js — Service Worker
  if (req.method === 'GET' && urlPath === '/sw.js') {
    const swPath = path.join(__dirname, 'sw.js');
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
  const listeners = server.listeners('request').slice();
  server.removeAllListeners('request');

  server.on('request', function (req, res) {
    const handled = handleRequest(req, res, options || {});
    if (!handled) {
      // Fall through to original theta.js handler
      for (let i = 0; i < listeners.length; i++) {
        listeners[i].call(server, req, res);
      }
    }
  });

  log.info('Routes attached — serving /lessons/, /factories/, /katex/');
}

/**
 * Run hub-transform as a standalone server (alternative to attaching to theta.js).
 * Useful for testing or when running hub-transform on a separate process/port.
 */
function startStandalone(options) {
  const http = require('http');
  const server = http.createServer(function (req, res) {
    const handled = handleRequest(req, res, options || {});
    if (!handled) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  server.listen(SERVE_PORT, '0.0.0.0', function () {
    log.info('Standalone server listening', { port: SERVE_PORT });
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
