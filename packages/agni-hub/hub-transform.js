// packages/agni-hub/hub-transform.js
// AGNI Hub Transform  v1.0.0
//
// On-demand lesson delivery server. Transforms YAML source into compiled
// lesson HTML at request time and serves it directly to the device browser.
// Also serves factory files, KaTeX CSS, and static runtime assets from the
// hub's /factories/ endpoint so factory-loader.js can fetch and cache them.
//
// Responsibilities:
//   GET /lessons/:slug        ΓÇö compile YAML ΓåÆ HTML, stream to device
//   GET /factories/:file      ΓÇö serve cached runtime asset (factory files,
//                               shared-runtime.js, sensor-bridge.js, etc.)
//   GET /katex/:file          ΓÇö serve KaTeX CSS subset files
//   GET /manifest.json        ΓÇö PWA manifest
//   GET /sw.js                ΓÇö Service Worker
//
// Integration with theta.js:
//   hub-transform.js exports an attachRoutes(server) function that adds
//   the above routes to the existing theta.js http.Server instance.
//   Alternatively it can run standalone on AGNI_SERVE_PORT (default 8083).
//
//   In theta.js startApi(), add:
//     require('./hub-transform').attachRoutes(server);
//
// YAML source lookup:
//   Lessons are located by slug under YAML_DIR (default: data/yaml/).
//   Slug ΓåÆ file: <YAML_DIR>/<slug>.yaml or <YAML_DIR>/<slug>/index.yaml
//
// Caching strategy:
//   Compiled lesson HTML is cached in memory keyed to slug + YAML mtime.
//   A changed YAML file invalidates only that lesson's cache entry.
//   Factory files are static ΓÇö served with long Cache-Control headers.
//   Lesson HTML is served with no-cache so devices always get the current
//   compiled version (the device-side Cache API handles factory caching).
//
// Target: Node.js 14+. Runs on the Village Hub only.
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

'use strict';

const path = require('path');
const { loadHubConfig } = require('@agni/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));

const fs      = require('fs');
const zlib    = require('zlib');

const { createLogger }   = require('@agni/utils/logger');
const log                = createLogger('hub-transform');
const compilerService     = require('@ols/compiler/services/compiler');
const buildLessonIrModule = require('@ols/compiler/compiler/build-lesson-ir');
const buildLessonIR      = buildLessonIrModule.buildLessonIR;
const buildLessonSidecar = buildLessonIrModule.buildLessonSidecar;
const buildKatexCss      = require('@agni/utils/katex-css-builder');
const lessonSchema       = require('@ols/schema/lesson-schema');
const { signContent, canonicalJSON } = require('@agni/utils/crypto');
const generateNonce      = require('@agni/utils/csp').generateNonce;
const buildCspMeta       = require('@agni/utils/csp').buildCspMeta;
const lessonAssembly     = require('@ols/compiler/services/lesson-assembly');
const _escapeHtml        = require('@agni/utils/io').escapeHtml;
const { resolveFactoryPath } = require('@agni/utils/runtimeManifest');
const lessonChain        = require('@agni/services/lesson-chain');

// ΓöÇΓöÇ Version (from package.json, used for SW stamping) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const PKG_VERSION   = require('../../package.json').version || '0.0.0';

// ΓöÇΓöÇ Paths (from centralized config) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const envConfig     = require('@agni/utils/env-config');
const YAML_DIR      = envConfig.yamlDir;
const FACTORY_DIR   = process.env.AGNI_FACTORY_DIR || require('@agni/runtime').RUNTIME_ROOT;
const KATEX_DIR     = process.env.AGNI_KATEX_DIR   || path.join(__dirname, '../../data/katex-css');
const SERVE_PORT    = envConfig.servePort;

// ΓöÇΓöÇ In-memory lesson cache ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// { slug: { html: string, sidecar: object, mtime: number, lastAccessed: number } }
//
// MAX_CACHE_ENTRIES caps memory usage on long-running Pi processes.
// LRU eviction: when the cache is full, the entry with the oldest
// lastAccessed timestamp is removed before the new one is inserted.
// Each compiled lesson HTML is roughly 50ΓÇô500KB. At 100 entries that
// is 5ΓÇô50MB worst case, acceptable on a Pi with 1ΓÇô2GB RAM.
const _lessonCache   = {};
let _cacheSize       = 0;
const MAX_CACHE_ENTRIES = parseInt(process.env.AGNI_CACHE_MAX || '100', 10);
const MAX_CONCURRENT_COMPILES = parseInt(process.env.AGNI_COMPILE_CONCURRENCY || '3', 10);
let _compileSlots = MAX_CONCURRENT_COMPILES;
const _compileQueue = [];

// ΓöÇΓöÇ Per-slug in-flight compilation guard ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Prevents concurrent requests for the same slug from each triggering a
// full buildLessonIR() call ΓÇö a CPU DoS vector on a Pi when many devices
// request the same lesson simultaneously (e.g. class starting together).
// When a compilation is already in flight for a slug, subsequent requests
// await the same Promise rather than starting a new one.
const _compilingNow  = {};

// ΓöÇΓöÇ Shell HTML template cache ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// shell.html is read once on first request and cached in memory. The file
// is ~500 bytes and never changes at runtime; re-reading from SD card on
// every /shell/:slug request would block the event loop on Pi.
const SHELL_PLACEHOLDER = '<script src="/lesson-data.js"></script>';
let _shellTemplate = null;

// ΓöÇΓöÇ Allowed factory files ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Whitelist prevents directory traversal. Only files in this set can be
// served from /factories/. All are ES5-compatible IIFE scripts.
const ALLOWED_FACTORY_FILES = new Set([
  'polyfills.js',
  'binary-utils.js',
  'shared-runtime.js',
  'a11y.js',
  'narration.js',
  'gate-renderer.js',
  'integrity.js',
  'checkpoint.js',
  'frustration.js',
  'completion.js',
  'sensor-bridge.js',
  'svg-stage.js',
  'svg-helpers.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js',
  'factory-loader.js'
]);

// ΓöÇΓöÇ Allowed KaTeX CSS files ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const ALLOWED_KATEX_FILES = new Set([
  'katex-core.css',
  'katex-fonts.css',
  'katex-symbols-algebra.css',
  'katex-symbols-trig.css',
  'katex-symbols-calculus.css',
  'katex-symbols-physics.css',
  'katex-symbols-sets.css'
]);

// ΓöÇΓöÇ MIME types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const MIME = {
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};


// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// Compile concurrency (Pi memory)
function _acquireCompileSlot() {
  if (_compileSlots > 0) { _compileSlots--; return Promise.resolve(); }
  return new Promise(function (r) { _compileQueue.push(r); });
}
function _releaseCompileSlot() {
  if (_compileQueue.length > 0) _compileQueue.shift()();
  else _compileSlots++;
}
// YAML loader
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
      const stat = fs.statSync(yamlPath);
      const maxBytes = (envConfig.yamlMaxBytes != null) ? envConfig.yamlMaxBytes : (2 * 1024 * 1024);
      if (stat.size > maxBytes) {
        log.warn('YAML exceeds max size', { slug, size: stat.size, max: maxBytes });
        return null;
      }
      const raw        = fs.readFileSync(yamlPath, 'utf8');
      const lessonData = compilerService.safeYamlLoad(raw, { maxBytes: maxBytes });
      const claimed = (lessonData.meta && lessonData.meta.content_hash) || '';
      if (claimed && process.env.AGNI_VERIFY_YAML_HASH === '1') {
        const v = lessonChain.verifyContentHash(lessonData);
        if (!v.valid) {
          log.warn('YAML content_hash mismatch', { slug, claimed: v.claimed, computed: v.computed });
          return null;
        }
      }
      const mtime = stat.mtimeMs;
      return { lessonData: lessonData, yamlPath: yamlPath, mtime: mtime };
    } catch (err) {
      log.error('YAML parse error', { slug, error: err.message });
      return null;
    }
  }

  return null;
}


// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// Lesson compiler
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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
    return { html: cached.html, sidecar: cached.sidecar, lessonIR: cached.lessonIR };
  }

  // In-flight guard: return existing compilation Promise if one is running
  if (_compilingNow[slug]) {
    if (options.dev) log.debug('Awaiting in-flight compile', { slug });
    return _compilingNow[slug];
  }

  function runCompile() {
    return _acquireCompileSlot().then(function () {
      return _doCompile(slug, loaded, options);
    }).finally(function () {
      _releaseCompileSlot();
    });
  }
  log.info('Compiling', { slug });
  _compilingNow[slug] = runCompile()
    .catch(function (err) {
      const stale = _lessonCache[slug];
      if (stale) {
        log.warn('Compilation failed, serving last successful cached artifact', { slug, error: err.message });
        return { html: stale.html, sidecar: stale.sidecar, lessonIR: stale.lessonIR };
      }
      throw err;
    })
    .finally(function () {
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
  const RUNTIME_VERSION = require('../../package.json').version;
  const factoryDeps     = [{ file: 'polyfills.js', version: RUNTIME_VERSION }, { file: 'binary-utils.js', version: RUNTIME_VERSION }, { file: 'shared-runtime.js', version: RUNTIME_VERSION }, { file: 'integrity.js', version: RUNTIME_VERSION }];
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
  const runtimeDir      = require('@agni/runtime').RUNTIME_ROOT;
  const factoryLoaderJs = fs.readFileSync(resolveFactoryPath(runtimeDir, 'factory-loader.js'), 'utf8');
  const playerJs        = fs.readFileSync(resolveFactoryPath(runtimeDir, 'player.js'),         'utf8');
  const styles          = fs.readFileSync(path.join(runtimeDir, 'style.css'),          'utf8');

  // Serialize and sign with canonical JSON for cross-platform consistency [R10 P1.5]
  const canonicalData = canonicalJSON(ir);
  const signature     = signContent(canonicalData, options.deviceId, options.privateKey);
  // Generate a per-request nonce for the CSP <meta> tag.
  // LESSON_DATA changes every compilation so a hash would have to be
  // recomputed per request — a nonce is equivalent and simpler here.
  const nonce = generateNonce();
  const nonceBootstrap = 'window.AGNI_CSP_NONCE=' + JSON.stringify(nonce) + ';';
  const lessonScript = nonceBootstrap + '\n' + lessonAssembly.buildLessonScript(ir, {
    signature:       signature,
    publicKeySpki:   options.publicKeySpki != null ? options.publicKeySpki : '',
    deviceId:        options.deviceId || '',
    factoryLoaderJs: factoryLoaderJs,
    playerJs:        playerJs
  });
  const html = _buildPwaShell(ir, styles, lessonScript, nonce);

  const isUpdate = !!_lessonCache[slug];

  // LRU eviction: if cache is full and this is a new entry, evict oldest
  if (!isUpdate && _cacheSize >= MAX_CACHE_ENTRIES) {
    let oldestSlug = null;
    let oldestTime = Infinity;
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
    lessonIR:     ir,
    mtime:        loaded.mtime,
    lastAccessed: Date.now()
  };
  if (!isUpdate) _cacheSize++;

  return { html: html, sidecar: sidecar, lessonIR: ir };
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
  // nonce value embedded in the script tag must not be HTML-escaped ΓÇö
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


// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// Response helpers
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

/**
 * Async gzip helper ΓÇö avoids blocking the event loop on Pi. [R10 P3.7]
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
  if (contentType.indexOf('html') !== -1) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; worker-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

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
  fs.readFile(filePath, function (err, buf) {
    if (err) {
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
      _gzip(buf, function (gzipErr, compressed) {
        if (gzipErr) {
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
  });
}


// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// Route handler
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ

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

  // GET /shell/:slug ΓÇö serve the PWA shell with the lesson slug injected into
  // the lesson-data.js script tag. The template is read once and cached; only
  // the slug query parameter differs per request.
  const shellMatch = urlPath.match(/^\/shell\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && shellMatch) {
    const shellSlug = shellMatch[1];
    try {
      if (_shellTemplate === null) {
        _shellTemplate = fs.readFileSync(path.join(__dirname, 'pwa', 'shell.html'), 'utf8');
        if (_shellTemplate.indexOf(SHELL_PLACEHOLDER) === -1) {
          throw new Error('shell.html is missing the lesson-data.js placeholder script tag');
        }
      }
      const shellHtml = _shellTemplate.replace(
        SHELL_PLACEHOLDER,
        '<script src="/lesson-data.js?slug=' + encodeURIComponent(shellSlug) + '"></script>'
      );
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      _sendText(req, res, 200, 'text/html; charset=utf-8', shellHtml);
    } catch (err) {
      _sendText(req, res, 500, 'text/html; charset=utf-8',
        '<h1>Shell error</h1><pre>' + _escapeHtml(err.message) + '</pre>');
    }
    return true;
  }

  // GET /lessons/:slug/sidecar ΓÇö must be checked BEFORE the lesson HTML route
  // because the HTML route's slug regex includes '/' and would greedily match
  // "smoke-test/sidecar" as a slug, stealing the request.
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

  // GET /lessons/:slug ΓÇö compile YAML on demand and stream lesson HTML
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
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      _sendText(req, res, 200, 'text/html; charset=utf-8', result.html);
    }).catch(function (err) {
      log.error('Compile error', { slug, error: err.message });
      _sendText(req, res, 500, 'text/html; charset=utf-8',
        '<h1>Compilation error</h1><pre>' + _escapeHtml(err.message) + '</pre>');
    });
    return true;
  }

  // GET /factories/:file ΓÇö serve a runtime factory file with long cache headers.
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

  // GET /katex/:file ΓÇö serve a KaTeX CSS subset file.
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

  // GET /manifest.json ΓÇö PWA manifest
  if (req.method === 'GET' && urlPath === '/manifest.json') {
    const manifestPath = path.join(__dirname, 'manifest.json');
    _sendFile(req, res, manifestPath, MIME['.json'], 86400);
    return true;
  }

  // GET /sw.js ΓÇö Service Worker (version stamped from package.json)
  if (req.method === 'GET' && urlPath === '/sw.js') {
    const swPath = path.join(__dirname, 'sw.js');
    try {
      const raw = fs.readFileSync(swPath, 'utf8');
      const stamped = raw.replace('__SW_VERSION__', PKG_VERSION);
      res.setHeader('Cache-Control', 'no-cache');
      _sendText(req, res, 200, MIME['.js'], stamped);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return true;
  }

  // GET /shared.js ΓÇö PWA shared runtime helpers
  if (req.method === 'GET' && urlPath === '/shared.js') {
    _sendFile(req, res, path.join(__dirname, 'pwa', 'shared.js'), MIME['.js'], 86400);
    return true;
  }

  // GET /shell-boot.js ΓÇö PWA shell boot script
  if (req.method === 'GET' && urlPath === '/shell-boot.js') {
    _sendFile(req, res, path.join(__dirname, 'pwa', 'shell-boot.js'), MIME['.js'], 86400);
    return true;
  }

  // GET /precache.js ΓÇö opportunistic lesson precache orchestrator
  if (req.method === 'GET' && urlPath === '/precache.js') {
    _sendFile(req, res, path.join(__dirname, 'pwa', 'precache.js'), MIME['.js'], 86400);
    return true;
  }

  // GET /factory-loader.js ΓÇö factory loader for PWA shell
  if (req.method === 'GET' && urlPath === '/factory-loader.js') {
    const loaderPath = resolveFactoryPath(FACTORY_DIR, 'factory-loader.js');
    _sendFile(req, res, loaderPath, MIME['.js'], 86400);
    return true;
  }

  // GET /lesson-data.js ΓÇö serves lesson data as a script for the PWA shell.
  // Accepts ?slug=<slug> query parameter, compiles the lesson, and returns
  // a JS file that sets window.LESSON_DATA.
  const lessonDataMatch = (req.method === 'GET' && urlPath === '/lesson-data.js');
  if (lessonDataMatch) {
    const qs = require('querystring');
    const query = qs.parse((req.url.split('?')[1]) || '');
    const slug = query.slug;
    if (!slug) {
      _sendText(req, res, 200, MIME['.js'],
        'var LESSON_DATA = null; /* no slug provided */');
      return true;
    }
    compileLesson(slug, options || {}).then(function (result) {
      if (!result) {
        _sendText(req, res, 200, MIME['.js'],
          'var LESSON_DATA = null; /* lesson not found: ' + _escapeHtml(slug) + ' */');
        return;
      }
      _sendText(req, res, 200, MIME['.js'],
        'var LESSON_DATA = ' + JSON.stringify(result.lessonIR) + ';');
    }).catch(function (err) {
      _sendText(req, res, 200, MIME['.js'],
        'var LESSON_DATA = null; /* error: ' + _escapeHtml(err.message) + ' */');
    });
    return true;
  }

  return false;  // not handled ΓÇö fall through to theta.js routes
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

  log.info('Routes attached ΓÇö serving /lessons/, /factories/, /katex/');
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
