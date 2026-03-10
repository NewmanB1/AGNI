'use strict';

/**
 * hub-transform/compile.js
 * YAML loading, IR compilation, factory deps, in-flight guard orchestration.
 */

var fs   = require('fs');
var path = require('path');

var envConfig = require('@agni/utils/env-config');
var compilerService = require('@ols/compiler/services/compiler');
var buildLessonIrModule = require('@ols/compiler/compiler/build-lesson-ir');
var buildLessonIR  = buildLessonIrModule.buildLessonIR;
var buildLessonSidecar = buildLessonIrModule.buildLessonSidecar;
var buildKatexCss  = require('@agni/utils/katex-css-builder');
var lessonSchema   = require('@ols/schema/lesson-schema');
var { computeSRI } = require('@agni/utils/crypto');
var { resolveFactoryPath } = require('@agni/utils/runtimeManifest');
var lessonChain   = require('@agni/services/lesson-chain');
var createLogger  = require('@agni/utils/logger').createLogger;

var cache   = require('./cache');
var assemble = require('./assemble');
var constants = require('./constants');

var log = createLogger('hub-transform');
var YAML_DIR  = envConfig.yamlDir;
var FACTORY_DIR = process.env.AGNI_FACTORY_DIR || require('@agni/runtime').RUNTIME_ROOT;
var KATEX_DIR  = process.env.AGNI_KATEX_DIR || path.join(path.dirname(path.dirname(__dirname)), '../../data/katex-css');
var RUNTIME_VERSION = constants.RUNTIME_VERSION;
var BASE_FACTORY_DEPS = constants.BASE_FACTORY_DEPS;

/**
 * Locate and parse a YAML lesson file by slug.
 * @param  {string} slug
 * @returns {{ lessonData: object, yamlPath: string, mtime: number } | null}
 */
function loadYaml(slug) {
  if (!/^[a-zA-Z0-9_\-/]+$/.test(slug)) return null;

  var candidates = [
    path.join(YAML_DIR, slug + '.yaml'),
    path.join(YAML_DIR, slug, 'index.yaml')
  ];

  for (var i = 0; i < candidates.length; i++) {
    var yamlPath = candidates[i];
    if (!fs.existsSync(yamlPath)) continue;

    var resolved = path.resolve(yamlPath);
    var base = path.resolve(YAML_DIR);
    if (resolved.indexOf(base + path.sep) !== 0) return null;

    try {
      var stat = fs.statSync(yamlPath);
      var maxBytes = (envConfig.yamlMaxBytes != null) ? envConfig.yamlMaxBytes : (2 * 1024 * 1024);
      if (stat.size > maxBytes) {
        log.warn('YAML exceeds max size', { slug: slug, size: stat.size, max: maxBytes });
        return null;
      }
      var raw = fs.readFileSync(yamlPath, 'utf8');
      var lessonData = compilerService.safeYamlLoad(raw, { maxBytes: maxBytes });
      var claimed = (lessonData.meta && lessonData.meta.content_hash) || '';
      if (claimed && process.env.AGNI_VERIFY_YAML_HASH === '1') {
        var v = lessonChain.verifyContentHash(lessonData);
        if (!v.valid) {
          log.warn('YAML content_hash mismatch', { slug: slug, claimed: v.claimed, computed: v.computed });
          return null;
        }
      }
      var mtime = stat.mtimeMs;
      return { lessonData: lessonData, yamlPath: yamlPath, mtime: mtime };
    } catch (err) {
      log.error('YAML parse error', { slug: slug, error: err.message });
      return null;
    }
  }

  return null;
}

/**
 * Internal: perform the actual compilation. Returns { ir, sidecar } only.
 */
async function doCompile(slug, loaded) {
  var validation = lessonSchema.validateLessonData(loaded.lessonData);
  if (!validation.valid) {
    throw new Error('Lesson validation failed: ' + validation.errors.join('; '));
  }

  var ir = await buildLessonIR(loaded.lessonData, { dev: false });
  var sidecar = buildLessonSidecar(ir);

  var factoryDeps = BASE_FACTORY_DEPS.map(function (d) {
    return { file: d.file, version: RUNTIME_VERSION };
  });
  var manifest = (ir.inferredFeatures && ir.inferredFeatures.factoryManifest) || [];
  manifest.forEach(function (filename) {
    factoryDeps.push({ file: filename, version: RUNTIME_VERSION });
  });
  factoryDeps.forEach(function (dep) {
    try {
      var srcPath = resolveFactoryPath(FACTORY_DIR, dep.file);
      if (fs.existsSync(srcPath)) {
        dep.integrity = computeSRI(fs.readFileSync(srcPath, 'utf8'));
      }
    } catch (e) {
      log.warn('Could not compute SRI for ' + dep.file + ': ' + (e && e.message));
    }
  });
  ir.requires = { factories: factoryDeps };
  ir._runtimeVersion = RUNTIME_VERSION;

  if (ir.inferredFeatures.katexAssets.length > 0) {
    if (!fs.existsSync(KATEX_DIR)) fs.mkdirSync(KATEX_DIR, { recursive: true });
    buildKatexCss.buildKatexCss(ir.inferredFeatures.katexAssets, KATEX_DIR);
  }

  var _lessonCache = cache.getLessonCache();
  var _cacheSize = cache.getCacheSize();
  var MAX_CACHE_ENTRIES = cache.getMaxCacheEntries();
  var isUpdate = !!_lessonCache[slug];

  if (!isUpdate && _cacheSize >= MAX_CACHE_ENTRIES) {
    var evicted = cache.evictOldest();
    if (evicted) log.debug('Cache evicted', { slug: evicted });
  }

  _lessonCache[slug] = {
    ir: ir,
    sidecar: sidecar,
    mtime: loaded.mtime,
    lastAccessed: Date.now()
  };
  cache.setCacheSize(_cacheSize + (isUpdate ? 0 : 1));

  cache.writeDiskCache(slug, assemble.assembleHtml(ir, {}), ir);
  return { ir: ir, sidecar: sidecar, lessonIR: ir };
}

/**
 * Compile a lesson YAML into IR and sidecar.
 * @param  {string} slug
 * @param  {object} options   { deviceId, privateKey, dev }
 * @returns {Promise<{ ir: object, sidecar: object, lessonIR: object } | null>}
 */
async function compileLesson(slug, options) {
  var loaded = loadYaml(slug);
  if (!loaded) return null;

  var disk = cache.tryReadDiskCache(slug, loaded.mtime);
  if (disk) {
    if (options.dev) log.debug('Disk cache hit', { slug: slug });
    var _lessonCache = cache.getLessonCache();
    if (!_lessonCache[slug]) {
      if (cache.getCacheSize() >= cache.getMaxCacheEntries()) {
        cache.evictOldest();
      }
      _lessonCache[slug] = { ir: disk.ir, sidecar: disk.sidecar, mtime: loaded.mtime, lastAccessed: Date.now() };
      cache.setCacheSize(cache.getCacheSize() + 1);
    } else {
      _lessonCache[slug].lastAccessed = Date.now();
    }
    return { ir: disk.ir, sidecar: disk.sidecar, lessonIR: disk.ir };
  }

  var _lessonCache = cache.getLessonCache();
  var cached = _lessonCache[slug];
  if (cached && cached.mtime === loaded.mtime) {
    cached.lastAccessed = Date.now();
    if (options.dev) log.debug('Cache hit', { slug: slug });
    return { ir: cached.ir, sidecar: cached.sidecar, lessonIR: cached.ir };
  }

  var _compilingNow = cache.getCompilingNow();
  if (_compilingNow[slug]) {
    if (options.dev) log.debug('Awaiting in-flight compile', { slug: slug });
    return _compilingNow[slug];
  }

  if (cache.wouldCompileBeQueued(slug)) {
    var err = new Error('Compile queue full');
    err.code = 'QUEUED';
    err.retryAfter = cache.getRetryAfterSeconds();
    return Promise.reject(err);
  }

  function runCompile() {
    return cache.acquireCompileSlot().then(function () {
      return doCompile(slug, loaded);
    }).finally(function () {
      cache.releaseCompileSlot();
    });
  }
  log.info('Compiling', { slug: slug });
  _compilingNow[slug] = runCompile()
    .catch(function (err) {
      var stale = _lessonCache[slug];
      if (stale) {
        log.warn('Compilation failed, serving last successful cached artifact', { slug: slug, error: err.message });
        return { ir: stale.ir, sidecar: stale.sidecar, lessonIR: stale.ir };
      }
      throw err;
    })
    .finally(function () {
      delete _compilingNow[slug];
    });
  return _compilingNow[slug];
}

module.exports = {
  loadYaml:     loadYaml,
  compileLesson: compileLesson
};
