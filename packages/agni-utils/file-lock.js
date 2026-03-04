'use strict';

/**
 * Advisory file locking for flat-file JSON storage on Raspberry Pi.
 *
 * Strategy: exclusive-create a .lock file via fs.writeFileSync with 'wx' flag.
 * If the lock exists and is older than STALE_TIMEOUT_MS, force-remove and
 * re-acquire (handles crash recovery on Pi hardware).
 *
 * Zero npm dependencies — critical for ARM cross-compilation on the Pi.
 */

const fs = require('fs');
const { createLogger } = require('./logger');
const log = createLogger('file-lock');

const STALE_TIMEOUT_MS = 10000;
const RETRY_INTERVAL_MS = 50;
const MAX_RETRIES = 300;

function lockPath(filePath) {
  return filePath + '.lock';
}

function isStale(lockFile) {
  try {
    var stat = fs.statSync(lockFile);
    return (Date.now() - stat.mtimeMs) > STALE_TIMEOUT_MS;
  } catch (_e) {
    return false;
  }
}

function acquireSync(filePath) {
  var lp = lockPath(filePath);
  var content = JSON.stringify({ pid: process.pid, ts: Date.now() });

  for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      fs.writeFileSync(lp, content, { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (isStale(lp)) {
        log.warn('Removing stale lock: ' + lp);
        try { fs.unlinkSync(lp); } catch (_e) { /* race ok */ }
        continue;
      }
      var wait = RETRY_INTERVAL_MS + Math.floor(Math.random() * RETRY_INTERVAL_MS);
      try { var _b = new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(_b, 0, 0, wait); }
      catch (_e2) { var _end = Date.now() + wait; while (Date.now() < _end) { /* fallback */ } }
    }
  }
  throw new Error('Could not acquire lock after ' + MAX_RETRIES + ' attempts: ' + lp);
}

function releaseSync(filePath) {
  try { fs.unlinkSync(lockPath(filePath)); } catch (_e) { /* already released */ }
}

function withLockSync(filePath, fn) {
  acquireSync(filePath);
  try {
    return fn();
  } finally {
    releaseSync(filePath);
  }
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function acquire(filePath) {
  var lp = lockPath(filePath);
  var content = JSON.stringify({ pid: process.pid, ts: Date.now() });

  for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      fs.writeFileSync(lp, content, { flag: 'wx' });
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (isStale(lp)) {
        log.warn('Removing stale lock: ' + lp);
        try { fs.unlinkSync(lp); } catch (_e) { /* race ok */ }
        continue;
      }
      await sleep(RETRY_INTERVAL_MS + Math.floor(Math.random() * RETRY_INTERVAL_MS));
    }
  }
  throw new Error('Could not acquire lock after ' + MAX_RETRIES + ' attempts: ' + lp);
}

async function withLock(filePath, fn) {
  await acquire(filePath);
  try {
    return await fn();
  } finally {
    releaseSync(filePath);
  }
}

module.exports = { acquireSync, releaseSync, withLockSync, acquire, withLock };
