'use strict';

/**
 * hub-transform/cache.js
 * Disk and in-memory lesson cache, compile slot management, in-flight guard.
 * DoS mitigation: LRU eviction, concurrency cap, 202/Retry-After on queue overflow.
 */

var fs   = require('fs');
var path = require('path');

var envConfig = require('@agni/utils/env-config');
var buildLessonSidecar = require('@ols/compiler/compiler/build-lesson-ir').buildLessonSidecar;
var createLogger = require('@agni/utils/logger').createLogger;

var log = createLogger('hub-transform:cache');
var SERVE_DIR = envConfig.serveDir;

var _lessonCache = {};
var _cacheSize = 0;
var MAX_CACHE_ENTRIES = parseInt(process.env.AGNI_CACHE_MAX || '100', 10);
var MAX_CONCURRENT_COMPILES = parseInt(process.env.AGNI_COMPILE_CONCURRENCY || '3', 10);
var _compileSlots = MAX_CONCURRENT_COMPILES;
var _compileQueue = [];
var _compilingNow = {};
var RETRY_AFTER_SECONDS = parseInt(process.env.AGNI_COMPILE_RETRY_AFTER || '3', 10);

function getDiskCachePaths(slug) {
  var lessonsRoot = path.join(SERVE_DIR, 'lessons');
  var lessonDir = path.join(lessonsRoot, slug);
  var tmpDir = path.join(lessonsRoot, slug + '.tmp.' + process.pid + '.' + Date.now());
  return {
    lessonDir: lessonDir,
    tmpDir: tmpDir,
    htmlPath: path.join(lessonDir, 'index.html'),
    irPath: path.join(lessonDir, 'index-ir.json'),
    fullIrPath: path.join(lessonDir, 'index-ir-full.json')
  };
}

function tryReadDiskCache(slug, yamlMtime) {
  var paths = getDiskCachePaths(slug);
  try {
    var htmlStat = fs.statSync(paths.htmlPath);
    if (htmlStat.mtimeMs < yamlMtime) return null;
    var html = fs.readFileSync(paths.htmlPath, 'utf8');
    var irRaw = fs.readFileSync(paths.fullIrPath, 'utf8');
    var ir = JSON.parse(irRaw);
    if (!ir || typeof ir !== 'object' || !ir.steps) return null;
    var sidecar = buildLessonSidecar(ir);
    return { html: html, sidecar: sidecar, ir: ir };
  } catch (e) {
    return null;
  }
}

function writeDiskCache(slug, html, ir) {
  var paths = getDiskCachePaths(slug);
  try {
    fs.mkdirSync(paths.tmpDir, { recursive: true });
    var tmpHtml = path.join(paths.tmpDir, 'index.html');
    var tmpIr = path.join(paths.tmpDir, 'index-ir.json');
    var tmpFullIr = path.join(paths.tmpDir, 'index-ir-full.json');
    fs.writeFileSync(tmpHtml, html, 'utf8');
    fs.writeFileSync(tmpIr, JSON.stringify(buildLessonSidecar(ir), null, 0), 'utf8');
    fs.writeFileSync(tmpFullIr, JSON.stringify(ir, null, 0), 'utf8');
    var fdHtml = fs.openSync(tmpHtml, 'r');
    var fdIr = fs.openSync(tmpIr, 'r');
    var fdFull = fs.openSync(tmpFullIr, 'r');
    fs.fsyncSync(fdHtml);
    fs.fsyncSync(fdIr);
    fs.fsyncSync(fdFull);
    fs.closeSync(fdHtml);
    fs.closeSync(fdIr);
    fs.closeSync(fdFull);
    if (fs.existsSync(paths.lessonDir)) {
      fs.rmSync(paths.lessonDir, { recursive: true });
    }
    fs.renameSync(paths.tmpDir, paths.lessonDir);
    var lessonsRoot = path.dirname(paths.lessonDir);
    try {
      var parentFd = fs.openSync(lessonsRoot, 'r');
      try { fs.fsyncSync(parentFd); } finally { fs.closeSync(parentFd); }
    } catch (err) { log.warn('Parent directory fsync failed', { lessonsRoot: lessonsRoot, error: err.message }); }
  } catch (err) {
    try {
      if (fs.existsSync(paths.tmpDir)) fs.rmSync(paths.tmpDir, { recursive: true });
    } catch (e) { void e; }
    log.warn('Disk cache write failed', { slug: slug, error: err.message });
  }
}

function acquireCompileSlot() {
  if (_compileSlots > 0) { _compileSlots--; return Promise.resolve(); }
  return new Promise(function (r) { _compileQueue.push(r); });
}

function releaseCompileSlot() {
  if (_compileQueue.length > 0) _compileQueue.shift()();
  else _compileSlots++;
}

function wouldCompileBeQueued(slug) {
  if (_compilingNow[slug]) return false;
  return _compileSlots === 0;
}

function evictOldest() {
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
    return oldestSlug;
  }
  return null;
}

function getLessonCache() { return _lessonCache; }
function getCacheSize() { return _cacheSize; }
function setCacheSize(n) { _cacheSize = n; }
function getMaxCacheEntries() { return MAX_CACHE_ENTRIES; }
function getCompilingNow() { return _compilingNow; }
function getRetryAfterSeconds() { return RETRY_AFTER_SECONDS; }

module.exports = {
  tryReadDiskCache:    tryReadDiskCache,
  writeDiskCache:      writeDiskCache,
  acquireCompileSlot:  acquireCompileSlot,
  releaseCompileSlot:  releaseCompileSlot,
  wouldCompileBeQueued: wouldCompileBeQueued,
  evictOldest:         evictOldest,
  getLessonCache:      getLessonCache,
  getCacheSize:        getCacheSize,
  setCacheSize:        setCacheSize,
  getMaxCacheEntries:  getMaxCacheEntries,
  getCompilingNow:     getCompilingNow,
  getRetryAfterSeconds: getRetryAfterSeconds
};
