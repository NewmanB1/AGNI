'use strict';

/**
 * hub-transform/cache.js
 * Disk and in-memory lesson cache, compile slot management, in-flight guard.
 * DoS mitigation: LRU eviction (by bytes or count), concurrency cap, 202/Retry-After on queue overflow.
 *
 * When AGNI_CACHE_MAX_BYTES is set, eviction is by memory budget (bytes). Otherwise uses
 * AGNI_CACHE_MAX (entry count). Pi deployments should set bytes (e.g. 25e6) to avoid OOM.
 */

const fs   = require('fs');
const path = require('path');

const envConfig = require('@agni/utils/env-config');
const buildLessonSidecar = require('@ols/compiler/compiler/build-lesson-ir').buildLessonSidecar;
const createLogger = require('@agni/utils/logger').createLogger;

const log = createLogger('hub-transform:cache');
const SERVE_DIR = envConfig.serveDir;

const _lessonCache = {};
let _cacheSize = 0;
let _cacheBytes = 0;
const MAX_CACHE_ENTRIES = parseInt(process.env.AGNI_CACHE_MAX || '100', 10);
const MAX_CACHE_BYTES = parseInt(process.env.AGNI_CACHE_MAX_BYTES || '0', 10);
const MAX_CONCURRENT_COMPILES = parseInt(process.env.AGNI_COMPILE_CONCURRENCY || '3', 10);
let _compileSlots = MAX_CONCURRENT_COMPILES;
const _compileQueue = [];
const _compilingNow = {};
const RETRY_AFTER_SECONDS = parseInt(process.env.AGNI_COMPILE_RETRY_AFTER || '3', 10);

function getDiskCachePaths(slug) {
  const lessonsRoot = path.join(SERVE_DIR, 'lessons');
  const lessonDir = path.join(lessonsRoot, slug);
  const tmpDir = path.join(lessonsRoot, slug + '.tmp.' + process.pid + '.' + Date.now());
  return {
    lessonDir: lessonDir,
    tmpDir: tmpDir,
    htmlPath: path.join(lessonDir, 'index.html'),
    irPath: path.join(lessonDir, 'index-ir.json'),
    fullIrPath: path.join(lessonDir, 'index-ir-full.json')
  };
}

/**
 * Validate cached IR structure before use. Catches truncated or corrupted cache.
 * P0 #2: Invalid IR → force recompile.
 * @param {object} ir - Parsed IR from disk
 * @returns {boolean} true if valid
 */
function validateCachedIr(ir) {
  if (!ir || typeof ir !== 'object') return false;
  if (!Array.isArray(ir.steps)) return false;
  for (let i = 0; i < ir.steps.length; i++) {
    const s = ir.steps[i];
    if (!s || typeof s !== 'object' || !s.id || !s.type) return false;
  }
  if (!ir.meta || typeof ir.meta !== 'object') return false;
  if (!ir.inferredFeatures || typeof ir.inferredFeatures !== 'object') return false;
  return true;
}

function tryReadDiskCache(slug, yamlMtime) {
  const paths = getDiskCachePaths(slug);
  try {
    const htmlStat = fs.statSync(paths.htmlPath);
    if (htmlStat.mtimeMs < yamlMtime) return null;
    const html = fs.readFileSync(paths.htmlPath, 'utf8');
    const irRaw = fs.readFileSync(paths.fullIrPath, 'utf8');
    const ir = JSON.parse(irRaw);
    if (!validateCachedIr(ir)) return null;
    const sidecar = buildLessonSidecar(ir);
    return { html: html, sidecar: sidecar, ir: ir };
  } catch {
    return null;
  }
}

function writeDiskCache(slug, html, ir) {
  const paths = getDiskCachePaths(slug);
  try {
    fs.mkdirSync(paths.tmpDir, { recursive: true });
    const tmpHtml = path.join(paths.tmpDir, 'index.html');
    const tmpIr = path.join(paths.tmpDir, 'index-ir.json');
    const tmpFullIr = path.join(paths.tmpDir, 'index-ir-full.json');
    fs.writeFileSync(tmpHtml, html, 'utf8');
    fs.writeFileSync(tmpIr, JSON.stringify(buildLessonSidecar(ir), null, 0), 'utf8');
    fs.writeFileSync(tmpFullIr, JSON.stringify(ir, null, 0), 'utf8');
    const fdHtml = fs.openSync(tmpHtml, 'r');
    const fdIr = fs.openSync(tmpIr, 'r');
    const fdFull = fs.openSync(tmpFullIr, 'r');
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
    const lessonsRoot = path.dirname(paths.lessonDir);
    try {
      const parentFd = fs.openSync(lessonsRoot, 'r');
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

function computeEntryBytes(ir, sidecar) {
  if (!ir || !sidecar) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(ir), 'utf8') + Buffer.byteLength(JSON.stringify(sidecar), 'utf8');
  } catch (_e) {
    return 0;
  }
}

function evictOldest() {
  let oldestSlug = null;
  let oldestTime = Infinity;
  Object.keys(_lessonCache).forEach(function (s) {
    if (_lessonCache[s].lastAccessed < oldestTime) {
      oldestTime = _lessonCache[s].lastAccessed;
      oldestSlug = s;
    }
  });
  if (oldestSlug) {
    const entry = _lessonCache[oldestSlug];
    if (entry && typeof entry.byteSize === 'number') _cacheBytes -= entry.byteSize;
    delete _lessonCache[oldestSlug];
    _cacheSize--;
    return oldestSlug;
  }
  return null;
}

/**
 * Evict oldest entries until there is room for byteSize bytes.
 * When MAX_CACHE_BYTES is 0, uses count-based logic (room for one more entry).
 * @param {number} byteSize   bytes we want to add
 * @param {number} [oldByteSize]  bytes of existing entry we're replacing (0 for new)
 */
function ensureRoomFor(byteSize, oldByteSize) {
  oldByteSize = oldByteSize || 0;
  if (MAX_CACHE_BYTES > 0) {
    let budgetAfter = _cacheBytes - oldByteSize + byteSize;
    while (budgetAfter > MAX_CACHE_BYTES) {
      const evicted = evictOldest();
      if (!evicted) break;
      budgetAfter = _cacheBytes - oldByteSize + byteSize;
      log.debug('Evicted for byte budget', { slug: evicted, bytesNow: _cacheBytes });
    }
  } else {
    const limit = oldByteSize > 0 ? MAX_CACHE_ENTRIES : MAX_CACHE_ENTRIES - 1;
    while (_cacheSize > limit) {
      const evicted = evictOldest();
      if (!evicted) break;
    }
  }
}

function addCacheBytes(delta) {
  _cacheBytes += delta;
  if (_cacheBytes < 0) _cacheBytes = 0;
}

function getLessonCache() { return _lessonCache; }
function getCacheSize() { return _cacheSize; }
function setCacheSize(n) { _cacheSize = n; }
function getCacheBytes() { return _cacheBytes; }
function getMaxCacheEntries() { return MAX_CACHE_ENTRIES; }
function getMaxCacheBytes() { return MAX_CACHE_BYTES; }
function getCompilingNow() { return _compilingNow; }
function getRetryAfterSeconds() { return RETRY_AFTER_SECONDS; }

module.exports = {
  validateCachedIr:     validateCachedIr,
  tryReadDiskCache:     tryReadDiskCache,
  writeDiskCache:       writeDiskCache,
  acquireCompileSlot:   acquireCompileSlot,
  releaseCompileSlot:   releaseCompileSlot,
  wouldCompileBeQueued: wouldCompileBeQueued,
  evictOldest:          evictOldest,
  ensureRoomFor:        ensureRoomFor,
  computeEntryBytes:    computeEntryBytes,
  addCacheBytes:        addCacheBytes,
  getLessonCache:       getLessonCache,
  getCacheSize:         getCacheSize,
  setCacheSize:         setCacheSize,
  getCacheBytes:        getCacheBytes,
  getMaxCacheEntries:   getMaxCacheEntries,
  getMaxCacheBytes:     getMaxCacheBytes,
  getCompilingNow:      getCompilingNow,
  getRetryAfterSeconds: getRetryAfterSeconds
};
